from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os
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
    allow_origins=["*"], # Allow all origins for local ease-of-use
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(core.router)

@app.get("/health")
def health_check():
    return {"status": "healthy"}

# Mount frontend build static files if built
current_dir = os.path.dirname(os.path.abspath(__file__))
# 1. First check if dist is inside package directory (installed mode)
dist_path = os.path.join(current_dir, "dist")
if not os.path.exists(dist_path):
    # 2. Fallback to development directory structure
    root_dir = os.path.dirname(os.path.dirname(current_dir))
    dist_path = os.path.join(root_dir, "frontend", "dist")

if os.path.exists(dist_path):
    assets_path = os.path.join(dist_path, "assets")
    if os.path.exists(assets_path):
        app.mount("/assets", StaticFiles(directory=assets_path), name="assets")
    
    @app.get("/")
    def serve_index():
        return FileResponse(os.path.join(dist_path, "index.html"))

    @app.get("/{catchall:path}")
    def serve_catchall(catchall: str):
        # Avoid intercepting API routes or health check
        if catchall.startswith("api") or catchall.startswith("health"):
            return {"detail": "Not Found"}
        
        # If it matches an actual file in dist (like logo.png or favicon.ico), serve it
        local_file = os.path.join(dist_path, catchall)
        if os.path.exists(local_file) and os.path.isfile(local_file):
            return FileResponse(local_file)
            
        # Fallback to index.html for React Router
        return FileResponse(os.path.join(dist_path, "index.html"))
else:
    @app.get("/")
    def read_root():
        return {"message": "Welcome to SlothQuery API (Frontend not built)"}

