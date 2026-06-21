from sqlalchemy.orm import Session
from .. import models
from .vector_store import search_queries

def assemble_context(db: Session, vault_ids, user_message: str):
    """
    Retrieval-Time Context Assembly:
    1. Retrieve queries matching BGE semantic search across all active vaults
    2. Retrieve playbooks/consolidated business rules across all active vaults
    """
    if isinstance(vault_ids, str):
        vault_ids = [vault_ids]
    elif not vault_ids:
        vault_ids = []

    assembly = {
        "semantic_queries": [],
        "playbooks": []
    }
    
    # 1. Semantic Search via ChromaDB across each active vault
    all_results = []
    for v_id in vault_ids:
        vector_results = search_queries(v_id, user_message, n_results=5)
        if vector_results and "ids" in vector_results and vector_results["ids"]:
            ids = vector_results["ids"][0]
            distances = vector_results.get("distances", [[]])[0] if vector_results.get("distances") else [0.0] * len(ids)
            for qid, dist in zip(ids, distances):
                all_results.append((qid, dist))
                
    # Sort by distance ascending (closer matches first)
    all_results.sort(key=lambda x: x[1])
    top_results = all_results[:5]
    
    for qid, _ in top_results:
        q = db.query(models.Query).filter(models.Query.id == qid).first()
        if q and q.context:
            assembly["semantic_queries"].append({
                "title": q.title,
                "sql": q.sql_query,
                "context": q.context.context_json
            })
                
    # 2. Retrieve playbooks for all active vaults
    if vault_ids:
        playbooks = db.query(models.Playbook).filter(models.Playbook.vault_id.in_(vault_ids)).all()
        for pb in playbooks:
            assembly["playbooks"].append({
                "name": pb.name,
                "type": pb.playbook_type,
                "content": pb.content
            })
        
    return assembly
