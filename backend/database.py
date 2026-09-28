from sqlalchemy import Column, Integer, String, DateTime, Float, ForeignKey, Enum, create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from datetime import datetime, timezone
import enum

Base = declarative_base()

DATABASE_URL = "sqlite:///./taskflow.db"
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

class WorkflowStatus(enum.Enum):
    BACKLOG = "Backlog"
    IN_PROGRESS = "In Progress"
    REVIEW = "Review"
    DONE = "Done"

class Task(Base):
    __tablename__ = 'tasks'

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, index=True, nullable=False)
    description = Column(String)
    workflow_status = Column(Enum(WorkflowStatus), default=WorkflowStatus.BACKLOG)
    position = Column(Float, default=0.0)
    start_date = Column(DateTime, nullable=True)
    duration = Column(Float, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

class Dependency(Base):
    __tablename__ = 'dependencies'

    precursor_id = Column(Integer, ForeignKey('tasks.id'), primary_key=True)
    dependent_id = Column(Integer, ForeignKey('tasks.id'), primary_key=True)
