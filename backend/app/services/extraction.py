import json
import re
import sqlglot
from sqlglot import exp
from sqlalchemy.orm import Session
from .. import models, schemas
from .provider import get_active_provider_credentials
import litellm
import os

def extract_json(raw: str) -> dict:
    """Robustly extract a JSON object from any LLM response, regardless of
    whether it is wrapped in markdown fences, preceded by prose, etc."""
    if not raw:
        return {}
    # 1. Try direct parse first (ideal case)
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass
    # 2. Pull out the first {...} block from the string (handles prose wrappers)
    match = re.search(r'\{[\s\S]*\}', raw)
    if match:
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError:
            pass
    # 3. Strip any code fence markers and retry
    cleaned = re.sub(r'```[a-zA-Z]*', '', raw).replace('```', '').strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass
    # 4. Give up — return empty dict so caller can handle gracefully
    return {}

def call_llm_for_json(model_name: str, messages: list) -> str:
    """Calls LiteLLM with response_format=json_object if the model supports it,
    otherwise falls back to a plain call. Returns the raw content string."""
    # Try structured JSON mode first
    try:
        response = litellm.completion(
            model=model_name,
            messages=messages,
            response_format={"type": "json_object"}
        )
        return response.choices[0].message.content or "{}"
    except Exception as e:
        err = str(e).lower()
        # If the error is about unsupported response_format, retry without it
        if any(kw in err for kw in [
            "response_format", "json_object", "unsupported", "not support",
            "invalid", "parameter", "tool_choice"
        ]):
            try:
                response = litellm.completion(
                    model=model_name,
                    messages=messages
                )
                return response.choices[0].message.content or "{}"
            except Exception as e2:
                print(f"LLM call failed on fallback: {e2}")
                raise e2
        print(f"LLM call failed: {e}")
        raise e

def parse_sql(sql: str, dialect: str) -> dict:
    """Uses sqlglot to extract fully-qualified table names, columns, and aggregates.
    CTE (Common Table Expression) aliases are excluded from the table list because
    they are not real physical tables — only the base tables they reference matter.
    """
    parsed = {"tables": [], "columns": [], "joins": [], "aggregates": []}

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
        parsed_tree = sqlglot.parse_one(sql, read=sqlglot_dialect)

        # 1. Collect all CTE alias names so we can exclude them from table results
        cte_names = set()
        for cte in parsed_tree.find_all(exp.CTE):
            if cte.alias:
                cte_names.add(cte.alias.lower())

        # 2. Extract fully-qualified table names (catalog.schema.table)
        seen_tables = set()
        for table in parsed_tree.find_all(exp.Table):
            # Skip CTE references — they are not physical tables
            if table.name.lower() in cte_names:
                continue

            # Build full qualified name from available parts
            parts = []
            if table.catalog:
                parts.append(table.catalog)
            if table.db:
                parts.append(table.db)
            if table.name:
                parts.append(table.name)

            full_name = ".".join(parts) if parts else table.name
            if full_name and full_name not in seen_tables:
                seen_tables.add(full_name)
                parsed["tables"].append(full_name)

        # 3. Extract column names
        seen_cols = set()
        for column in parsed_tree.find_all(exp.Column):
            if column.name and column.name not in seen_cols:
                seen_cols.add(column.name)
                parsed["columns"].append(column.name)

    except Exception as e:
        print(f"Error parsing SQL: {e}")

    return parsed

def _bind_provider_credentials(creds: dict) -> str:
    """Helper to dynamically bind active provider credentials for LiteLLM calls."""
    provider_type = creds["provider_type"].lower()
    api_key = creds["api_key"]
    model_name = creds["model_name"]
    
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


def generate_draft_intelligence(db: Session, vault_id: str, title: str, description: str, sql_query: str, sql_comments: str, dialect: str) -> dict:
    """Calls LiteLLM to generate the draft intelligence JSON based on SQL, comments, and playbooks without saving the query."""
    creds = get_active_provider_credentials(db)
    if not creds:
        raise ValueError("No active provider configured.")
        
    model_name = _bind_provider_credentials(creds)

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

You MUST return ONLY a valid raw JSON object. No markdown, no prose, no explanation — just the JSON.
Format:
{{
  "intent": "Explain why this query exists, what business problem it solves, and how it relates to the stored rules",
  "business_rules": ["Specific rules or heuristics applied from playbooks or query logic"],
  "schema_entities": ["schema.table_name or table_name"],
  "transformations": ["Specific metric calculation steps, formulas, or join logic found in the SQL or comments"],
  "ambiguities": ["Any missing info or unresolved logical questions"]
}}
"""

    parsed_data = parse_sql(sql_query, dialect)
    user_prompt = (
        f"SQL Title: {title}\n"
        f"SQL Description: {description}\n"
        f"Dialect: {dialect}\n"
        f"SQL Query:\n{sql_query}\n"
        f"Analyst Comments / Notes:\n{sql_comments}\n"
        f"Auto-parsed tables & columns: {json.dumps(parsed_data)}"
    )

    try:
        content = call_llm_for_json(model_name, [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ])
    except Exception as e:
        print(f"Draft intelligence LLM call failed, using fallback: {e}")
        content = "{}"

    parsed_json = extract_json(content)

    if not parsed_json:
        # Hard fallback — at least preserve what sqlglot found
        return {
            "intent": description or f"Query: {title}",
            "business_rules": [],
            "schema_entities": parsed_data.get("tables", []),
            "transformations": [],
            "ambiguities": ["AI extraction could not parse a structured response. Please fill in the fields manually."]
        }

    # Ensure all expected keys exist
    for k in ["intent", "business_rules", "schema_entities", "transformations", "ambiguities"]:
        if k not in parsed_json:
            parsed_json[k] = [] if k != "intent" else ""

    # Merge sqlglot-detected tables into schema_entities if AI missed any
    for tbl in parsed_data.get("tables", []):
        if tbl and tbl not in parsed_json["schema_entities"]:
            parsed_json["schema_entities"].append(tbl)

    return parsed_json

def _build_organizer_prompt(current_docs: list, approved_intelligence: dict) -> tuple:
    """Shared prompt builder for both preview and actual organize calls."""
    system_prompt = f"""
