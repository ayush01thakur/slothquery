import uvicorn
import webbrowser
import threading
import time
from .main import app

def open_browser():
    # Wait 1.5 seconds for uvicorn to initialize completely
    time.sleep(1.5)
    print("[*] Opening SlothQuery in default browser...")
    webbrowser.open("http://127.0.0.1:8000")

def main():
    print("===================================================")
    print("             SlothQuery Local Launch               ")
    print("===================================================")
    print("[*] Initializing local database and indexing vector store...")
    
    # Start browser redirect in background thread
    threading.Thread(target=open_browser, daemon=True).start()
    
    # Launch uvicorn directly with the FastAPI app instance
    uvicorn.run(app, host="127.0.0.1", port=8000, log_level="info")

if __name__ == "__main__":
    main()
