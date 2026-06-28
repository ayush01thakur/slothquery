import json
import litellm
import os
import re
import sqlglot
from datetime import datetime
from sqlalchemy.orm import Session
from .. import models
from .provider import get_active_provider_credentials
from .retrieval import assemble_context

def validate_sql_blocks(content: str, dialect: str) -> str:
    """
    Parses any SQL code blocks in the response using sqlglot for validation.
    If a syntax error is found, it appends a helpful warning block below the SQL code block.
    """
    mapping = {
        "postgresql": "postgres",
        "snowflake": "snowflake",
        "bigquery": "bigquery",
        "trino": "trino",
        "redshift": "redshift"
    }
    sg_dialect = mapping.get(dialect.lower(), dialect.lower())
    
    pattern = re.compile(r"```sql\s+(.*?)\s*```", re.DOTALL | re.IGNORECASE)
    
    def replacer(match):
        sql_text = match.group(1)
        original_block = match.group(0)
        try:
            sqlglot.parse_one(sql_text, read=sg_dialect)
            return original_block + f"\n\n> [!NOTE]\n> *✓ Syntactically validated for **{dialect.upper()}**.*"
        except Exception as e:
            error_details = str(e)
            return original_block + (
                f"\n\n> [!WARNING]\n"
                f"> **Syntax warning for {dialect.upper()}**:\n"
                f"> ```text\n{error_details}\n```\n"
                f"> *Our response is syntactically validated for {dialect.upper()}; if you see an issue or need the query in another dialect format, please select another **Dialect** in the input settings and ask me to generate it again.*"
            )
            
    return pattern.sub(replacer, content)


def _configure_provider(creds):
    """Internal helper: configures litellm and env vars for the active provider. Returns model_name."""
    provider_type = creds["provider_type"].lower()
    model_name = creds["model_name"]
    api_key = creds["api_key"]

    if provider_type == "openai":
        litellm.api_key = api_key
        os.environ["OPENAI_API_KEY"] = api_key
    elif provider_type == "anthropic":
        litellm.anthropic_key = api_key
        os.environ["ANTHROPIC_API_KEY"] = api_key
    elif provider_type == "google":
        litellm.gemini_key = api_key
        os.environ["GEMINI_API_KEY"] = api_key
        if not model_name.startswith("gemini/"):
            model_name = f"gemini/{model_name}"
    elif provider_type == "groq":
        litellm.groq_key = api_key
        os.environ["GROQ_API_KEY"] = api_key
        if not model_name.startswith("groq/"):
            model_name = f"groq/{model_name}"
    elif provider_type == "deepseek":
        os.environ["DEEPSEEK_API_KEY"] = api_key
        if not model_name.startswith("deepseek/"):
            model_name = f"deepseek/{model_name}"
    elif provider_type == "openrouter":
        litellm.openrouter_key = api_key
        os.environ["OPENROUTER_API_KEY"] = api_key
        if not model_name.startswith("openrouter/"):
            model_name = f"openrouter/{model_name}"
    else:
        litellm.api_key = api_key

    return model_name


