from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime

class ProviderBase(BaseModel):
    provider_type: str
    profile_name: str
    model_name: str

class ProviderCreate(ProviderBase):
    api_key: str

class ProviderResponse(ProviderBase):
    id: str
    is_active: bool
    created_at: datetime
    
    class Config:
        from_attributes = True

class VaultBase(BaseModel):
    name: str
    description: Optional[str] = None

class VaultCreate(VaultBase):
    pass

class VaultResponse(VaultBase):
    id: str
    created_at: datetime
    
    class Config:
        from_attributes = True

class QueryBase(BaseModel):
    title: str
    description: Optional[str] = None
    sql_query: str
    sql_comments: Optional[str] = None
    tags: Optional[str] = None
    dialect: str

class QueryCreate(QueryBase):
    vault_id: str

class QueryResponse(QueryBase):
    id: str
    vault_id: str
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True

class ChatMessageBase(BaseModel):
    role: str
    content: str
    metadata_json: Optional[Dict[str, Any]] = None

class ChatMessageCreate(ChatMessageBase):
    chat_id: str

class ChatMessageResponse(ChatMessageBase):
    id: str
    chat_id: str
    created_at: datetime
    
    class Config:
        from_attributes = True

class ChatBase(BaseModel):
    title: str

class ChatCreate(ChatBase):
    pass

class ChatResponse(ChatBase):
    id: str
    vault_ids: Optional[List[str]] = []
    created_at: datetime
    last_interacted_at: Optional[datetime] = None
    messages: List[ChatMessageResponse] = []
    
    class Config:
        from_attributes = True

class PlaybookBase(BaseModel):
    name: str
    playbook_type: str
    content: str
    always_include: Optional[bool] = False

class PlaybookCreate(PlaybookBase):
    vault_id: str

class PlaybookResponse(PlaybookBase):
    id: str
    vault_id: str
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True

class DraftExtractionRequest(BaseModel):
    vault_id: str
    title: str
    description: Optional[str] = None
    sql_query: str
    sql_comments: Optional[str] = None
    tags: Optional[str] = None
    dialect: str

class QueryCreateWithContext(QueryCreate):
    context_json: Dict[str, Any]

class PlaybookPushPreviewRequest(BaseModel):
    vault_id: str
    context_json: Dict[str, Any]
