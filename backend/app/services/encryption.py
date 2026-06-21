import os
from cryptography.fernet import Fernet

# Define default key path in Documents/SlothQuery
documents_dir = os.path.join(os.path.expanduser("~"), "Documents", "SlothQuery")
os.makedirs(documents_dir, exist_ok=True)
key_path = os.path.join(documents_dir, ".encryption_key")

def _get_or_create_key() -> bytes:
    if not os.path.exists(key_path):
        key = Fernet.generate_key()
        with open(key_path, "wb") as key_file:
            key_file.write(key)
    else:
        with open(key_path, "rb") as key_file:
            key = key_file.read()
    return key

# Initialize fernet instance on load
fernet = Fernet(_get_or_create_key())

def encrypt_api_key(api_key: str) -> str:
    """Encrypts a plaintext API key for safe database storage."""
    return fernet.encrypt(api_key.encode()).decode()

def decrypt_api_key(encrypted_key: str) -> str:
    """Decrypts a stored API key for backend utilization."""
    return fernet.decrypt(encrypted_key.encode()).decode()