def _build_system_prompt(context):
    """Internal helper: builds the system prompt from assembled context."""
    return f"""
    You are SlothQuery, an organizational intelligence AI acting as a senior analytics engineer.
    You are having a conversation with a user to help them build, refine, and debug SQL queries.

    ### Retrieved Context (Queries & Extracted Metadata)
    {json.dumps(context["semantic_queries"], indent=2)}

    ### Business Rules & Playbooks
    {json.dumps(context["playbooks"], indent=2)}

    ### Conversational & Editing Persona (CRITICAL):
    1. CONVERSE FIRST: You are a collaborative chat system, not an output thrower. Think, evaluate, and clarify.
    2. CLARIFICATION VS. DIRECT GENERATION:
       - When the user asks for a query: If the request has any ambiguities (e.g. which vaults, what date range, handling of combo SKUs, which subcategories to competing universe, missing filter inputs), do NOT just throw a query. First, ASK the user clarifying questions to get on the right track.
       - Once the user answers your clarification, or if there is zero ambiguity, provide the query.
       - If the user is asking to *understand* a concept (e.g. "how do I calculate weighted availability?" or "explain market share"): Give a theoretical explanation with a small modular CTE/code snippet showing the concept instead of writing the entire SQL query.
    3. ACKNOWLEDGE & COLLABORATE: Always start your response conversationally. Acknowledge their exact request (e.g., "Ah, I understand! You want to group by region instead," or "Got it, let's remove that column to fix the error.").
    4. BE AN EDITOR: The user relies on you to alter and edit their queries. If they say "change X to Y" or "I don't need Z", you MUST directly apply those edits to the query.
    5. EXPLAIN CHANGES: Briefly explain exactly what you changed (or how you fixed an error) before providing the updated SQL block.

    ### Query Generation Rules (CRITICAL):
    1. SCHEMA TRACING: Before writing any SQL, trace every single column you intend to select to its physical table schema defined in the 'table_schemas' playbooks. Never assume a column exists in a table unless it is explicitly listed in its table schema.
    2. METRIC FORMULAS: Check the 'business_rules' playbooks for formulas. If a metric (like 'Revenue' or 'Availability') is defined as a formula of other columns, you MUST compute it using the formula in your SQL query (e.g., `avg_price * units_sold_per_day` or `stores_with_availability / stores_carrying_sku`) instead of referencing the metric name as a raw column.
    3. DIMENSION TRACING: If the user asks for regional or city-level metrics, check which tables contain regional/city columns (e.g. `region` or `city` is in `sku_analytics_city`, not `sku_analytics_national`). You must join the correct table for regional metrics.
    4. REUSABLE PLAYBOOK ALIGNMENT: You must read, respect, and apply all business rules, playbooks, and analyst notes retrieved in the context above.
    5. STRICT SCHEMA FIDELITY: Never invent tables, columns, metrics, or business rules. Use full qualified table names as defined in the schemas.
    6. TRACE & PLAN: In your text response before the SQL block, write a brief bulleted "Trace & Plan" explaining:
       - What tables/schemas you are using (verifying that they contain the columns).
       - What formulas/rules you are applying from the playbooks.
    7. SQL FORMATTING: Format all SQL queries inside triple backtick code blocks like ```sql ... ```. Use **bold** for key terms in your text responses. Do NOT use raw markdown asterisks in plain sentences — only use them for actual bold/italic formatting.
    """


