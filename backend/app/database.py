import os
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

# Define default database path in Documents/SlothQuery
documents_dir = os.path.join(os.path.expanduser("~"), "Documents", "SlothQuery")
os.makedirs(documents_dir, exist_ok=True)
db_path = os.path.join(documents_dir, "slothquery.db")

SQLALCHEMY_DATABASE_URL = f"sqlite:///{db_path}"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
