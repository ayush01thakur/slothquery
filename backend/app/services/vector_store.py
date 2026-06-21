import os
import chromadb
from chromadb.utils import embedding_functions

# Vector store local path
documents_dir = os.path.join(os.path.expanduser("~"), "Documents", "SlothQuery")
os.makedirs(documents_dir, exist_ok=True)
chroma_path = os.path.join(documents_dir, "chroma_db")

# Initialize ChromaDB locally
client = chromadb.PersistentClient(path=chroma_path)

# Use BGE embeddings for offline-first vector search
sentence_transformer_ef = embedding_functions.SentenceTransformerEmbeddingFunction(model_name="BAAI/bge-small-en-v1.5")

def get_collection(vault_id: str):
    # ChromaDB collection names have constraints, replace hyphens
    safe_name = f"vault_{vault_id.replace('-', '_')}"
    return client.get_or_create_collection(
        name=safe_name,
        embedding_function=sentence_transformer_ef
    )

def index_query(vault_id: str, query_id: str, document_text: str, metadata: dict):
    collection = get_collection(vault_id)
    collection.upsert(
        documents=[document_text],
        metadatas=[metadata],
        ids=[query_id]
    )

def search_queries(vault_id: str, query_text: str, n_results: int = 5):
    try:
        collection = get_collection(vault_id)
        results = collection.query(
            query_texts=[query_text],
            n_results=n_results
        )
        return results
    except Exception as e:
        print(f"Vector search failed: {e}")
        return {"documents": [[]], "metadatas": [[]], "ids": [[]]}

def delete_query_from_index(vault_id: str, query_id: str):
    """Remove a single query's embedding from the vault's ChromaDB collection."""
    try:
        safe_name = f"vault_{vault_id.replace('-', '_')}"
        # Only attempt deletion if the collection exists
        existing = [c.name for c in client.list_collections()]
        if safe_name in existing:
            collection = client.get_collection(
                name=safe_name,
                embedding_function=sentence_transformer_ef
            )
            collection.delete(ids=[query_id])
            print(f"Deleted query {query_id} from vector index for vault {vault_id}")
    except Exception as e:
        print(f"Vector delete for query {query_id} failed (non-fatal): {e}")

def delete_vault_index(vault_id: str):
    """Drop the entire ChromaDB collection for a vault. Non-fatal if it doesn't exist."""
    try:
        safe_name = f"vault_{vault_id.replace('-', '_')}"
        existing = [c.name for c in client.list_collections()]
        if safe_name in existing:
            client.delete_collection(name=safe_name)
            print(f"Dropped ChromaDB collection for vault {vault_id}")
    except Exception as e:
        print(f"Vector collection drop for vault {vault_id} failed (non-fatal): {e}")