_EMPTY_KB_GREETING = (
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

    model_name = _configure_provider(creds)
        
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
    has_queries = bool(context.get("semantic_queries"))
    has_playbooks = bool(context.get("playbooks"))

    if not has_queries and not has_playbooks:
        ai_msg = models.ChatMessage(chat_id=chat.id, role="assistant", content=_EMPTY_KB_GREETING)
        db.add(ai_msg)
        chat.last_interacted_at = datetime.utcnow()
        db.commit()
        return {"role": "assistant", "content": _EMPTY_KB_GREETING}
    # --- End empty knowledge base guard ---

    system_prompt = _build_system_prompt(context)
    
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
    
    # 3. Validate generated SQL using SQLGlot if SQL blocks exist
    dialect = "snowflake"
    if " (Use dialect: " in message:
        try:
            dialect = message.split(" (Use dialect: ")[1].split(")")[0]
        except Exception:
            pass
            
    reply_content = validate_sql_blocks(reply_content, dialect)
    
    # 4. Save AI message
    ai_msg = models.ChatMessage(chat_id=chat.id, role="assistant", content=reply_content)
    db.add(ai_msg)
    
    # Update chat interaction time
    chat.last_interacted_at = datetime.utcnow()
    
    db.commit()
    
    return {"role": "assistant", "content": reply_content}


def stream_chat_message(db: Session, chat_id: str, vault_ids, message: str):
    """Generator that yields SSE events for streaming chat responses.
    
    Performs the same logic as process_chat_message:
    - Saves user message
    - Assembles retrieval context
    - Auto-names chat
    - Handles empty KB guard
    
    But streams the LLM response token-by-token via Server-Sent Events.
    SQL validation and DB persistence happen after the full stream completes.
    """
    chat = db.query(models.Chat).filter(models.Chat.id == chat_id).first()
    if not chat:
        yield f"data: {json.dumps({'error': 'Chat not found'})}\n\n"
        return

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
        yield f"data: {json.dumps({'error': 'No active provider configured. Please add a provider in Settings.'})}\n\n"
        return

    model_name = _configure_provider(creds)

    # Auto-name chat on the user's first message
    existing_msg_count = db.query(models.ChatMessage).filter(
        models.ChatMessage.chat_id == chat_id
    ).count()
    if existing_msg_count <= 1 and chat.title == "New Chat":
        clean_msg = message
        if " (Use dialect:" in message:
            clean_msg = message.split(" (Use dialect:")[0]
        sliced_title = clean_msg[:40] + "..." if len(clean_msg) > 40 else clean_msg
        chat.title = sliced_title
        db.commit()

    # 1. Save user message
    user_msg = models.ChatMessage(chat_id=chat.id, role="user", content=message)
    db.add(user_msg)
    db.commit()

    # 2. Assemble context (retrieval pipeline — decomposition, semantic search, playbooks)
    context = assemble_context(db, active_vault_ids, message)

    # --- Empty knowledge base guard ---
    has_queries = bool(context.get("semantic_queries"))
    has_playbooks = bool(context.get("playbooks"))

    if not has_queries and not has_playbooks:
        ai_msg = models.ChatMessage(chat_id=chat.id, role="assistant", content=_EMPTY_KB_GREETING)
        db.add(ai_msg)
        chat.last_interacted_at = datetime.utcnow()
        db.commit()
        yield f"data: {json.dumps({'done': True, 'content': _EMPTY_KB_GREETING})}\n\n"
        return

    # 3. Build system prompt with assembled context
    system_prompt = _build_system_prompt(context)

    # Prepare history
    history = [{"role": "system", "content": system_prompt}]
    db_messages = db.query(models.ChatMessage).filter(
        models.ChatMessage.chat_id == chat_id
    ).order_by(models.ChatMessage.created_at).limit(10).all()
    for m in db_messages:
        history.append({"role": m.role, "content": m.content})

    # 4. Stream LLM completion
    try:
        response = litellm.completion(
            model=model_name,
            messages=history,
            stream=True
        )

        full_content = ""
        for chunk in response:
            delta = chunk.choices[0].delta
            if hasattr(delta, "content") and delta.content:
                token = delta.content
                full_content += token
                yield f"data: {json.dumps({'token': token})}\n\n"

        if not full_content:
            full_content = "I'm sorry, I received an empty response from the AI provider. Please try again."

        # 5. Validate SQL blocks after full response is collected
        dialect = "snowflake"
        if " (Use dialect: " in message:
            try:
                dialect = message.split(" (Use dialect: ")[1].split(")")[0]
            except Exception:
                pass

        validated_content = validate_sql_blocks(full_content, dialect)

        # 6. Save validated assistant message to DB
        ai_msg = models.ChatMessage(chat_id=chat.id, role="assistant", content=validated_content)
        db.add(ai_msg)
        chat.last_interacted_at = datetime.utcnow()
        db.commit()

        # 7. Send final event with validated content (may include SQL validation notes)
        yield f"data: {json.dumps({'done': True, 'content': validated_content})}\n\n"

    except Exception as e:
        error_content = f"Error: Failed to generate response from LLM provider. Details: {str(e)}"
        ai_msg = models.ChatMessage(chat_id=chat.id, role="assistant", content=error_content)
        db.add(ai_msg)
        chat.last_interacted_at = datetime.utcnow()
        db.commit()
        yield f"data: {json.dumps({'error': error_content})}\n\n"

