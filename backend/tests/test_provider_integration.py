import pytest
import os
import sys
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Setup path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.database import Base
from app import models, schemas
from app.services import provider, extraction

# Test database setup
SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

@pytest.fixture(scope="function")
def db_session():
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()
        Base.metadata.drop_all(bind=engine)

def test_provider_activation_logic(db_session):
    # Add first provider
    p1 = schemas.ProviderCreate(
        provider_type="openai",
        profile_name="Profile 1",
        model_name="gpt-4o",
        api_key="sk-test-key-1"
    )
    # Mock connection testing to return True
    def mock_test(*args, **kwargs):
        return True, "Mock connection success"
    
    original_test = provider.test_provider_connection
    provider.test_provider_connection = mock_test
    
    try:
        prov1 = provider.add_provider(db_session, p1)
        assert prov1.is_active is True
        
        # Add second provider
        p2 = schemas.ProviderCreate(
            provider_type="openai",
            profile_name="Profile 2",
            model_name="gpt-3.5-turbo",
            api_key="sk-test-key-2"
        )
        prov2 = provider.add_provider(db_session, p2)
        assert prov2.is_active is True
        
        # Verify first provider was automatically deactivated
        db_session.refresh(prov1)
        assert prov1.is_active is False
    finally:
        provider.test_provider_connection = original_test

def test_playbook_context_injection(db_session):
    # Seed vault
    vault = models.Vault(name="Test Vault", description="Vault for playbooks test")
    db_session.add(vault)
    db_session.commit()
    db_session.refresh(vault)
    
    # Seed playbook
    pb = models.Playbook(
        vault_id=vault.id,
        playbook_type="business_rules",
        name="MAU Definition",
        content="MAU should always filter out accounts where email matches '%@slothquery.internal'"
    )
    db_session.add(pb)
    
    # Seed query
    query = models.Query(
        vault_id=vault.id,
        title="Active User Count",
        sql_query="SELECT count(distinct id) FROM users WHERE is_active = 1",
        dialect="snowflake",
        sql_comments="Basic user counts"
    )
    db_session.add(query)
    db_session.commit()
    db_session.refresh(query)
    
    # Verify playbooks context is fetched properly in extraction prompt
    playbooks = db_session.query(models.Playbook).filter(models.Playbook.vault_id == query.vault_id).all()
    assert len(playbooks) == 1
    assert "MAU should always filter out accounts" in playbooks[0].content

def test_multi_vault_chat_context_retrieval(db_session):
    # Seed vault 1
    v1 = models.Vault(name="Vault 1", description="First Vault")
    db_session.add(v1)
    db_session.commit()
    db_session.refresh(v1)
    
    # Seed vault 2
    v2 = models.Vault(name="Vault 2", description="Second Vault")
    db_session.add(v2)
    db_session.commit()
    db_session.refresh(v2)
    
    # Seed playbook 1 in Vault 1
    pb1 = models.Playbook(
        vault_id=v1.id,
        playbook_type="business_rules",
        name="Rule 1",
        content="Playbook in Vault 1"
    )
    db_session.add(pb1)
    
    # Seed playbook 2 in Vault 2
    pb2 = models.Playbook(
        vault_id=v2.id,
        playbook_type="business_rules",
        name="Rule 2",
        content="Playbook in Vault 2"
    )
    db_session.add(pb2)
    db_session.commit()
    
    # Verify assemble_context aggregates playbooks from both vaults
    from app.services.retrieval import assemble_context
    context = assemble_context(db_session, [v1.id, v2.id], "test message")
    
    playbook_contents = [p["content"] for p in context["playbooks"]]
    assert "Playbook in Vault 1" in playbook_contents
    assert "Playbook in Vault 2" in playbook_contents
