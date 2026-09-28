from sqlalchemy.orm import Session
from database import Task, Dependency, WorkflowStatus
from collections import defaultdict, deque
from datetime import timedelta, timezone, datetime


def ensure_utc(dt):
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt

def _get_adj_list(db: Session):
    deps = db.query(Dependency).all()
    adj = defaultdict(list)
    for d in deps:
        adj[d.precursor_id].append(d.dependent_id)
    return adj

def would_create_cycle(db: Session, precursor_id: int, dependent_id: int) -> bool:
    adj = _get_adj_list(db)
    adj[precursor_id].append(dependent_id)
    
    visited = set()
    rec_stack = set()
    
    def dfs(node):
        visited.add(node)
        rec_stack.add(node)
        
        for neighbor in adj[node]:
            if neighbor not in visited:
                if dfs(neighbor):
                    return True
            elif neighbor in rec_stack:
                return True
                
        rec_stack.remove(node)
        return False
        
    for node in list(adj.keys()) + [precursor_id, dependent_id]:
        if node not in visited:
            if dfs(node):
                return True
                
    return False

def validate_new_dependency(db: Session, precursor_id: int, dependent_id: int) -> tuple[bool, str]:
    if precursor_id == dependent_id:
        return False, "Cannot create a self-dependency."
        
    p_task = db.query(Task).get(precursor_id)
    d_task = db.query(Task).get(dependent_id)
    
    if not p_task or not d_task:
        return False, "One or both task IDs do not exist."
        
    existing = db.query(Dependency).filter_by(precursor_id=precursor_id, dependent_id=dependent_id).first()
    if existing:
        return False, "Duplicate dependency edge."
        
    if would_create_cycle(db, precursor_id, dependent_id):
        return False, "Adding this dependency would create a cycle."
        
    return True, "Valid dependency."

def compute_dependency_status(db: Session, task_id: int) -> str:
    precursors = db.query(Dependency).filter_by(dependent_id=task_id).all()
    if not precursors:
        return "Ready"
        
    for p in precursors:
        p_task = db.query(Task).get(p.precursor_id)
        if p_task.workflow_status != WorkflowStatus.DONE:
            return "Blocked"
            
    return "Ready"

def recalculate_downstream(db: Session, task_id: int):
    adj = _get_adj_list(db)
    
    in_degree = defaultdict(int)
    all_nodes = set(adj.keys())
    for nodes in adj.values():
        all_nodes.update(nodes)
        
    for u in adj:
        for v in adj[u]:
            in_degree[v] += 1
            
    reachable = set()
    q = deque([task_id])
    while q:
        curr = q.popleft()
        for neighbor in adj[curr]:
            if neighbor not in reachable:
                reachable.add(neighbor)
                q.append(neighbor)
                
    q_topo = deque([u for u in all_nodes if in_degree[u] == 0])
    topo_order = []
    
    while q_topo:
        u = q_topo.popleft()
        topo_order.append(u)
        for v in adj[u]:
            in_degree[v] -= 1
            if in_degree[v] == 0:
                q_topo.append(v)
                
    for node in topo_order:
        if node in reachable:
            t = db.query(Task).get(node)
            
            # Recompute schedule (rule 3)
            precursors = db.query(Dependency).filter_by(dependent_id=node).all()
            if precursors:
                max_finish = None
                for p in precursors:
                    p_t = db.query(Task).get(p.precursor_id)
                    if p_t.start_date is not None and p_t.duration is not None:
                        p_start = ensure_utc(p_t.start_date)
                        finish_date = p_start + timedelta(days=p_t.duration)
                        if max_finish is None or finish_date > ensure_utc(max_finish):
                            max_finish = finish_date
                
                t.start_date = max_finish
            db.commit()
