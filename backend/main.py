from fastapi import FastAPI, Depends, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import List
from database import Base, engine, SessionLocal, Task, Dependency, WorkflowStatus
from schemas import TaskCreate, TaskUpdate, TaskPositionUpdate, TaskOut, DependencyCreate
from scheduler import validate_new_dependency, compute_dependency_status, recalculate_downstream

Base.metadata.create_all(bind=engine)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health_check():
    return {"status": "ok"}

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@app.get("/tasks", response_model=List[TaskOut])
def get_tasks(db: Session = Depends(get_db)):
    tasks = db.query(Task).all()
    out = []
    for t in tasks:
        t_dict = t.__dict__.copy()
        t_dict["dependency_status"] = compute_dependency_status(db, t.id)
        out.append(t_dict)
    return out

@app.post("/tasks", response_model=TaskOut)
def create_task(task: TaskCreate, db: Session = Depends(get_db)):
    db_task = Task(**task.model_dump())
    db.add(db_task)
    db.commit()
    db.refresh(db_task)
    
    out = db_task.__dict__.copy()
    out["dependency_status"] = compute_dependency_status(db, db_task.id)
    return out

@app.put("/tasks/{task_id}", response_model=TaskOut)
def update_task(task_id: int, task: TaskUpdate, db: Session = Depends(get_db)):
    db_task = db.query(Task).get(task_id)
    if not db_task:
        raise HTTPException(status_code=404, detail="Task not found")
        
    update_data = task.model_dump(exclude_unset=True)
    needs_recalc = False
    
    if "workflow_status" in update_data and update_data["workflow_status"] != db_task.workflow_status:
        needs_recalc = True
    if "start_date" in update_data and update_data["start_date"] != db_task.start_date:
        needs_recalc = True
    if "duration" in update_data and update_data["duration"] != db_task.duration:
        needs_recalc = True
        
    try:
        for k, v in update_data.items():
            setattr(db_task, k, v)
            
        if needs_recalc:
            recalculate_downstream(db, task_id)
            
        db.commit()
        db.refresh(db_task)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
        
    out = db_task.__dict__.copy()
    out["dependency_status"] = compute_dependency_status(db, db_task.id)
    return out

@app.put("/tasks/{task_id}/position", response_model=TaskOut)
def update_task_position(task_id: int, task_pos: TaskPositionUpdate, db: Session = Depends(get_db)):
    db_task = db.query(Task).get(task_id)
    if not db_task:
        raise HTTPException(status_code=404, detail="Task not found")
        
    needs_recalc = task_pos.workflow_status.value != db_task.workflow_status.value
    
    try:
        db_task.workflow_status = task_pos.workflow_status
        db_task.position = task_pos.position
        
        if needs_recalc:
            recalculate_downstream(db, task_id)
            
        db.commit()
        db.refresh(db_task)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
        
    out = db_task.__dict__.copy()
    out["dependency_status"] = compute_dependency_status(db, db_task.id)
    return out

@app.delete("/tasks/{task_id}")
def delete_task(task_id: int, db: Session = Depends(get_db)):
    db_task = db.query(Task).get(task_id)
    if not db_task:
        raise HTTPException(status_code=404, detail="Task not found")
        
    try:
        # Delete related edges
        db.query(Dependency).filter((Dependency.precursor_id == task_id) | (Dependency.dependent_id == task_id)).delete()
        db.delete(db_task)
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
        
    return {"status": "ok"}

@app.post("/dependencies")
def create_dependency(dep: DependencyCreate, db: Session = Depends(get_db)):
    is_valid, msg = validate_new_dependency(db, dep.precursor_id, dep.dependent_id)
    if not is_valid:
        raise HTTPException(status_code=400, detail=msg)
        
    try:
        db_dep = Dependency(precursor_id=dep.precursor_id, dependent_id=dep.dependent_id)
        db.add(db_dep)
        # Recalculate downstream
        recalculate_downstream(db, dep.precursor_id)
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
        
    return {"status": "ok"}

@app.delete("/dependencies")
def delete_dependency(precursor_id: int = Query(...), dependent_id: int = Query(...), db: Session = Depends(get_db)):
    db_dep = db.query(Dependency).filter_by(precursor_id=precursor_id, dependent_id=dependent_id).first()
    if not db_dep:
        raise HTTPException(status_code=404, detail="Dependency not found")
        
    try:
        db.delete(db_dep)
        recalculate_downstream(db, dependent_id) 
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
        
    return {"status": "ok"}

from collections import defaultdict, deque

@app.get("/critical-path")
def get_critical_path(db: Session = Depends(get_db)):
    tasks = db.query(Task).all()
    deps = db.query(Dependency).all()
    
    adj = defaultdict(list)
    in_degree = defaultdict(int)
    for d in deps:
        adj[d.precursor_id].append(d.dependent_id)
        in_degree[d.dependent_id] += 1
        
    all_task_ids = [t.id for t in tasks]
    q_topo = deque([t for t in all_task_ids if in_degree[t] == 0])
    topo_order = []
    
    while q_topo:
        u = q_topo.popleft()
        topo_order.append(u)
        for v in adj[u]:
            in_degree[v] -= 1
            if in_degree[v] == 0:
                q_topo.append(v)
                
    rev_adj = defaultdict(list)
    for d in deps:
        rev_adj[d.dependent_id].append(d.precursor_id)
        
    task_durations = {t.id: (t.duration or 0) for t in tasks}
    earliest_finish = {}
    predecessor = {}
    
    for u in topo_order:
        max_pre_ef = -1
        best_p = None
        for p in rev_adj[u]:
            ef = earliest_finish.get(p, 0)
            if ef > max_pre_ef:
                max_pre_ef = ef
                best_p = p
                
        earliest_finish[u] = task_durations[u] + (max_pre_ef if max_pre_ef > -1 else 0)
        predecessor[u] = best_p
        
    critical_path = []
    if earliest_finish:
        max_node = max(earliest_finish, key=earliest_finish.get)
        curr = max_node
        while curr is not None:
            critical_path.append(curr)
            curr = predecessor.get(curr)
        critical_path.reverse()
        
    return {
        "dependencies": [{"precursor_id": d.precursor_id, "dependent_id": d.dependent_id} for d in deps],
        "critical_path": critical_path
    }

from schemas import DependencySuggestionResponse, Suggestion
from ai_suggest import suggest_dependencies_llm

@app.post("/tasks/{task_id}/suggest-dependencies", response_model=DependencySuggestionResponse)
def suggest_task_dependencies(task_id: int, db: Session = Depends(get_db)):
    target_task = db.query(Task).get(task_id)
    if not target_task:
        raise HTTPException(status_code=404, detail="Task not found")
        
    other_tasks = db.query(Task).filter(Task.id != task_id).all()
    other_tasks_data = [{"id": t.id, "title": t.title, "description": t.description} for t in other_tasks]
    
    try:
        ai_response = suggest_dependencies_llm(target_task.title, target_task.description, other_tasks_data)
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))
        
    suggested_ids = ai_response.get("suggested_prerequisite_ids", [])
    reasoning = ai_response.get("reasoning", "No reasoning provided.")
    
    validated_suggestions = []
    for p_id in suggested_ids:
        # Validation
        is_valid, _ = validate_new_dependency(db, p_id, task_id)
        if is_valid:
            # find title
            p_task = next((t for t in other_tasks_data if t["id"] == p_id), None)
            if p_task:
                validated_suggestions.append(Suggestion(
                    task_id=p_id,
                    title=p_task["title"],
                    reasoning=reasoning
                ))
                
    return DependencySuggestionResponse(suggestions=validated_suggestions)
