from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from database import WorkflowStatus

class TaskBase(BaseModel):
    title: str
    description: Optional[str] = None
    workflow_status: Optional[WorkflowStatus] = WorkflowStatus.BACKLOG
    position: Optional[float] = 0.0
    start_date: Optional[datetime] = None
    duration: Optional[float] = None

class TaskCreate(TaskBase):
    pass

class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    workflow_status: Optional[WorkflowStatus] = None
    position: Optional[float] = None
    start_date: Optional[datetime] = None
    duration: Optional[float] = None

class TaskPositionUpdate(BaseModel):
    workflow_status: WorkflowStatus
    position: float

class TaskOut(TaskBase):
    id: int
    created_at: datetime
    updated_at: datetime
    dependency_status: str

    class Config:
        from_attributes = True

class DependencyCreate(BaseModel):
    precursor_id: int
    dependent_id: int
class Suggestion(BaseModel):
    task_id: int
    title: str
    reasoning: str

class DependencySuggestionResponse(BaseModel):
    suggestions: list[Suggestion]
