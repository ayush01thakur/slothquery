from sqlalchemy.orm import Session
from .. import models, schemas
from .encryption import encrypt_api_key, decrypt_api_key
import litellm
import os

def get_providers(db: Session):
    return db.query(models.Provider).all()

def test_provider_connection(provider_type: str, model_name: str, api_key: str) -> tuple[bool, str]:
    """Tests if a connection can be established with the provider."""
    original_keys = {}
    env_keys = {
        "openai": "OPENAI_API_KEY",
        "anthropic": "ANTHROPIC_API_KEY",
        "google": "GEMINI_API_KEY",
        "groq": "GROQ_API_KEY",
        "deepseek": "DEEPSEEK_API_KEY",
        "openrouter": "OPENROUTER_API_KEY"
    }
    
    target_env = env_keys.get(provider_type.lower())
    if target_env:
        original_keys[target_env] = os.environ.get(target_env)
        os.environ[target_env] = api_key
        
    # Configure litellm variables dynamically
    if provider_type == "openai":
        litellm.api_key = api_key
    elif provider_type == "anthropic":
        litellm.anthropic_key = api_key
    elif provider_type == "google":
        litellm.gemini_key = api_key
    elif provider_type == "openrouter":
        litellm.openrouter_key = api_key
    else:
        litellm.api_key = api_key

    try:
        model_path = model_name
        if provider_type == "openrouter" and not model_name.startswith("openrouter/"):
            model_path = f"openrouter/{model_name}"
            
        # Quick completion test
        litellm.completion(
            model=model_path,
            messages=[{"role": "user", "content": "ping"}],
            max_tokens=5
        )
        return True, "Connection successful"
    except Exception as e:
        return False, str(e)
    finally:
        # Restore environment keys
        for k, v in original_keys.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v

def add_provider(db: Session, provider: schemas.ProviderCreate):
    # Deactivate all others automatically when adding/saving a new verified provider
    db.query(models.Provider).update({models.Provider.is_active: False})
    
    encrypted_key = encrypt_api_key(provider.api_key)
    db_provider = models.Provider(
        provider_type=provider.provider_type,
        profile_name=provider.profile_name,
        model_name=provider.model_name,
        encrypted_api_key=encrypted_key,
        is_active=True # Active by default as per user request
    )
    
    db.add(db_provider)
    db.commit()
    db.refresh(db_provider)
    return db_provider

def set_active_provider(db: Session, provider_id: str):
    # Deactivate all
    db.query(models.Provider).update({models.Provider.is_active: False})
    # Activate the target
    target = db.query(models.Provider).filter(models.Provider.id == provider_id).first()
    if target:
        target.is_active = True
        db.commit()
    return target

def get_active_provider_credentials(db: Session) -> dict:
    """Returns the credentials required to instantiate a LiteLLM client.
    Never expose this payload directly to the frontend."""
    target = db.query(models.Provider).filter(models.Provider.is_active == True).first()
    if not target:
        return None
        
    decrypted_key = decrypt_api_key(target.encrypted_api_key)
    return {
        "provider_type": target.provider_type,
        "model_name": target.model_name,
        "api_key": decrypted_key
    }
