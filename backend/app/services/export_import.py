import os
import zipfile
import json
from datetime import datetime
from sqlalchemy.orm import Session
from .. import models
from .vector_store import index_query

def export_knowledge_base(db: Session, export_dir: str):
    """Exports SQLite content to a .slothkb zip file without embeddings."""
    vaults = db.query(models.Vault).all()
    queries = db.query(models.Query).all()
    contexts = db.query(models.QueryContext).all()
    playbooks = db.query(models.Playbook).all()
    
    export_data = {
        "vaults": [{"id": v.id, "name": v.name, "description": v.description, "created_at": str(v.created_at)} for v in vaults],
        "queries": [{"id": q.id, "vault_id": q.vault_id, "title": q.title, "sql_query": q.sql_query, "sql_comments": q.sql_comments, "dialect": q.dialect} for q in queries],
        "contexts": [{"query_id": c.query_id, "context_json": c.context_json, "approval_status": c.approval_status} for c in contexts],
        "playbooks": [{"id": p.id, "vault_id": p.vault_id, "name": p.name, "playbook_type": p.playbook_type, "content": p.content} for p in playbooks]
    }
    
    os.makedirs(export_dir, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
    file_path = os.path.join(export_dir, f"slothquery_export_{timestamp}.slothkb")
    
    with zipfile.ZipFile(file_path, 'w', zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("queries_and_contexts.json", json.dumps(export_data, indent=2))
        
    return file_path

def import_knowledge_base(db: Session, slothkb_path: str):
    """Imports .slothkb file, populates SQLite with deduplication, and regenerates BGE embeddings locally."""
    with zipfile.ZipFile(slothkb_path, 'r') as zf:
        with zf.open("queries_and_contexts.json") as f:
            data = json.loads(f.read().decode("utf-8"))
            
    vault_id_map = {}  # maps old_vault_id -> active_vault_id
    query_id_map = {}  # maps old_query_id -> active_query_id
            
    # 1. Populate SQLite Database
    # Import Vaults
    for v_data in data.get("vaults", []):
        # Case-insensitive name match
        existing_vault = db.query(models.Vault).filter(
            models.Vault.name.ilike(v_data["name"])
        ).first()
        
        if existing_vault:
            existing_vault.description = v_data.get("description", "")
            vault_id_map[v_data["id"]] = existing_vault.id
        else:
            try:
                created_at = datetime.fromisoformat(v_data["created_at"]) if "created_at" in v_data else datetime.utcnow()
            except Exception:
                created_at = datetime.utcnow()
            vault = models.Vault(
                name=v_data["name"],
                description=v_data.get("description", ""),
                created_at=created_at
            )
            db.add(vault)
            db.flush() # Generate ID
            vault_id_map[v_data["id"]] = vault.id
            
    # Import Queries
    for q_data in data.get("queries", []):
        target_vault_id = vault_id_map.get(q_data["vault_id"])
        if not target_vault_id:
            continue
            
        # Case-insensitive title match inside target vault
        existing_query = db.query(models.Query).filter(
            models.Query.vault_id == target_vault_id,
            models.Query.title.ilike(q_data["title"])
        ).first()
        
        if existing_query:
            existing_query.sql_query = q_data["sql_query"]
            existing_query.sql_comments = q_data.get("sql_comments", "")
            existing_query.dialect = q_data.get("dialect", "Snowflake")
            query_id_map[q_data["id"]] = existing_query.id
        else:
            query = models.Query(
                vault_id=target_vault_id,
                title=q_data["title"],
                sql_query=q_data["sql_query"],
                sql_comments=q_data.get("sql_comments", ""),
                dialect=q_data.get("dialect", "Snowflake")
            )
            db.add(query)
            db.flush() # Generate ID
            query_id_map[q_data["id"]] = query.id
            
    # Import Contexts
    for c_data in data.get("contexts", []):
        target_query_id = query_id_map.get(c_data["query_id"])
        if not target_query_id:
            continue
            
        existing_context = db.query(models.QueryContext).filter(
            models.QueryContext.query_id == target_query_id
        ).first()
        
        if existing_context:
            existing_context.context_json = c_data["context_json"]
            existing_context.approval_status = c_data.get("approval_status", "approved")
        else:
            context = models.QueryContext(
                query_id=target_query_id,
                context_json=c_data["context_json"],
                approval_status=c_data.get("approval_status", "approved")
            )
            db.add(context)
            
    # Import Playbooks
    for p_data in data.get("playbooks", []):
        target_vault_id = vault_id_map.get(p_data["vault_id"])
        if not target_vault_id:
            continue
            
        # Match by name and type inside target vault
        existing_playbook = db.query(models.Playbook).filter(
            models.Playbook.vault_id == target_vault_id,
            models.Playbook.name.ilike(p_data["name"]),
            models.Playbook.playbook_type == p_data["playbook_type"]
        ).first()
        
        if existing_playbook:
            existing_playbook.content = p_data["content"]
        else:
            playbook = models.Playbook(
                vault_id=target_vault_id,
                name=p_data["name"],
                playbook_type=p_data["playbook_type"],
                content=p_data["content"]
            )
            db.add(playbook)
            
    db.commit()

    # 2. Iterate and trigger embedding regeneration
    for q in data.get("queries", []):
        target_vault_id = vault_id_map.get(q["vault_id"])
        target_query_id = query_id_map.get(q["id"])
        if not target_vault_id or not target_query_id:
            continue
            
        context = next((c for c in data.get("contexts", []) if c["query_id"] == q["id"]), None)
        
        doc_text = q["sql_query"]
        if context:
            doc_text += "\n" + json.dumps(context["context_json"])
            
        index_query(
            vault_id=target_vault_id,
            query_id=target_query_id,
            document_text=doc_text,
            metadata={"title": q["title"]}
        )
    
    # Return list of active vault IDs
    return {"active_vault_ids": list(vault_id_map.values())}

def analyze_knowledge_base(db: Session, slothkb_path: str):
    """Analyzes .slothkb file and returns counts of new vs duplicate elements."""
    with zipfile.ZipFile(slothkb_path, 'r') as zf:
        with zf.open("queries_and_contexts.json") as f:
            data = json.loads(f.read().decode("utf-8"))
            
    vault_id_map = {}
    duplicates = {
        "vaults": [],
        "queries": [],
        "playbooks": []
    }
    new_elements = {
        "vaults": [],
        "queries": [],
        "playbooks": []
    }
    
    # 1. Analyze Vaults
    for v_data in data.get("vaults", []):
        existing_vault = db.query(models.Vault).filter(
            models.Vault.name.ilike(v_data["name"])
        ).first()
        if existing_vault:
            duplicates["vaults"].append(v_data["name"])
            vault_id_map[v_data["id"]] = existing_vault.id
        else:
            new_elements["vaults"].append(v_data["name"])
            vault_id_map[v_data["id"]] = "new_vault"
            
    # 2. Analyze Queries
    for q_data in data.get("queries", []):
        target_vault_id = vault_id_map.get(q_data["vault_id"])
        if not target_vault_id:
            continue
        
        if target_vault_id == "new_vault":
            new_elements["queries"].append(q_data["title"])
        else:
            existing_query = db.query(models.Query).filter(
                models.Query.vault_id == target_vault_id,
                models.Query.title.ilike(q_data["title"])
            ).first()
            if existing_query:
                duplicates["queries"].append(q_data["title"])
            else:
                new_elements["queries"].append(q_data["title"])
                
    # 3. Analyze Playbooks
    for p_data in data.get("playbooks", []):
        target_vault_id = vault_id_map.get(p_data["vault_id"])
        if not target_vault_id:
            continue
            
        if target_vault_id == "new_vault":
            new_elements["playbooks"].append(f"{p_data['playbook_type']}: {p_data['name']}")
        else:
            existing_playbook = db.query(models.Playbook).filter(
                models.Playbook.vault_id == target_vault_id,
                models.Playbook.name.ilike(p_data["name"]),
                models.Playbook.playbook_type == p_data["playbook_type"]
            ).first()
            if existing_playbook:
                duplicates["playbooks"].append(f"{p_data['playbook_type']}: {p_data['name']}")
            else:
                new_elements["playbooks"].append(f"{p_data['playbook_type']}: {p_data['name']}")
                
    return {
        "duplicates": duplicates,
        "new": new_elements
    }
