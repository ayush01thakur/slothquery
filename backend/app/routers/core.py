from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, UploadFile, File
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel
import os
import json
import shutil

from ..database import get_db
from .. import models, schemas
from ..services import provider, extraction, chat, export_import
from ..services import vector_store as vs

router = APIRouter(prefix="/api")

# --- PROVIDERS ---

@router.get("/providers", response_model=List[schemas.ProviderResponse])
def list_providers(db: Session = Depends(get_db)):
    return provider.get_providers(db)

@router.post("/providers", response_model=schemas.ProviderResponse)
def add_new_provider(prov: schemas.ProviderCreate, db: Session = Depends(get_db)):
    # Save the provider config directly so settings are preserved even on validation failures.
    return provider.add_provider(db, prov)

@router.post("/providers/test")
def test_provider_connection_route(payload: dict):
    prov_type = payload.get("provider_type")
    model_name = payload.get("model_name")
    api_key = payload.get("api_key")
    if not prov_type or not model_name or not api_key:
        raise HTTPException(status_code=400, detail="Missing required details (provider_type, model_name, api_key)")
        
    success, msg = provider.test_provider_connection(prov_type, model_name, api_key)
    if not success:
        raise HTTPException(status_code=400, detail=msg)
    return {"message": "Connection tested successfully"}

@router.put("/providers/{provider_id}/active", response_model=schemas.ProviderResponse)
def set_active(provider_id: str, db: Session = Depends(get_db)):
    res = provider.set_active_provider(db, provider_id)
    if not res:
        raise HTTPException(status_code=404, detail="Provider not found")
    return res

@router.delete("/providers/{provider_id}")
def delete_provider(provider_id: str, db: Session = Depends(get_db)):
    prov = db.query(models.Provider).filter(models.Provider.id == provider_id).first()
    if not prov:
        raise HTTPException(status_code=404, detail="Provider not found")
    db.delete(prov)
    db.commit()
    return {"message": "Provider deleted successfully"}


# --- VAULTS ---

@router.get("/vaults", response_model=List[schemas.VaultResponse])
def list_vaults(db: Session = Depends(get_db)):
    return db.query(models.Vault).all()

@router.post("/vaults", response_model=schemas.VaultResponse)
def create_vault(vault: schemas.VaultCreate, db: Session = Depends(get_db)):
    db_vault = models.Vault(name=vault.name, description=vault.description)
    db.add(db_vault)
    db.commit()
    db.refresh(db_vault)
    return db_vault

@router.get("/vaults/{vault_id}", response_model=schemas.VaultResponse)
def get_vault(vault_id: str, db: Session = Depends(get_db)):
    v = db.query(models.Vault).filter(models.Vault.id == vault_id).first()
    if not v:
        raise HTTPException(status_code=404, detail="Vault not found")
    return v

@router.delete("/vaults/{vault_id}")
def delete_vault(vault_id: str, db: Session = Depends(get_db)):
    """Cascade-delete a vault and all its child records (queries, contexts, playbooks).
    The ChromaDB collection is dropped. Playbook content generated from queries
    inside this vault is removed since playbooks are vault-scoped.
    """
    v = db.query(models.Vault).filter(models.Vault.id == vault_id).first()
    if not v:
        raise HTTPException(status_code=404, detail="Vault not found")

    # 1. Drop ChromaDB collection for this vault (non-fatal if missing)
    vs.delete_vault_index(vault_id)

    # 2. Delete all QueryContexts for queries in this vault
    query_ids = [q.id for q in db.query(models.Query).filter(models.Query.vault_id == vault_id).all()]
    if query_ids:
        db.query(models.QueryContext).filter(models.QueryContext.query_id.in_(query_ids)).delete(synchronize_session=False)

    # 3. Delete all Queries in this vault
    db.query(models.Query).filter(models.Query.vault_id == vault_id).delete(synchronize_session=False)

    # 4. Delete all Playbooks in this vault
    db.query(models.Playbook).filter(models.Playbook.vault_id == vault_id).delete(synchronize_session=False)

    # 5. Delete the vault itself
    db.delete(v)
    db.commit()

    return {
        "message": "Vault deleted successfully.",
        "warning": "All queries, contexts, and playbooks within this vault have been permanently removed."
    }


