import pytest
from fastapi.testclient import TestClient
from main import app, get_db
from database import Base, Task, Dependency
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
import ai_suggest

SQLALCHEMY_DATABASE_URL = "sqlite:///./test_taskflow.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def override_get_db():
    try:
        db = TestingSessionLocal()
        yield db
    finally:
        db.close()

app.dependency_overrides[get_db] = override_get_db

client = TestClient(app)

def setup_module(module):
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)

def test_ai_suggestions_filtered(monkeypatch):
    # Setup some tasks in DB
    db = TestingSessionLocal()
    # Clean DB first
    db.query(Dependency).delete()
    db.query(Task).delete()
    db.commit()

    t1 = Task(id=1, title="Task 1")
    t2 = Task(id=2, title="Task 2")
    t3 = Task(id=3, title="Task 3")
    db.add_all([t1, t2, t3])
    db.commit()

    # t1 is precursor to t2
    db.add(Dependency(precursor_id=1, dependent_id=2))
    db.commit()

    # Suggest dependencies for t1 (ID 1).
    # LLM suggests [1, 2, 3].
    # 1 -> self-reference (invalid)
    # 2 -> would create cycle since 1 -> 2 already exists (invalid)
    # 3 -> valid
    def mock_llm(*args, **kwargs):
        return {
            "suggested_prerequisite_ids": [1, 2, 3],
            "reasoning": "mock reasoning"
        }
    
    monkeypatch.setattr("main.suggest_dependencies_llm", mock_llm)

    response = client.post("/tasks/1/suggest-dependencies")
    if response.status_code != 200:
        print(response.json())
    assert response.status_code == 200
    
    data = response.json()
    assert "suggestions" in data
    
    suggested_ids = [s["task_id"] for s in data["suggestions"]]
    assert suggested_ids == [3]
