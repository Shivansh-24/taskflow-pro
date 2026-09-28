from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from database import Base, Task, Dependency, WorkflowStatus
from datetime import datetime, timedelta

DATABASE_URL = "sqlite:///./taskflow.db"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def seed():
    Base.metadata.create_all(bind=engine)
    
    db = SessionLocal()
    
    if db.query(Task).count() > 0:
        print("Database already seeded. Skipping.")
        return
        
    # Clear out all existing data (just in case there are orphaned dependencies)
    db.query(Dependency).delete()
    db.query(Task).delete()
    db.commit()
        
    now = datetime.utcnow()
    
    # 1. Linear chain: Task 1 -> Task 2 -> Task 3
    t1 = Task(title="Design DB Schema", description="Design the PostgreSQL/SQLite schema for tasks and dependencies.", workflow_status=WorkflowStatus.DONE, position=1.0, duration=2.0, start_date=now - timedelta(days=5))
    t2 = Task(title="Implement Models", description="Implement SQLAlchemy ORM models based on the finalized schema.", workflow_status=WorkflowStatus.IN_PROGRESS, position=2.0, duration=3.0, start_date=now - timedelta(days=3))
    t3 = Task(title="Create API Endpoints", description="Build REST endpoints for task and dependency CRUD operations.", workflow_status=WorkflowStatus.BACKLOG, position=3.0, duration=2.0)
    
    # 2. Diamond pattern: 4 -> 5, 4 -> 6, 5 -> 7, 6 -> 7
    t4 = Task(title="Define API Spec", description="Write the OpenAPI specification defining request/response formats for the task API.", workflow_status=WorkflowStatus.DONE, position=4.0, duration=1.0, start_date=now - timedelta(days=10))
    t5 = Task(title="Develop Frontend UI", description="Build the React Kanban board components matching the defined API spec.", workflow_status=WorkflowStatus.IN_PROGRESS, position=5.0, duration=5.0, start_date=now - timedelta(days=8))
    t6 = Task(title="Develop Backend Auth", description="Implement authentication middleware for the API endpoints defined in the spec.", workflow_status=WorkflowStatus.DONE, position=6.0, duration=3.0, start_date=now - timedelta(days=8))
    t7 = Task(title="Integration Testing", description="Test the integration between the frontend UI and backend API, covering the full task lifecycle.", workflow_status=WorkflowStatus.REVIEW, position=7.0, duration=4.0)
    
    # Isolated task
    t8 = Task(title="Setup CI/CD", description="Configure a CI/CD pipeline to automate testing and deployment for this project.", workflow_status=WorkflowStatus.BACKLOG, position=8.0, duration=2.0)

    db.add_all([t1, t2, t3, t4, t5, t6, t7, t8])
    db.commit()
    
    # Add dependencies
    # Linear: t1(id=1) -> t2(id=2) -> t3(id=3)
    d1 = Dependency(precursor_id=1, dependent_id=2)
    d2 = Dependency(precursor_id=2, dependent_id=3)
    
    # Diamond: t4(id=4) -> t5(id=5), t4(id=4) -> t6(id=6), t5(id=5) -> t7(id=7), t6(id=6) -> t7(id=7)
    d3 = Dependency(precursor_id=4, dependent_id=5)
    d4 = Dependency(precursor_id=4, dependent_id=6)
    d5 = Dependency(precursor_id=5, dependent_id=7)
    d6 = Dependency(precursor_id=6, dependent_id=7)
    
    db.add_all([d1, d2, d3, d4, d5, d6])
    db.commit()
    
    print("Database seeded successfully!")
    
    print("\n--- Tasks ---")
    for task in db.query(Task).all():
        print(f"[{task.id}] {task.title} - Status: {task.workflow_status.value} - Duration: {task.duration}")
        
    print("\n--- Dependencies ---")
    for dep in db.query(Dependency).all():
        precursor = db.query(Task).get(dep.precursor_id)
        dependent = db.query(Task).get(dep.dependent_id)
        print(f"{precursor.title} (ID: {precursor.id}) ---> {dependent.title} (ID: {dependent.id})")

if __name__ == "__main__":
    seed()
