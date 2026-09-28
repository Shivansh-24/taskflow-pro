import pytest
from fastapi.testclient import TestClient
from main import app, get_db
from database import Base, Task, Dependency, WorkflowStatus
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from datetime import datetime, timedelta

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

@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    
    # Diamond setup
    now = datetime(2023, 1, 1, 10, 0, 0)
    t4 = Task(id=4, title="T4", workflow_status=WorkflowStatus.DONE, duration=1.0, start_date=now)
    t5 = Task(id=5, title="T5", workflow_status=WorkflowStatus.DONE, duration=5.0, start_date=now + timedelta(days=1))
    t6 = Task(id=6, title="T6", workflow_status=WorkflowStatus.DONE, duration=3.0, start_date=now + timedelta(days=1))
    t7 = Task(id=7, title="T7", workflow_status=WorkflowStatus.BACKLOG, duration=4.0, start_date=now + timedelta(days=6))
    
    db.add_all([t4, t5, t6, t7])
    db.commit()
    
    db.add_all([
        Dependency(precursor_id=4, dependent_id=5),
        Dependency(precursor_id=4, dependent_id=6),
        Dependency(precursor_id=5, dependent_id=7),
        Dependency(precursor_id=6, dependent_id=7),
    ])
    db.commit()
    db.close()

def test_api_cycle_rejection():
    # Attempt to create cycle: 7 -> 4
    response = client.post("/dependencies", json={"precursor_id": 7, "dependent_id": 4})
    assert response.status_code == 400
    assert "cycle" in response.json()["detail"].lower()
    
    # Verify graph unchanged
    db = TestingSessionLocal()
    dep = db.query(Dependency).filter_by(precursor_id=7, dependent_id=4).first()
    assert dep is None
    db.close()

def test_api_rollback_downstream_status():
    # Verify 7 is Ready initially
    tasks_res = client.get("/tasks")
    assert tasks_res.status_code == 200
    tasks = tasks_res.json()
    t7_data = next(t for t in tasks if t["id"] == 7)
    assert t7_data["dependency_status"] == "Ready"
    
    # Move T5 from DONE to IN_PROGRESS
    update_res = client.put("/tasks/5", json={"workflow_status": "In Progress"})
    assert update_res.status_code == 200
    
    # Verify 7 is now Blocked
    tasks_res2 = client.get("/tasks")
    tasks2 = tasks_res2.json()
    t7_data2 = next(t for t in tasks2 if t["id"] == 7)
    assert t7_data2["dependency_status"] == "Blocked"
