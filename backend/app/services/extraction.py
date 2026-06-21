import json
import sqlglot
from sqlglot import exp
from sqlalchemy.orm import Session
from .. import models, schemas
from .provider import get_active_provider_credentials
import litellm
import os

def parse_sql(sql: str, dialect: str) -> dict:
    """Uses sqlglot to extract tables, columns, joins and aggregates."""
    parsed = {"tables": [], "columns": [], "joins": [], "aggregates": []}
    
    # Map dialect names to match SQLGlot expectations
    dialect_map = {
        "postgresql": "postgres",
        "postgres": "postgres",
        "bigquery": "bigquery",
        "snowflake": "snowflake",
        "trino": "trino",
        "redshift": "redshift"
    }
    sqlglot_dialect = dialect_map.get(dialect.lower(), None) if dialect else None

    try:
        # Provide dialect if given, default to standard
        parsed_tree = sqlglot.parse_one(sql, read=sqlglot_dialect)
        
        for table in parsed_tree.find_all(exp.Table):
            parsed["tables"].append(table.name)
            
        for column in parsed_tree.find_all(exp.Column):
            parsed["columns"].append(column.name)
            
        parsed["tables"] = list(set(parsed["tables"]))
        parsed["columns"] = list(set(parsed["columns"]))
        
    except Exception as e:
        # Fallback if unparseable
        print(f"Error parsing SQL: {e}")
        
    return parsed

def generate_draft_intelligence(db: Session, vault_id: str, title: str, description: str, sql_query: str, sql_comments: str, dialect: str) -> dict:
    """Calls LiteLLM to generate the draft intelligence JSON based on SQL, comments, and playbooks without saving the query."""
    creds = get_active_provider_credentials(db)
    if not creds:
        raise ValueError("No active provider configured.")
        
    provider_type = creds["provider_type"].lower()
    model_name = creds["model_name"]
    api_key = creds["api_key"]
    
    # Bind environment keys and litellm attributes dynamically
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

    # Fetch stored playbooks/rules in this vault to establish relations
    playbooks = db.query(models.Playbook).filter(models.Playbook.vault_id == vault_id).all()
    playbooks_context = ""
    for pb in playbooks:
        playbooks_context += f"\n- Rule Name: {pb.name} ({pb.playbook_type})\nContent:\n{pb.content}\n"

    system_prompt = f"""
    You are the SlothQuery AI Extraction Agent.
    Your goal is to dig into the SQL query, description, SQL comments, and the following stored business playbooks and rules in this vault to extract organizational meaning.
    
    ### Stored Business Playbooks/Rules in Vault:
    {playbooks_context if playbooks_context else "No playbooks currently defined in this vault."}
    
    Return ONLY a raw JSON object with no markdown formatting.
    Format:
    {{
      "intent": "Explain why this query exists, what business problem it solves, and how it relates to the stored rules",
      "business_rules": ["Specific rules or heuristics applied from playbooks or query logic"],
      "schema_entities": ["schema.table_name"],
      "transformations": ["Specific metric calculation steps or joins logic"],
      "ambiguities": ["Any missing info or unresolved logical questions"]
    }}
    """
    
    parsed_data = parse_sql(sql_query, dialect)
    user_prompt = f"SQL Title: {title}\nSQL Description: {description}\nSQL: {sql_query}\nComments: {sql_comments}\nParsed Data: {json.dumps(parsed_data)}"
    
    try:
        response = litellm.completion(
            model=model_name,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            response_format={ "type": "json_object" }
        )
        content = response.choices[0].message.content
    except Exception as e:
        print(f"LiteLLM call failed: {e}")
        content = "{}"
        
    try:
        if content.startswith("```json"):
            content = content.replace("```json", "").replace("```", "").strip()
        elif content.startswith("```"):
            content = content.replace("```", "").strip()
            
        parsed_json = json.loads(content)
        # Ensure correct keys exist
        for k in ["intent", "business_rules", "schema_entities", "transformations", "ambiguities"]:
            if k not in parsed_json:
                parsed_json[k] = [] if k != "intent" else ""
        return parsed_json
    except json.JSONDecodeError:
        return {
            "intent": f"Analyzed query: {description}",
            "business_rules": [],
            "schema_entities": parsed_data.get("tables", []),
            "transformations": [],
            "ambiguities": ["Failed to parse AI provider JSON model output"]
        }

