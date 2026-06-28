from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .database import engine, Base
from . import models
from .routers import core

# Create tables if they don't exist
Base.metadata.create_all(bind=engine)

# Ensure vault_ids column exists in chats table
from sqlalchemy import text
with engine.connect() as conn:
    try:
        conn.execute(text("ALTER TABLE chats ADD COLUMN vault_ids JSON"))
        conn.commit()
    except Exception:
        pass
    
    try:
        conn.execute(text("ALTER TABLE playbooks ADD COLUMN always_include BOOLEAN DEFAULT 0"))
        conn.commit()
    except Exception:
        pass

app = FastAPI(title="SlothQuery API", description="Local-first organizational intelligence platform")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(core.router)

@app.get("/")
def read_root():
    return {"message": "Welcome to SlothQuery API"}

@app.get("/health")
def health_check():
    return {"status": "healthy"}

