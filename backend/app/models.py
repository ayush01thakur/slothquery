import uuid
from datetime import datetime
from sqlalchemy import Column, String, Text, DateTime, ForeignKey, Boolean, JSON
from sqlalchemy.orm import relationship
from .database import Base

def generate_uuid():
    return str(uuid.uuid4())

class Vault(Base):
    __tablename__ = "vaults"
    id = Column(String, primary_key=True, default=generate_uuid)
    name = Column(String, nullable=False)
    description = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    queries = relationship("Query", back_populates="vault")
    playbooks = relationship("Playbook", back_populates="vault")

class Query(Base):
    __tablename__ = "queries"
    id = Column(String, primary_key=True, default=generate_uuid)
    vault_id = Column(String, ForeignKey("vaults.id"))
    title = Column(String, nullable=False)
    description = Column(String, nullable=True)
    sql_query = Column(Text, nullable=False)
    sql_comments = Column(Text, nullable=True)
    tags = Column(String, nullable=True)
    dialect = Column(String, nullable=False) # snowflake | bigquery | postgresql etc.
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    vault = relationship("Vault", back_populates="queries")
    context = relationship("QueryContext", back_populates="query", uselist=False)

class QueryContext(Base):
    __tablename__ = "query_contexts"
    id = Column(String, primary_key=True, default=generate_uuid)
    query_id = Column(String, ForeignKey("queries.id"), unique=True)
    context_json = Column(JSON, nullable=False)
    approval_status = Column(String, default="draft") # draft | approved | archived
    version_hash = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    query = relationship("Query", back_populates="context")

class Playbook(Base):
    __tablename__ = "playbooks"
    id = Column(String, primary_key=True, default=generate_uuid)
    vault_id = Column(String, ForeignKey("vaults.id"))
    playbook_type = Column(String, nullable=False)
    name = Column(String, nullable=False)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    vault = relationship("Vault", back_populates="playbooks")

class Chat(Base):
    __tablename__ = "chats"
    id = Column(String, primary_key=True, default=generate_uuid)
    title = Column(String, nullable=False)
    vault_ids = Column(JSON, nullable=True) # List of vault ID strings
    created_at = Column(DateTime, default=datetime.utcnow)
    last_interacted_at = Column(DateTime, default=datetime.utcnow)
    
    messages = relationship("ChatMessage", back_populates="chat", order_by="ChatMessage.created_at")

class ChatMessage(Base):
    __tablename__ = "chat_messages"
    id = Column(String, primary_key=True, default=generate_uuid)
    chat_id = Column(String, ForeignKey("chats.id"))
    role = Column(String, nullable=False) # user | assistant
    content = Column(Text, nullable=False)
    metadata_json = Column(JSON, nullable=True) # avoiding metadata as name collision with Base.metadata
    created_at = Column(DateTime, default=datetime.utcnow)
    
    chat = relationship("Chat", back_populates="messages")

class Provider(Base):
    __tablename__ = "providers"
    id = Column(String, primary_key=True, default=generate_uuid)
    provider_type = Column(String, nullable=False) # openai | anthropic | google | groq | openrouter | deepseek
    profile_name = Column(String, nullable=False)
    model_name = Column(String, nullable=False)
    encrypted_api_key = Column(String, nullable=False)
    is_active = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