def organize_intelligence(db: Session, vault_id: str, approved_intelligence: dict):
    """
    Takes approved intelligence, fetches existing playbooks, and organizes/merges
    the new rules and schema definitions into them.
    """
    creds = get_active_provider_credentials(db)
    if not creds:
        return # Fallback if no provider
        
    model_name = creds["model_name"]
    if creds["provider_type"].lower() == "openrouter" and not model_name.startswith("openrouter/"):
        model_name = f"openrouter/{model_name}"

    playbooks = db.query(models.Playbook).filter(models.Playbook.vault_id == vault_id).all()
    current_docs = [{"id": pb.id, "name": pb.name, "type": pb.playbook_type, "content": pb.content} for pb in playbooks]
    
    system_prompt = f"""
    You are the SlothQuery Knowledge Organizer Agent.
    You will receive some newly approved 'intelligence' extracted from a query (business rules, schemas, transformations).
    You will also receive the current existing documentation playbooks/schemas.
    Your job is to figure out the best place to put the new intelligence to keep the knowledge base perfectly organized.
    
    Current Documents:
    {json.dumps(current_docs, indent=2) if current_docs else "No current documents."}
    
    Return ONLY a raw JSON object detailing the updates to make.
    Format:
    {{
       "updates": [
           {{ "action": "update", "document_id": "id_here", "new_content": "Full revised content of the document including new rules" }},
           {{ "action": "create", "name": "New Document Name", "type": "playbook|schema", "content": "Full content of new document" }}
       ]
    }}
    """
    
    user_prompt = f"New Approved Intelligence:\n{json.dumps(approved_intelligence, indent=2)}"
    
    try:
        response = litellm.completion(
            model=model_name,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            response_format={ "type": "json_object" }
        )
        content = response.choices[0].message.content
        if content.startswith("```json"):
            content = content.replace("```json", "").replace("```", "").strip()
        elif content.startswith("```"):
            content = content.replace("```", "").strip()
            
        instructions = json.loads(content)
        updates = instructions.get("updates", [])
        
        for update in updates:
            if update.get("action") == "update":
                pb = db.query(models.Playbook).filter(models.Playbook.id == update.get("document_id")).first()
                if pb:
                    pb.content = update.get("new_content", pb.content)
            elif update.get("action") == "create":
                new_pb = models.Playbook(
                    vault_id=vault_id,
                    name=update.get("name", "Generated Playbook"),
                    playbook_type=update.get("type", "playbook"),
                    content=update.get("content", "")
                )
                db.add(new_pb)
        db.commit()
    except Exception as e:
        print(f"Organizer Agent failed: {e}")
        db.rollback()

def run_extraction_pipeline(db: Session, query_id: str):
    """Legacy/Fallback orchestrator (mostly replaced by Human-in-the-loop)."""
    query = db.query(models.Query).filter(models.Query.id == query_id).first()
    if not query:
        return
        
    context_json = generate_draft_intelligence(
        db, query.vault_id, query.title, query.description or "", 
        query.sql_query, query.sql_comments or "", query.dialect
    )
    
    context = db.query(models.QueryContext).filter(models.QueryContext.query_id == query_id).first()
    if not context:
        context = models.QueryContext(
            query_id=query.id,
            context_json=context_json,
            approval_status="draft"
        )
        db.add(context)
    else:
        context.context_json = context_json
        
    db.commit()
    return context
