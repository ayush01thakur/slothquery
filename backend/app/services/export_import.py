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
    """Imports .slothkb file and regenerates BGE embeddings locally."""
    with zipfile.ZipFile(slothkb_path, 'r') as zf:
        with zf.open("queries_and_contexts.json") as f:
            data = json.loads(f.read().decode("utf-8"))
            
    # Iterate and trigger embedding regeneration
    for q in data.get("queries", []):
        # We need the context for this query
        context = next((c for c in data.get("contexts", []) if c["query_id"] == q["id"]), None)
        
        doc_text = q["sql_query"]
        if context:
            doc_text += "\n" + json.dumps(context["context_json"])
            
        # Rebuild local embedding in ChromaDB
        index_query(
            vault_id=q["vault_id"],
            query_id=q["id"],
            document_text=doc_text,
            metadata={"title": q["title"]}
        )
    
    return True