# --- QUERIES ---

class QueryWithContextResponse(schemas.QueryResponse):
    context: Optional[dict] = None
    approval_status: Optional[str] = None

@router.get("/queries", response_model=List[QueryWithContextResponse])
def list_queries(vault_id: str, db: Session = Depends(get_db)):
    queries = db.query(models.Query).filter(models.Query.vault_id == vault_id).all()
    res = []
    for q in queries:
        context_data = None
        app_status = None
        if q.context:
            context_data = q.context.context_json
            app_status = q.context.approval_status
        
        # We manually build the response dict matching QueryWithContextResponse
        res.append({
            "id": q.id,
            "vault_id": q.vault_id,
            "title": q.title,
            "description": q.description,
            "sql_query": q.sql_query,
            "sql_comments": q.sql_comments,
            "tags": q.tags,
            "dialect": q.dialect,
            "created_at": q.created_at,
            "updated_at": q.updated_at,
            "context": context_data,
            "approval_status": app_status
        })
    return res

@router.post("/queries/extract")
def extract_draft_intelligence(req: schemas.DraftExtractionRequest, db: Session = Depends(get_db)):
    draft_json = extraction.generate_draft_intelligence(
        db, req.vault_id, req.title, req.description or "", 
        req.sql_query, req.sql_comments or "", req.dialect
    )
    return {"draft_context": draft_json}

@router.post("/queries/with-context")
def create_query_with_context(req: schemas.QueryCreateWithContext, db: Session = Depends(get_db)):
    db_query = models.Query(
        vault_id=req.vault_id,
        title=req.title,
        description=req.description,
        sql_query=req.sql_query,
        sql_comments=req.sql_comments,
        tags=req.tags,
        dialect=req.dialect
    )
    db.add(db_query)
    db.commit()
    db.refresh(db_query)

    # Save approved context
    q_context = models.QueryContext(
        query_id=db_query.id,
        context_json=req.context_json,
        approval_status="approved"
    )
    db.add(q_context)
    db.commit()

    # Index into ChromaDB
    try:
        from ..services import vector_store as vs
        import json
        doc_text = db_query.sql_query
        if req.context_json:
            doc_text += "\n" + json.dumps(req.context_json)
        vs.index_query(
            vault_id=db_query.vault_id,
            query_id=db_query.id,
            document_text=doc_text,
            metadata={"title": db_query.title}
        )
    except Exception as e:
        print(f"Vector indexing failed (non-fatal): {e}")

    # NOTE: organize_intelligence is NOT called automatically here.
    # The user must explicitly confirm via the frontend's Step 2 modal.
    return {"message": "Query and Context saved.", "query_id": db_query.id}


@router.post("/queries/preview-playbook-push")
def preview_playbook_push(req: schemas.PlaybookPushPreviewRequest, db: Session = Depends(get_db)):
    """Returns a preview of what organize_intelligence would write to playbooks,
    without actually committing anything. The frontend uses this to show the user
    a confirmation step before pushing to Rules / Schemas / Notes."""
    preview = extraction.preview_organize_intelligence(db, req.vault_id, req.context_json)
    return {"preview": preview}


