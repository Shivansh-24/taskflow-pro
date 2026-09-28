import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from database import Base, Task, Dependency, WorkflowStatus
from scheduler import would_create_cycle, validate_new_dependency, compute_dependency_status, recalculate_downstream
from datetime import datetime, timedelta

@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    
    # Setup Diamond Pattern (4 -> 5, 4 -> 6, 5 -> 7, 6 -> 7)
    now = datetime(2023, 1, 1, 10, 0, 0)
    t4 = Task(id=4, title="T4", workflow_status=WorkflowStatus.DONE, duration=1.0, start_date=now)
    t5 = Task(id=5, title="T5", workflow_status=WorkflowStatus.DONE, duration=5.0, start_date=now + timedelta(days=1))
    t6 = Task(id=6, title="T6", workflow_status=WorkflowStatus.DONE, duration=3.0, start_date=now + timedelta(days=1))
    t7 = Task(id=7, title="T7", workflow_status=WorkflowStatus.BACKLOG, duration=4.0, start_date=now + timedelta(days=6))
    
    session.add_all([t4, t5, t6, t7])
    session.commit()
    
    session.add_all([
        Dependency(precursor_id=4, dependent_id=5),
        Dependency(precursor_id=4, dependent_id=6),
        Dependency(precursor_id=5, dependent_id=7),
        Dependency(precursor_id=6, dependent_id=7),
    ])
    session.commit()
    
    yield session
    session.close()

def test_would_create_cycle(db):
    # Try adding 7 -> 4 (creates cycle 4->5->7->4)
    assert would_create_cycle(db, 7, 4) == True
    # Try adding 5 -> 6 (no cycle)
    assert would_create_cycle(db, 5, 6) == False

def test_validate_new_dependency(db):
    # Valid
    is_valid, msg = validate_new_dependency(db, 5, 6)
    assert is_valid == True
    
    # Self-dependency
    is_valid, msg = validate_new_dependency(db, 5, 5)
    assert is_valid == False
    assert msg == "Cannot create a self-dependency."
    
    # Doesn't exist
    is_valid, msg = validate_new_dependency(db, 99, 100)
    assert is_valid == False
    
    # Duplicate
    is_valid, msg = validate_new_dependency(db, 4, 5)
    assert is_valid == False
    assert msg == "Duplicate dependency edge."
    
    # Cycle
    is_valid, msg = validate_new_dependency(db, 7, 4)
    assert is_valid == False
    assert msg == "Adding this dependency would create a cycle."

def test_recalculate_downstream_no_compounding(db):
    # Original start date for T7 is 2023-01-07 10:00:00 (T5 ends at 1+5=6th day)
    t4 = db.query(Task).get(4)
    t7 = db.query(Task).get(7)
    
    original_t7_start = t7.start_date
    assert original_t7_start == datetime(2023, 1, 7, 10, 0, 0)
    
    # Shift T4 duration by 2 days (1.0 -> 3.0)
    # T5 and T6 will both shift forward by 2 days when recalculating
    # Therefore, T7 should shift exactly by 2 days, not 4 (no compounding)
    t4.duration = 3.0
    db.commit()
    
    recalculate_downstream(db, 4)
    
    # T5 new start: T4 end = 1 + 3 = 4th day
    # T5 new end: 4 + 5 = 9th day
    # T6 new start: T4 end = 1 + 3 = 4th day
    # T6 new end: 4 + 3 = 7th day
    # T7 start should be MAX(T5 end, T6 end) = MAX(9th, 7th) = 9th day
    
    # Which is exactly 2 days after its original 7th day start.
    assert t7.start_date == datetime(2023, 1, 9, 10, 0, 0)

def test_rollback_status(db):
    # Currently T4, T5, T6 are Done. T7 should be ready
    assert compute_dependency_status(db, 7) == "Ready"
    
    # Rollback T5 to IN_PROGRESS
    t5 = db.query(Task).get(5)
    t5.workflow_status = WorkflowStatus.IN_PROGRESS
    db.commit()
    
    # T7 should now be Blocked
    assert compute_dependency_status(db, 7) == "Blocked"
