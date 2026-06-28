import json
import os
import litellm
from sqlalchemy.orm import Session
from .. import models
from .vector_store import search_queries
from .provider import get_active_provider_credentials

def assemble_context(db: Session, vault_ids, user_message: str):
    """
    Retrieval-Time Context Assembly:
    1. Parse and decompose user request into atomic sub-queries using LLM
    2. Retrieve queries matching BGE semantic search for each sub-query
    3. Merge, deduplicate, and fetch top matching queries
    4. Retrieve playbooks/consolidated business rules across active vaults
    """
    if isinstance(vault_ids, str):
        vault_ids = [vault_ids]
    elif not vault_ids:
        vault_ids = []

    assembly = {
        "semantic_queries": [],
        "playbooks": []
    }
    
    # 1. Decompose the user message into atomic sub-queries to handle compound requests
    sub_queries = [user_message] # Default fallback
    
    creds = get_active_provider_credentials(db)
    if creds:
        provider_type = creds["provider_type"].lower()
        api_key = creds["api_key"]
        model_name = creds["model_name"]
        
        original_keys = {}
        env_keys = {
            "openai": "OPENAI_API_KEY",
            "anthropic": "ANTHROPIC_API_KEY",
            "google": "GEMINI_API_KEY",
            "groq": "GROQ_API_KEY",
            "deepseek": "DEEPSEEK_API_KEY",
            "openrouter": "OPENROUTER_API_KEY"
        }
        target_env = env_keys.get(provider_type)
        if target_env:
            original_keys[target_env] = os.environ.get(target_env)
            os.environ[target_env] = api_key
            
        if provider_type == "openai":
            litellm.api_key = api_key
        elif provider_type == "anthropic":
            litellm.anthropic_key = api_key
        elif provider_type == "google":
            litellm.gemini_key = api_key
            if not model_name.startswith("gemini/"):
                model_name = f"gemini/{model_name}"
        elif provider_type == "groq":
            litellm.groq_key = api_key
            if not model_name.startswith("groq/"):
                model_name = f"groq/{model_name}"
        elif provider_type == "deepseek":
            if not model_name.startswith("deepseek/"):
                model_name = f"deepseek/{model_name}"
        elif provider_type == "openrouter":
            litellm.openrouter_key = api_key
            if not model_name.startswith("openrouter/"):
                model_name = f"openrouter/{model_name}"
        else:
            litellm.api_key = api_key
            
        try:
            decomposition_prompt = f"""You are a query decomposition helper.
Given a user query requesting database/analytics logic, break it down into a list of simple, atomic search strings representing the distinct KPIs, metrics, or table requirements.
For example, if the query is: "regional brand level availability, revenue, paid share of voice, and listing status", break it down into:
["regional brand level availability", "regional brand level revenue", "paid and organic share of voice (SOV)", "regional listing status"]

User query: "{user_message}"

Respond ONLY with a clean JSON list of strings (maximum 4). No conversation, no markdown formatting, no code blocks."""
            
            response = litellm.completion(
                model=model_name,
                messages=[{"role": "user", "content": decomposition_prompt}],
                max_tokens=150
            )
            raw_content = response.choices[0].message.content.strip()
            if raw_content.startswith("```"):
                lines = raw_content.splitlines()
                if len(lines) >= 2:
                    if lines[0].startswith("```"):
                        lines = lines[1:]
                    if lines[-1].startswith("```"):
                        lines = lines[:-1]
                raw_content = "\n".join(lines).strip()
                
            parsed = json.loads(raw_content)
            if isinstance(parsed, list) and all(isinstance(x, str) for x in parsed):
                sub_queries = parsed
                print(f"Decomposed query into: {sub_queries}")
        except Exception as e:
            print(f"Query decomposition failed: {e}. Falling back to single query.")
        finally:
            for k, v in original_keys.items():
                if v is None:
                    os.environ.pop(k, None)
                else:
                    os.environ[k] = v
                    
    # 2. Semantic Search via ChromaDB for each sub-query
    all_results = []
    seen_ids = set()
    for sub_q in sub_queries:
        for v_id in vault_ids:
            vector_results = search_queries(v_id, sub_q, n_results=3)
            if vector_results and "ids" in vector_results and vector_results["ids"]:
                ids = vector_results["ids"][0]
                distances = vector_results.get("distances", [[]])[0] if vector_results.get("distances") else [0.0] * len(ids)
                for qid, dist in zip(ids, distances):
                    if qid not in seen_ids:
                        seen_ids.add(qid)
                        all_results.append((qid, dist))
                        
    # Sort by distance ascending (closer matches first)
    all_results.sort(key=lambda x: x[1])
    top_results = all_results[:6] # Grab up to 6 distinct relevant queries
    
    for qid, _ in top_results:
        q = db.query(models.Query).filter(models.Query.id == qid).first()
        if q and q.context:
            assembly["semantic_queries"].append({
                "title": q.title,
                "sql": q.sql_query,
                "context": q.context.context_json
            })
                
    # 3. Retrieve playbooks for all active vaults
    if vault_ids:
        playbooks = db.query(models.Playbook).filter(models.Playbook.vault_id.in_(vault_ids)).all()
        for pb in playbooks:
            include = False
            
            # If always_include is True, it is always loaded into prompt
            if getattr(pb, "always_include", False):
                include = True
            else:
                pb_type = pb.playbook_type
                pb_name_lower = pb.name.lower()
                pb_content_lower = pb.content.lower()
                
                # Check for requirement matching against sub-queries
                for sub_q in sub_queries:
                    sub_q_lower = sub_q.lower()
                    if pb_type == "table_schemas":
                        # Match table name e.g. "icebergrest.gold.sku_analytics_national Schema" -> "sku_analytics_national"
                        clean_name = pb_name_lower.replace("schema", "").strip()
                        # Also check if this table is referenced in any retrieved query schema_entities
                        in_retrieved = False
                        for sq in assembly["semantic_queries"]:
                            entities = sq.get("context", {}).get("schema_entities", [])
                            if any(clean_name in e.lower() for e in entities):
                                in_retrieved = True
                                break
                        if clean_name in sub_q_lower or in_retrieved:
                            include = True
                            break
                    else:
                        # For rules & notes: check if any keyword matches
                        keywords = ["availability", "revenue", "market share", "sov", "voice", "organic", "sponsored", "listing", "price", "combo"]
                        for kw in keywords:
                            if kw in sub_q_lower and (kw in pb_name_lower or kw in pb_content_lower):
                                include = True
                                break
                        if include:
                            break
            
            if include:
                assembly["playbooks"].append({
                    "name": pb.name,
                    "type": pb.playbook_type,
                    "content": pb.content,
                    "always_include": getattr(pb, "always_include", False)
                })
        
    return assembly