@router.post("/queries/confirm-playbook-push")
def confirm_playbook_push(req: schemas.PlaybookPushPreviewRequest, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """User confirmed the playbook push. Runs organize_intelligence in the background."""
    background_tasks.add_task(extraction.organize_intelligence, db, req.vault_id, req.context_json)
    return {"message": "Playbook update queued."}

@router.post("/queries")
def create_query(query: schemas.QueryCreate, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    db_query = models.Query(
        vault_id=query.vault_id,
        title=query.title,
        description=query.description,
        sql_query=query.sql_query,
        sql_comments=query.sql_comments,
        tags=query.tags,
        dialect=query.dialect
    )
    db.add(db_query)
    db.commit()
    db.refresh(db_query)
    
    # Run context extraction as a background task to keep API responsive
    background_tasks.add_task(extraction.run_extraction_pipeline, db, db_query.id)
    
    return {"message": "Query saved and extraction pipeline triggered", "query_id": db_query.id}

@router.put("/queries/{query_id}/context")
def update_query_context(query_id: str, payload: dict, db: Session = Depends(get_db)):
    # Payload is expected to have "context_json" and "approval_status"
    q_context = db.query(models.QueryContext).filter(models.QueryContext.query_id == query_id).first()
    if not q_context:
        # Create one if it doesn't exist
        q_context = models.QueryContext(query_id=query_id, context_json={}, approval_status="draft")
        db.add(q_context)
    
    if "context_json" in payload:
        q_context.context_json = payload["context_json"]
    if "approval_status" in payload:
        q_context.approval_status = payload["approval_status"]
        
    db.commit()
    
    # Immediately re-index the updated query in ChromaDB
    try:
        query = db.query(models.Query).filter(models.Query.id == query_id).first()
        if query:
            doc_text = query.sql_query
            if q_context.context_json:
                doc_text += "\n" + json.dumps(q_context.context_json)
            vs.index_query(
                vault_id=query.vault_id,
                query_id=query.id,
                document_text=doc_text,
                metadata={"title": query.title}
            )
    except Exception as e:
        print(f"Error re-indexing query in ChromaDB on PUT context: {e}")
        
    return {"message": "Query context updated and vector index synchronized successfully"}

@router.delete("/queries/{query_id}")
def delete_query(query_id: str, db: Session = Depends(get_db)):
    """Delete a single query and its context from SQLite and the vector index.
    NOTE: Playbooks are intentionally NOT modified. Any business logic derived
    from this query may still exist in vault Playbooks and should be reviewed manually.
    """
    q = db.query(models.Query).filter(models.Query.id == query_id).first()
    if not q:
        raise HTTPException(status_code=404, detail="Query not found")

    vault_id = q.vault_id

    # 1. Remove from ChromaDB vector index (non-fatal)
    vs.delete_query_from_index(vault_id, query_id)

    # 2. Delete associated QueryContext
    db.query(models.QueryContext).filter(models.QueryContext.query_id == query_id).delete(synchronize_session=False)

    # 3. Delete the Query
    db.delete(q)
    db.commit()

    return {
        "message": "Query deleted successfully.",
        "warning": "Business logic or content derived from this query may still exist in your vault Playbooks. Please review and edit them manually to ensure accurate AI responses."
    }


# --- CHATS ---

@router.get("/chats", response_model=List[schemas.ChatResponse])
def list_chats(db: Session = Depends(get_db)):
    return db.query(models.Chat).order_by(models.Chat.last_interacted_at.desc()).all()

@router.post("/chats", response_model=schemas.ChatResponse)
def create_new_chat(db: Session = Depends(get_db)):
    c = models.Chat(title="New Chat")
    db.add(c)
    db.commit()
    db.refresh(c)
    return c

@router.get("/chats/{chat_id}", response_model=schemas.ChatResponse)
def get_chat(chat_id: str, db: Session = Depends(get_db)):
    c = db.query(models.Chat).filter(models.Chat.id == chat_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Chat not found")
    return c

@router.post("/chats/{chat_id}/messages")
def send_message_to_chat(chat_id: str, payload: dict, db: Session = Depends(get_db)):
    # Expects "message", and optional "vault_ids" or "vault_id"
    msg = payload.get("message")
    vault_ids = payload.get("vault_ids")
    vault_id = payload.get("vault_id")
    
    if not vault_ids and vault_id:
        vault_ids = [vault_id]
        
    if not msg:
        raise HTTPException(status_code=400, detail="Missing message")
        
    try:
        res = chat.process_chat_message(db, chat_id, vault_ids, msg)
        return res
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/chats/{chat_id}", response_model=schemas.ChatResponse)
def update_chat(chat_id: str, payload: dict, db: Session = Depends(get_db)):
    c = db.query(models.Chat).filter(models.Chat.id == chat_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Chat not found")
        
    if "title" in payload:
        c.title = payload["title"]
    if "vault_ids" in payload:
        c.vault_ids = payload["vault_ids"]
        
    db.commit()
    db.refresh(c)
    return c

@router.delete("/chats/{chat_id}")
def delete_chat(chat_id: str, db: Session = Depends(get_db)):
    c = db.query(models.Chat).filter(models.Chat.id == chat_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Chat not found")
        
    # Delete related chat messages
    db.query(models.ChatMessage).filter(models.ChatMessage.chat_id == chat_id).delete()
    db.delete(c)
    db.commit()
    return {"message": "Chat deleted successfully"}


# --- PLAYBOOKS ---

class PlaybookCreate(BaseModel):
    # Defining schema inline to keep routers self-contained or import
    vault_id: str
    playbook_type: str # business_rules | table_schemas | analyst_notes
    name: str
    content: str

@router.get("/playbooks")
def list_playbooks(vault_id: str, db: Session = Depends(get_db)):
    return db.query(models.Playbook).filter(models.Playbook.vault_id == vault_id).all()

@router.post("/playbooks")
def create_or_update_playbook(payload: dict, db: Session = Depends(get_db)):
    # expect vault_id, name, playbook_type, content, and optional playbook_id
    pb_id = payload.get("id")
    if pb_id:
        pb = db.query(models.Playbook).filter(models.Playbook.id == pb_id).first()
        if not pb:
            raise HTTPException(status_code=404, detail="Playbook not found")
        pb.name = payload.get("name", pb.name)
        pb.playbook_type = payload.get("playbook_type", pb.playbook_type)
        pb.content = payload.get("content", pb.content)
        if "always_include" in payload:
            pb.always_include = payload["always_include"]
    else:
        pb = models.Playbook(
            vault_id=payload["vault_id"],
            playbook_type=payload["playbook_type"],
            name=payload["name"],
            content=payload["content"],
            always_include=payload.get("always_include", False)
        )
        db.add(pb)
        
    db.commit()
    db.refresh(pb)
    return pb

@router.delete("/playbooks/{playbook_id}")
def delete_playbook(playbook_id: str, db: Session = Depends(get_db)):
    pb = db.query(models.Playbook).filter(models.Playbook.id == playbook_id).first()
    if not pb:
        raise HTTPException(status_code=404, detail="Playbook not found")
    db.delete(pb)
    db.commit()
    return {"message": "Playbook deleted successfully"}


# --- EXPORT / IMPORT ---

from fastapi.responses import FileResponse

@router.get("/export")
def export_db(db: Session = Depends(get_db)):
    export_dir = os.path.join(os.path.expanduser("~"), "Documents", "SlothQuery", "Exports")
    try:
        file_path = export_import.export_knowledge_base(db, export_dir)
        return FileResponse(file_path, media_type="application/zip", filename=os.path.basename(file_path))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Export failed: {str(e)}")

@router.post("/import")
def import_db(file: UploadFile = File(...), db: Session = Depends(get_db)):
    temp_dir = os.path.join(os.path.expanduser("~"), "Documents", "SlothQuery", "Temp")
    os.makedirs(temp_dir, exist_ok=True)
    temp_file_path = os.path.join(temp_dir, file.filename)
    
    with open(temp_file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    try:
        export_import.import_knowledge_base(db, temp_file_path)
        return {"message": "Knowledge base imported and embeddings regenerated successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Import failed: {str(e)}")
    finally:
        if os.path.exists(temp_file_path):
            os.remove(temp_file_path)

@router.post("/reindex")
def reindex_db(db: Session = Depends(get_db)):
    try:
        from ..services.vector_store import index_query
        import json
        queries = db.query(models.Query).all()
        for q in queries:
            doc_text = q.sql_query
            if q.context:
                doc_text += "\n" + json.dumps(q.context.context_json)
            index_query(
                vault_id=q.vault_id,
                query_id=q.id,
                document_text=doc_text,
                metadata={"title": q.title}
            )
        return {"message": "Reindexed all queries successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Reindexing failed: {str(e)}")

