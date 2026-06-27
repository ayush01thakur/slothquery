import json
import litellm
import os
from sqlalchemy.orm import Session
from .. import models
from .provider import get_active_provider_credentials
from .retrieval import assemble_context

def process_chat_message(db: Session, chat_id: str, vault_ids, message: str) -> dict:
    """Orchestrates the chat process with context assembly."""
    chat = db.query(models.Chat).filter(models.Chat.id == chat_id).first()
    if not chat:
        raise ValueError("Chat not found")
        
    # If vault_ids is provided, save it to the chat
    if vault_ids is not None:
        chat.vault_ids = vault_ids
        db.commit()
        
    active_vault_ids = chat.vault_ids or []
    if not active_vault_ids:
        all_vaults = db.query(models.Vault).all()
        active_vault_ids = [v.id for v in all_vaults]
        
    creds = get_active_provider_credentials(db)
    if not creds:
        raise ValueError("No active provider configured")
        
    provider_type = creds["provider_type"].lower()
    model_name = creds["model_name"]
    api_key = creds["api_key"]
    
    # Configure key environment variables and litellm attributes dynamically
    if provider_type == "openai":
        litellm.api_key = api_key
        os.environ["OPENAI_API_KEY"] = api_key
    elif provider_type == "anthropic":
        litellm.anthropic_key = api_key
        os.environ["ANTHROPIC_API_KEY"] = api_key
    elif provider_type == "google":
        litellm.gemini_key = api_key
        os.environ["GEMINI_API_KEY"] = api_key
    elif provider_type == "groq":
        litellm.groq_key = api_key
        os.environ["GROQ_API_KEY"] = api_key
    elif provider_type == "deepseek":
        os.environ["DEEPSEEK_API_KEY"] = api_key
    elif provider_type == "openrouter":
        litellm.openrouter_key = api_key
        os.environ["OPENROUTER_API_KEY"] = api_key
        if not model_name.startswith("openrouter/"):
            model_name = f"openrouter/{model_name}"
    else:
        litellm.api_key = api_key
        
    # Auto-name chat on the user's first message
    existing_msg_count = db.query(models.ChatMessage).filter(models.ChatMessage.chat_id == chat_id).count()
    if existing_msg_count <= 1 and chat.title == "New Chat":
        # Remove dialect instruction helper text from message first if present
        clean_msg = message
        if " (Use dialect:" in message:
            clean_msg = message.split(" (Use dialect:")[0]
        # Generate summary title based on cleaned first user query
        sliced_title = clean_msg[:40] + "..." if len(clean_msg) > 40 else clean_msg
        chat.title = sliced_title
        db.commit()

    # 1. Save user message
    user_msg = models.ChatMessage(chat_id=chat.id, role="user", content=message)
    db.add(user_msg)
    db.commit()
    
    # 2. Assemble context
    context = assemble_context(db, active_vault_ids, message)

    # --- Empty knowledge base guard ---
    # If there are no queries and no playbooks in the active vaults, the AI
    # has nothing grounded to draw from. Return a helpful onboarding message
    # instead of letting the LLM hallucinate or ask confusing SQL questions.
    has_queries = bool(context.get("semantic_queries"))
    has_playbooks = bool(context.get("playbooks"))

    if not has_queries and not has_playbooks:
        greeting = (
            "👋 Hey there! I'm SlothQuery — your organizational analytics assistant.\n\n"
            "It looks like your knowledge base is empty right now, so I don't have any "
            "queries, business rules, or schema context to work with yet.\n\n"
            "Here's how to get started:\n"
            "1. Go to **Knowledge Studio** in the left sidebar.\n"
            "2. Add your SQL queries, business rules, table schemas, or analyst notes.\n"
            "3. Once your knowledge base has some context, come back here and I'll be able to "
            "help you write precise, grounded SQL based on your organization's actual data.\n\n"
            "The more context you build, the smarter and more accurate my responses become. 🚀"
        )
        ai_msg = models.ChatMessage(chat_id=chat.id, role="assistant", content=greeting)
        db.add(ai_msg)
        from datetime import datetime
        chat.last_interacted_at = datetime.utcnow()
        db.commit()
        return {"role": "assistant", "content": greeting}
    # --- End empty knowledge base guard ---

    system_prompt = f"""
    You are SlothQuery, an organizational intelligence AI acting as a senior analytics engineer.
    You are having a conversation with a user to help them build, refine, and debug SQL queries.

    ### Retrieved Context (Queries & Extracted Metadata)
    {json.dumps(context["semantic_queries"], indent=2)}

    ### Business Rules & Playbooks
    {json.dumps(context["playbooks"], indent=2)}

    ### Conversational & Editing Persona (CRITICAL):
    1. CONVERSE FIRST: You are a collaborative chat system, not just a query generator. When the user asks for an edit, reports an error, or asks a question, NEVER just silently output a query.
    2. ACKNOWLEDGE & COLLABORATE: Always start your response conversationally. Acknowledge their exact request (e.g., "Ah, I understand! You want to group by region instead," or "Got it, let's remove that column to fix the error.").
    3. BE AN EDITOR: The user relies on you to alter and edit their queries. If they say "change X to Y" or "I don't need Z", you MUST directly apply those edits to the query.
    4. EXPLAIN CHANGES: Briefly explain exactly what you changed (or how you fixed an error) before providing the updated SQL block.
    5. ASK FOR CLARIFICATION: If an error is ambiguous, or if you need to know more about their specific database tables to fix a bug, ASK the user directly. Do not guess blindly if it risks breaking the query further.

    ### Query Generation Rules:
    - Base your SQL generation purely on the organizational context above.
    - Never invent tables, columns, metrics, or schemas.
    - Provide executable SQL using full schema names if defined in context.
    - Format all SQL queries inside triple backtick code blocks like ```sql ... ```.
    - Use **bold** for key terms in your text responses.
    - Do NOT use raw markdown asterisks in plain sentences — only use them for actual bold/italic formatting.
    """
    
    # Prepare history
    history = [{"role": "system", "content": system_prompt}]
    
    # Get last 10 messages from chat
    messages = db.query(models.ChatMessage).filter(models.ChatMessage.chat_id == chat_id).order_by(models.ChatMessage.created_at).limit(10).all()
    for m in messages:
        # Trim dialect instruct suffix from assistant display if present
        history.append({"role": m.role, "content": m.content})
        
    # Generate completion with robust error handling
    try:
        response = litellm.completion(
            model=model_name,
            messages=history
        )
        reply_content = response.choices[0].message.content
        if not reply_content:
            reply_content = "I'm sorry, I received an empty response from the AI provider. Please try again."
    except Exception as e:
        reply_content = f"Error: Failed to generate response from LLM provider. Details: {str(e)}"
    
    # 3. Save AI message
    ai_msg = models.ChatMessage(chat_id=chat.id, role="assistant", content=reply_content)
    db.add(ai_msg)
    
    # Update chat interaction time
    from datetime import datetime
    chat.last_interacted_at = datetime.utcnow()
    
    db.commit()
    
    return {"role": "assistant", "content": reply_content}