You are the SlothQuery Knowledge Organizer Agent.
You receive newly approved intelligence extracted from a SQL query.
You also receive the vault's existing documentation (Rules, Schemas, Notes).

Your job:
1. type=business_rules: Extract only concrete, reusable business rules (filters, conditions, thresholds, inclusion/exclusion logic). Skip generic statements.
2. type=table_schemas: For each physical table referenced, create or update a schema entry with:
   - Full qualified name: catalog.schema.table (e.g. icebergrest.gold.sku_analytics_national)
   - Columns found or mentioned in the SQL/comments
   - What kind of data is stored in this table
   - Which business metrics this table is used to calculate
3. type=analyst_notes: Any analyst notes, caveats, known issues, or metric definitions.

DEDUPLICATION RULES (CRITICAL):
- Before creating a new document, check if a matching one already exists by name or topic.
- If it exists, update it by MERGING new info only. Do NOT duplicate existing content.
- Only add net-new information. Do not restate what is already in the existing content.
- If nothing new to add to an existing doc, omit it entirely from the updates list.

Current Documents in Vault:
{json.dumps(current_docs, indent=2) if current_docs else "No existing documents. Create new ones as needed."}

You MUST return ONLY a valid raw JSON object. No markdown, no prose.
The "type" field MUST be one of: business_rules, table_schemas, analyst_notes
Format:
{{
   "updates": [
       {{ "action": "update", "document_id": "existing_id", "name": "Document Name", "type": "business_rules", "new_content": "Full merged content" }},
       {{ "action": "create", "name": "New Document Name", "type": "table_schemas", "content": "Full content" }}
   ]
}}
"""
    user_prompt = f"Newly Approved Intelligence from Query:\n{json.dumps(approved_intelligence, indent=2)}"
    return system_prompt, user_prompt


def _normalize_playbook_type(raw_type: str) -> str:
    """Normalize any LLM type variation to the exact DB enum values."""
    t = (raw_type or "").lower().strip()
    if t in ("schema", "table_schema", "table_schemas", "schemas"):
        return "table_schemas"
    if t in ("note", "analyst_note", "analyst_notes", "notes"):
        return "analyst_notes"
    # Default: treat anything else as business_rules
    return "business_rules"


def preview_organize_intelligence(db: Session, vault_id: str, approved_intelligence: dict) -> list:
    """
    Runs the organizer LLM call and returns the planned updates as a list
    for the frontend to display as a preview WITHOUT writing anything to the DB.
    """
    creds = get_active_provider_credentials(db)
    if not creds:
        return []

    model_name = _bind_provider_credentials(creds)

    playbooks = db.query(models.Playbook).filter(models.Playbook.vault_id == vault_id).all()
    current_docs = [{"id": pb.id, "name": pb.name, "type": pb.playbook_type, "content": pb.content} for pb in playbooks]

    system_prompt, user_prompt = _build_organizer_prompt(current_docs, approved_intelligence)

    from fastapi import HTTPException
    try:
        content = call_llm_for_json(model_name, [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ])
    except Exception as e:
        print(f"Playbook preview LLM call failed: {e}")
        raise HTTPException(
            status_code=502,
            detail=f"LLM Provider Error: {str(e)}"
        )

    instructions = extract_json(content)
    if not instructions:
        raise HTTPException(
            status_code=502,
            detail="Failed to parse structured JSON updates from the LLM provider."
        )

    return instructions.get("updates", [])


def organize_intelligence(db: Session, vault_id: str, approved_intelligence: dict):
    """
    Takes approved intelligence, fetches existing playbooks, and organizes/merges
    the new rules and schema definitions into them with deduplication.
    Only called when the user explicitly confirms via the frontend Step 2 modal.
    """
    creds = get_active_provider_credentials(db)
    if not creds:
        return

    model_name = _bind_provider_credentials(creds)

    playbooks = db.query(models.Playbook).filter(models.Playbook.vault_id == vault_id).all()
    current_docs = [{"id": pb.id, "name": pb.name, "type": pb.playbook_type, "content": pb.content} for pb in playbooks]

    system_prompt, user_prompt = _build_organizer_prompt(current_docs, approved_intelligence)

    try:
        content = call_llm_for_json(model_name, [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ])
    except Exception as e:
        print(f"Organizer Agent failed: {e}")
        return

    instructions = extract_json(content)
    if not instructions:
        print("Organizer Agent: could not parse response, skipping")
        return

    updates = instructions.get("updates", [])
    for update in updates:
        if update.get("action") == "update":
            pb = db.query(models.Playbook).filter(models.Playbook.id == update.get("document_id")).first()
            if pb:
                pb.content = update.get("new_content", pb.content)
                if update.get("name"):
                    pb.name = update.get("name")
        elif update.get("action") == "create":
            new_pb = models.Playbook(
                vault_id=vault_id,
                name=update.get("name", "Generated Playbook"),
                playbook_type=_normalize_playbook_type(update.get("type", "business_rules")),
                content=update.get("content", "")
            )
            db.add(new_pb)
    try:
        db.commit()
    except Exception as e:
        print(f"Organizer Agent failed to commit: {e}")
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
