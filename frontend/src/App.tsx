import { useEffect, useState } from 'react';
import { getTasks, getCriticalPath, updateTaskPosition, type Task, deleteTask, createTask, updateTask, createDependency, suggestDependencies, deleteDependency } from './api';
import { 
  DndContext, 
  type DragEndEvent, 
  type DragStartEvent,
  closestCorners, 
  useSensor, 
  useSensors, 
  PointerSensor, 
  DragOverlay,
  defaultDropAnimationSideEffects,
  useDndContext
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import ReactFlow, { Background, Controls, MarkerType } from 'reactflow';
import dagre from 'dagre';
import 'reactflow/dist/style.css';

const COLUMNS = ['Backlog', 'In Progress', 'Review', 'Done'] as const;

function Modal({ isOpen, onClose, title, children }: { isOpen: boolean, onClose: () => void, title: string, children: React.ReactNode }) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh] border border-transparent dark:border-white/10">
        <div className="flex justify-between items-center p-4 border-b border-gray-200 dark:border-slate-700 shrink-0">
          <h2 className="text-xl font-bold text-gray-800 dark:text-slate-100">{title}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-200 text-2xl leading-none">&times;</button>
        </div>
        <div className="p-4 overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
}

function TaskCard({ task, onEdit, onDelete, onView, isOverlay, isFirst, dependencies, allTasks }: { task: Task, onEdit?: (t: Task) => void, onDelete?: (id: number) => void, onView?: (t: Task) => void, isOverlay?: boolean, isFirst?: boolean, dependencies?: {precursor_id: number, dependent_id: number}[], allTasks?: Task[] }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id.toString(), data: task });

  let finalTransform = CSS.Translate.toString(transform);
  if (isOverlay) {
    finalTransform = finalTransform ? `${finalTransform} scale(1.05) rotate(1deg)` : 'scale(1.05) rotate(1deg)';
  }

  const style = {
    transform: finalTransform,
    transition,
    opacity: isDragging && !isOverlay ? 0.3 : 1,
  };

  const isBlocked = task.dependency_status !== 'Ready';
  const borderColor = isBlocked ? 'border-l-amber-500 dark:border-l-amber-500' : 'border-l-green-500 dark:border-l-green-500';

  return (
    <div 
      ref={setNodeRef} 
      style={style} 
      {...attributes} 
      {...listeners} 
      onClick={() => onView && onView(task)}
      className={`bg-white dark:bg-slate-800/80 p-5 rounded-xl shadow-sm dark:shadow-lg dark:shadow-black/40 mb-4 border border-gray-200 dark:border-white/10 border-l-4 ${borderColor} cursor-grab active:cursor-grabbing flex flex-col gap-2 transition-shadow ${isOverlay ? 'shadow-2xl ring-2 ring-blue-500 z-50' : 'hover:shadow-md'} ${isBlocked ? 'dark:shadow-[0_0_20px_-5px_rgba(245,158,11,0.5)]' : 'dark:shadow-[0_0_20px_-5px_rgba(34,197,94,0.4)]'} relative`}
    >
      <div className="flex justify-between items-start gap-3">
        <h3 className="font-bold text-gray-800 dark:text-slate-100 leading-tight">{task.title}</h3>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          {isFirst && !isOverlay && (
            <span className="bg-slate-800 dark:bg-slate-100 text-white dark:text-slate-900 text-[9px] font-bold px-2 py-0.5 rounded shadow-sm border border-slate-700 dark:border-slate-200 dark:shadow-[0_0_10px_rgba(255,255,255,0.2)]">
              NEXT UP
            </span>
          )}
          <span className={`flex items-center gap-1 px-2 py-0.5 text-[11px] uppercase tracking-wider font-bold rounded-full border ${
          !isBlocked 
            ? 'bg-green-50 text-green-700 border-green-200' 
            : 'bg-amber-50 text-amber-700 border-amber-200'
        }`}>
          {isBlocked && (
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          )}
          {task.dependency_status}
        </span>
        </div>
      </div>
      <div className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-1 flex items-center">
        <span className="mr-3 inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-100 font-bold leading-none">{task.id}</span>
        {task.start_date && <span>{new Date(task.start_date + (task.start_date.includes('Z') ? '' : 'Z')).toLocaleDateString(undefined, {timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric'})}</span>}
      </div>
      
      {(() => {
        if (!dependencies || !allTasks) return null;
        const myPrecursors = dependencies.filter(d => d.dependent_id === task.id).map(d => {
          const t = allTasks.find(t => t.id === d.precursor_id);
          return t ? t.title : String(d.precursor_id);
        });
        if (myPrecursors.length === 0) return null;
        return (
          <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 truncate" title={"Depends on: " + myPrecursors.join(', ')}>
            Depends on: {myPrecursors.join(', ')}
          </div>
        );
      })()}

      <div className="flex justify-end gap-3 mt-2 pt-3 border-t border-slate-100 dark:border-slate-600">
        {onEdit && <button onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onEdit(task); }} className="text-blue-600 hover:text-blue-800 text-xs font-bold uppercase tracking-wider transition-colors">Edit</button>}
        {onDelete && <button onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onDelete(task.id); }} className="text-red-600 hover:text-red-800 text-xs font-bold uppercase tracking-wider transition-colors">Delete</button>}
      </div>
    </div>
  );
}

const getColumnColor = (title: string) => {
  switch(title) {
    case 'Backlog': return 'border-t-blue-400 dark:border-t-blue-500';
    case 'In Progress': return 'border-t-indigo-400 dark:border-t-indigo-500';
    case 'Review': return 'border-t-purple-400 dark:border-t-purple-500';
    case 'Done': return 'border-t-rose-400 dark:border-t-rose-500';
    default: return 'border-t-gray-400 dark:border-t-gray-500';
  }
};

function Column({ title, tasks, onEdit, onDelete, onView, dependencies, allTasks }: { id: string, title: string, tasks: Task[], onEdit: (t:Task)=>void, onDelete: (id:number)=>void, onView?: (t: Task) => void, dependencies?: {precursor_id: number, dependent_id: number}[], allTasks?: Task[] }) {
  const { setNodeRef } = useSortable({ id: title, data: { type: 'Column', title } });
  const { over } = useDndContext();
  
  const isOver = over?.id === title || tasks.some(t => t.id.toString() === over?.id);

  return (
    <div ref={setNodeRef} className={`bg-white dark:bg-[#12172380] dark:backdrop-blur-md p-4 rounded-xl flex-1 min-w-[250px] flex flex-col h-full border-t-4 border-b border-l border-r border-gray-200 dark:border-white/5 shadow-sm ${getColumnColor(title)} ${isOver ? 'ring-2 ring-blue-400 bg-blue-50/50 dark:bg-blue-900/20' : ''} transition-all`}>
      <div className="flex justify-between items-center mb-4 px-1">
        <h2 className="font-bold text-slate-700 dark:text-slate-200">{title}</h2>
        <span className="bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-bold px-2.5 py-1 rounded-full">{tasks.length}</span>
      </div>
      <div className="flex-1 overflow-y-auto overflow-x-hidden pr-2 kanban-scroll">
        <SortableContext items={tasks.map(t => t.id.toString())} strategy={verticalListSortingStrategy}>
          {tasks.map((task, idx) => (
            <TaskCard key={task.id} task={task} onEdit={onEdit} onDelete={onDelete} onView={onView} dependencies={dependencies} allTasks={allTasks} isFirst={idx === 0} />
          ))}
        </SortableContext>
      </div>
    </div>
  );
}



const generateGraph = (tasks: Task[], dependencies: any[], criticalPath: number[], showCritical: boolean, isDarkMode: boolean) => {
    const dagreGraph = new dagre.graphlib.Graph();
    dagreGraph.setDefaultEdgeLabel(() => ({}));
    dagreGraph.setGraph({ rankdir: 'LR', ranksep: 250, nodesep: 100 }); // Left to right with increased spacing

    const nodes: any[] = [];
    const edges: any[] = [];

    // Add nodes to dagre
    tasks.forEach(t => {
      // dagre expects node dimensions
      dagreGraph.setNode(t.id.toString(), { width: 180, height: 60 });
    });

    // Add edges to dagre
    dependencies.forEach(d => {
      dagreGraph.setEdge(d.precursor_id.toString(), d.dependent_id.toString());
    });

    // Run layout
    dagre.layout(dagreGraph);

    // Build React Flow nodes
    tasks.forEach(t => {
      const nodeWithPosition = dagreGraph.node(t.id.toString());
      const isCritical = showCritical && criticalPath.includes(t.id);
      const isBlocked = t.dependency_status !== 'Ready';
      
      nodes.push({
        id: t.id.toString(),
        position: {
          x: nodeWithPosition.x - 90, // shift by half width for top-left anchor
          y: nodeWithPosition.y - 30  // shift by half height
        },
        data: { label: t.title },
        style: {
          background: '#fff',
          border: '1px solid #e2e8f0',
          borderLeft: `4px solid ${isBlocked ? '#f59e0b' : '#22c55e'}`,
          borderRadius: '8px',
          padding: '10px 15px',
          fontSize: '12px',
          fontWeight: 'bold',
          color: '#1e293b',
          boxShadow: isCritical ? '0 0 0 2px red' : '0 1px 2px 0 rgb(0 0 0 / 0.05)',
          width: 180
        }
      });
    });

    // Build React Flow edges
    dependencies.forEach(d => {
       const isCritical = showCritical && criticalPath.includes(d.precursor_id) && criticalPath.includes(d.dependent_id) && criticalPath.indexOf(d.dependent_id) === criticalPath.indexOf(d.precursor_id) + 1;
       edges.push({
         id: `e${d.precursor_id}-${d.dependent_id}`,
         source: d.precursor_id.toString(),
         target: d.dependent_id.toString(),
         animated: isCritical,
         type: 'smoothstep', // Use smoothstep or default for cleaner look
         style: { stroke: isCritical ? 'red' : (isDarkMode ? '#64748b' : '#94a3b8'), strokeWidth: isCritical ? 2 : 1 },
         markerEnd: {
           type: MarkerType.ArrowClosed,
           color: isCritical ? 'red' : (isDarkMode ? '#64748b' : '#94a3b8')
         }
       });
    });

    return { nodes, edges };
}


type ToastType = { id: number, message: string, type: 'success' | 'error' };

function ToastContainer({ toasts }: { toasts: ToastType[] }) {
  return (
    <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2">
      {toasts.map(t => (
        <div key={t.id} className={`px-4 py-3 rounded-lg shadow-lg text-sm font-medium text-white flex items-center gap-2 transform transition-all ${t.type === 'error' ? 'bg-red-600' : 'bg-green-600'}`}>
          {t.type === 'error' ? (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
          ) : (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
          )}
          {t.message}
        </div>
      ))}
    </div>
  );
}

export default function App() {
  const [toasts, setToasts] = useState<ToastType[]>([]);
  const showToast = (message: string, type: 'success' | 'error') => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000);
  };
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    setTimeout(() => {
      setIsLoggingIn(false);
      setIsAuthenticated(true);
    }, 400);
  };

  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [viewMode, setViewMode] = useState<'kanban' | 'graph'>('kanban');
  const [showCriticalPath, setShowCriticalPath] = useState(false);
  const [graphData, setGraphData] = useState<{dependencies: any[], critical_path: number[]}>({ dependencies: [], critical_path: [] });
  const [graphLoading, setGraphLoading] = useState(false);

  const handleToggleView = async () => {
    if (viewMode === 'kanban') {
      setViewMode('graph');
      setGraphLoading(true);
      try {
        const { data } = await getCriticalPath();
        setGraphData(data);
      } catch (err) {
        console.error('Failed to load critical path data:', err);
      }
      setGraphLoading(false);
    } else {
      setViewMode('kanban');
    }
  };


  const [activeId, setActiveId] = useState<string | null>(null);
  
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [viewingTask, setViewingTask] = useState<Task | null>(null);
  
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState<number | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [pendingDrag, setPendingDrag] = useState<{ taskId: number, targetStatus: string, originalTasks: Task[] } | null>(null);

  const [formData, setFormData] = useState({ title: '', description: '', start_date: '', duration: '' });
  const [selectedDependency, setSelectedDependency] = useState('');

  // AI suggestion state
  const [aiSuggestions, setAiSuggestions] = useState<{task_id: number, title: string, reasoning: string}[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [selectedAiDependencies, setSelectedAiDependencies] = useState<number[]>([]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    })
  );

  
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  const toggleDarkMode = () => setIsDarkMode(prev => !prev);

  const fetchTasks = () => {
    getTasks()
      .then(res => setTasks(res.data))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));

    getCriticalPath()
      .then(res => setGraphData(res.data))
      .catch(err => console.error('Failed to load dependencies:', err));
  };

  useEffect(() => {
    fetchTasks();
  }, []);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const taskId = parseInt(active.id as string);
    const overId = over.id as string;
    
    const activeTask = tasks.find(t => t.id === taskId);
    if (!activeTask) return;

    let targetStatus = activeTask.workflow_status;
    const overTask = tasks.find(t => t.id.toString() === overId);
    if (overTask) {
      targetStatus = overTask.workflow_status;
    } else if (COLUMNS.includes(overId as any)) {
      targetStatus = overId as any;
    }

    if (activeTask.workflow_status === targetStatus) return;

    const prevTasks = [...tasks];
    setTasks(tasks.map(t => t.id === taskId ? { ...t, workflow_status: targetStatus as any } : t));

    if (targetStatus === 'Done' && activeTask.dependency_status === 'Blocked') {
      setPendingDrag({ taskId, targetStatus, originalTasks: prevTasks });
      return;
    }

    try {
      await updateTaskPosition(taskId, targetStatus, activeTask.position);
      fetchTasks();
    } catch (err: any) {
      setTasks(prevTasks);
      showToast('Failed to update task: ' + (err.response?.data?.detail || err.message), 'error');
    }
  };

  const confirmDrag = async () => {
    if (!pendingDrag) return;
    const { taskId, targetStatus, originalTasks } = pendingDrag;
    const activeTask = originalTasks.find(t => t.id === taskId);
    setPendingDrag(null);
    if (!activeTask) return;
    try {
      await updateTaskPosition(taskId, targetStatus as any, activeTask.position);
      fetchTasks();
    } catch (err: any) {
      setTasks(originalTasks);
      showToast('Failed to update task: ' + (err.response?.data?.detail || err.message), 'error');
    }
  };

  const cancelDrag = () => {
    if (!pendingDrag) return;
    setTasks(pendingDrag.originalTasks);
    setPendingDrag(null);
  };

  const confirmDelete = async () => {
    if (taskToDelete === null) return;
    try {
      await deleteTask(taskToDelete);
      fetchTasks();
    } catch (err: any) {
      showToast('Failed to delete: ' + err.message, 'error');
    }
    setIsDeleteModalOpen(false);
    setTaskToDelete(null);
  };

    const handleRemoveDependency = async (precursor_id: number, dependent_id: number) => {
    try {
      await deleteDependency(precursor_id, dependent_id);
      fetchTasks();
    } catch (err: any) {
      showToast('Failed to remove dependency: ' + (err.response?.data?.detail || err.message), 'error');
    }
  };

const handleSaveTask = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload: Partial<Task> = {
        title: formData.title,
        description: formData.description || undefined,
      };
      
      if (formData.start_date) {
        payload.start_date = new Date(formData.start_date).toISOString();
      } else {
        payload.start_date = undefined;
      }
      
      if (formData.duration) {
        payload.duration = parseFloat(formData.duration);
      } else {
        payload.duration = undefined;
      }

      if (editingTask) {
        let hasError = false;
        await updateTask(editingTask.id, payload);

        if (selectedDependency) {
          try {
             await createDependency(parseInt(selectedDependency), editingTask.id);
          } catch (depErr: any) {
             hasError = true;
             showToast('Error adding manual dependency: ' + (depErr.response?.data?.detail || depErr.message), 'error');
          }
        }

        if (selectedAiDependencies.length > 0) {
          for (const depId of selectedAiDependencies) {
            try {
               await createDependency(depId, editingTask.id);
            } catch (depErr: any) {
               hasError = true;
               console.error('Error adding AI dependency: ' + (depErr.response?.data?.detail || depErr.message));
               showToast('Error adding AI dependency: ' + (depErr.response?.data?.detail || depErr.message), 'error');
            }
          }
        }

        if (!hasError) {
          showToast('Task updated successfully', 'success');
        }
        fetchTasks();
        closeTaskModal();
      } else {
        const res = await createTask(payload);
        fetchTasks();
        openEditModal(res.data);
      }
    } catch (err: any) {
      showToast('Error saving task: ' + (err.response?.data?.detail || err.message), 'error');
    }
  };

  const handleSuggestDependencies = async () => {
    if (!editingTask) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const res = await suggestDependencies(editingTask.id);
      setAiSuggestions(res.data.suggestions || []);
      if (res.data.suggestions.length === 0) {
        setAiError("No valid dependencies found.");
      }
    } catch (err: any) {
      setAiError('Failed to get AI suggestions: ' + (err.response?.data?.detail || err.message));
    } finally {
      setAiLoading(false);
    }
  };

  const toggleAiDependency = (id: number) => {
    setSelectedAiDependencies(prev => 
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
  };

  const openCreateModal = () => {
    setEditingTask(null);
    setFormData({ title: '', description: '', start_date: '', duration: '' });
    setSelectedDependency('');
    setAiSuggestions([]);
    setSelectedAiDependencies([]);
    setAiError(null);
    setIsTaskModalOpen(true);
  };

  const openEditModal = (task: Task) => {
    setEditingTask(task);
    setFormData({ 
      title: task.title, 
      description: task.description || '', 
      start_date: task.start_date ? task.start_date.split("T")[0] : '', 
      duration: task.duration ? task.duration.toString() : '' 
    });
    setSelectedDependency('');
    setAiSuggestions([]);
    setSelectedAiDependencies([]);
    setAiError(null);
    setIsTaskModalOpen(true);
  };

  const closeTaskModal = () => {
    setIsTaskModalOpen(false);
    setEditingTask(null);
  };

  const activeTaskObj = activeId ? tasks.find(t => t.id.toString() === activeId) : null;

  if (!isAuthenticated) {
    return (
      <div className={`min-h-screen ${isDarkMode ? 'dark' : ''}`}>
        <div className="min-h-screen flex bg-slate-50 dark:bg-[#0a0e17] transition-colors duration-200">
          
          {/* Left Side: Illustration Panel (hidden on mobile) */}
          <div className="hidden lg:flex lg:w-[55%] xl:w-[60%] relative items-center justify-center bg-gradient-to-br from-blue-600 to-indigo-800 dark:from-blue-900/80 dark:to-[#05070a] overflow-hidden">
            <div className="absolute inset-0 z-0 pointer-events-none opacity-20" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '32px 32px' }}></div>
            
            <div className="relative z-10 flex flex-col items-center justify-center p-12 text-white">
              {/* Inline SVG: Abstract workflow/DAG nodes */}
              <svg className="w-72 h-72 mb-10 text-blue-100 drop-shadow-2xl" viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
                {/* Connecting Lines */}
                <path d="M40 100 L100 50" stroke="currentColor" strokeWidth="3" strokeDasharray="6 6" />
                <path d="M40 100 L100 150" stroke="currentColor" strokeWidth="3" strokeDasharray="6 6" />
                <path d="M100 50 L160 100" stroke="currentColor" strokeWidth="3" />
                <path d="M100 150 L160 100" stroke="currentColor" strokeWidth="3" />
                
                {/* Flow arrows */}
                <circle cx="70" cy="75" r="4" fill="currentColor" />
                <circle cx="130" cy="75" r="4" fill="currentColor" />
                <circle cx="70" cy="125" r="4" fill="currentColor" />
                
                {/* Nodes */}
                <rect x="25" y="85" width="30" height="30" rx="8" fill="white" fillOpacity="0.15" stroke="white" strokeWidth="2" />
                <rect x="85" y="35" width="30" height="30" rx="8" fill="white" fillOpacity="0.15" stroke="white" strokeWidth="2" />
                <rect x="85" y="135" width="30" height="30" rx="8" fill="white" fillOpacity="0.15" stroke="white" strokeWidth="2" />
                <rect x="145" y="85" width="30" height="30" rx="8" fill="white" fillOpacity="0.15" stroke="white" strokeWidth="2" />
                
                {/* Status indicators */}
                <circle cx="40" cy="100" r="4" fill="#4ade80" /> {/* Green/Ready */}
                <circle cx="100" cy="50" r="4" fill="#fbbf24" /> {/* Amber/Blocked */}
              </svg>
              
              <h2 className="text-4xl font-extrabold tracking-tight text-white mb-4">Visualize dependencies.</h2>
              <p className="text-blue-100/80 text-xl font-medium tracking-wide">Ship with confidence.</p>
            </div>
          </div>

          {/* Right Side: Login Form */}
          <div className="flex-1 flex items-center justify-center relative p-6">
            <div className="absolute inset-0 z-0 pointer-events-none opacity-[0.2] dark:opacity-[0.05]" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, currentColor 1px, transparent 0)', backgroundSize: '24px 24px', color: isDarkMode ? '#94a3b8' : '#64748b' }}></div>
            
            <div className="relative z-10 w-full max-w-[400px] bg-white dark:bg-[#121723cc] backdrop-blur-md p-8 rounded-2xl shadow-xl dark:shadow-2xl dark:shadow-black/50 border border-gray-100 dark:border-white/10 mx-auto">
              
              <div className="text-center mb-8">
                <h1 className="text-3xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">TaskFlow Pro</h1>
                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Dependency-aware workflow & DAG scheduling</p>
              </div>
              
              <form onSubmit={handleLogin} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5 text-left">Email</label>
                  <input type="email" placeholder="name@company.com" className="block w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 shadow-sm p-2.5 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-colors" />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5 text-left">Password</label>
                  <input type="password" placeholder="••••••••" className="block w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 shadow-sm p-2.5 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-colors" />
                </div>
                
                <button type="submit" disabled={isLoggingIn} className="w-full flex justify-center items-center py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:focus:ring-offset-[#0a0e17] disabled:opacity-70 transition-colors mt-2">
                  {isLoggingIn ? (
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  ) : null}
                  {isLoggingIn ? 'Signing in...' : 'Sign In'}
                </button>
              </form>
              
              <p className="mt-6 text-center text-xs text-slate-400 dark:text-slate-500">
                Demo login — any credentials work.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (loading) return <div className="p-10 text-center">Loading Tasks...</div>;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0a0e17] p-12 font-sans text-slate-900 dark:text-slate-100 transition-colors duration-200 relative">
      <div className="fixed inset-0 z-0 pointer-events-none opacity-[0.2] dark:opacity-[0.06]" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, currentColor 1px, transparent 0)', backgroundSize: '24px 24px', color: isDarkMode ? '#94a3b8' : '#64748b' }}></div>
      <div className="relative z-10 max-w-[95%] xl:max-w-7xl mx-auto dark:text-slate-200">
        <header className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-extrabold text-gray-900 dark:text-slate-100 tracking-tight">TaskFlow Pro</h1>
          
          <div className="flex items-center gap-4">
            {viewMode === 'graph' && (
              <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 bg-white px-3 py-1.5 rounded-lg border border-gray-200 shadow-sm cursor-pointer hover:bg-gray-50 transition-colors">
                <input type="checkbox" checked={showCriticalPath} onChange={e => setShowCriticalPath(e.target.checked)} className="rounded text-red-600 focus:ring-red-500" />
                Highlight Critical Path
              </label>
            )}
            <button 
              onClick={toggleDarkMode} 
              className="relative inline-flex h-8 w-14 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent bg-slate-300 dark:bg-blue-600 transition-colors duration-200 ease-in-out hover:opacity-80" 
              title="Toggle Dark Mode"
            >
              <span className="sr-only">Toggle Dark Mode</span>
              <span
                aria-hidden="true"
                className={`pointer-events-none inline-block h-7 w-7 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${isDarkMode ? 'translate-x-6' : 'translate-x-0'}`}
              />
            </button>
            <button onClick={handleToggleView} className="bg-white dark:bg-white/5 hover:bg-gray-50 dark:hover:bg-white/10 text-gray-700 dark:text-slate-300 border border-gray-300 dark:border-white/5 px-4 py-2 rounded-lg font-semibold shadow-sm transition-colors">
              {viewMode === 'kanban' ? 'Graph View' : 'Kanban View'}
            </button>
            <button onClick={openCreateModal} className="bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500 dark:shadow-[0_0_15px_-3px_rgba(59,130,246,0.5)] text-white px-6 py-2 rounded-lg font-semibold shadow-sm transition-colors">
              + Create Task
            </button>
          </div>

        </header>
        
        {error && <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-6">{error}</div>}

        
        {viewMode === 'kanban' ? (
        <DndContext 
          sensors={sensors} 
          collisionDetection={closestCorners} 
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="flex gap-8 h-[75vh]">
            {COLUMNS.map(col => (
              <Column 
                key={col} 
                id={col} 
                title={col} 
                tasks={tasks.filter(t => t.workflow_status === col)} 
                onEdit={openEditModal}
                onDelete={(id) => { setTaskToDelete(id); setIsDeleteModalOpen(true); }}
                onView={setViewingTask}
                dependencies={graphData.dependencies}
                allTasks={tasks}
              />
            ))}
          </div>
          <DragOverlay dropAnimation={{ sideEffects: defaultDropAnimationSideEffects({ styles: { active: { opacity: "0.4" } } }) }}>
            {activeTaskObj ? <TaskCard task={activeTaskObj} isOverlay /> : null}
          </DragOverlay>
        </DndContext>
        ) : (
          <div className={`h-[75vh] w-full rounded-xl shadow-sm border overflow-hidden ${isDarkMode ? 'bg-[#0f1420] border-white/5' : 'bg-white border-gray-200'}`}>
            {graphLoading ? (
              <div className="flex items-center justify-center h-full text-gray-500 font-medium">Loading graph data...</div>
            ) : (
              <ReactFlow 
                {...generateGraph(tasks, graphData.dependencies, graphData.critical_path, showCriticalPath, isDarkMode)}
                fitView
              >
                <Background color={isDarkMode ? '#475569' : '#cbd5e1'} />
                <Controls className={isDarkMode ? 'dark-controls' : ''} />
              </ReactFlow>
            )}
          </div>
        )}

      </div>


            <Modal isOpen={!!viewingTask} onClose={() => setViewingTask(null)} title="Task Details">
        {viewingTask && (() => {
          const liveTask = tasks.find(t => t.id === viewingTask.id) || viewingTask;
          const myPrecursors = graphData.dependencies.filter(d => d.dependent_id === liveTask.id).map(d => tasks.find(t => t.id === d.precursor_id)).filter(Boolean) as Task[];
          const myDependents = graphData.dependencies.filter(d => d.precursor_id === liveTask.id).map(d => tasks.find(t => t.id === d.dependent_id)).filter(Boolean) as Task[];
          return (
            <div className="space-y-4">
              <div>
                <h3 className="text-xl font-semibold text-gray-900 dark:text-slate-100">{liveTask.title}</h3>
                <p className="text-sm text-gray-500 mt-1">Status: {liveTask.workflow_status} | {liveTask.dependency_status}</p>
              </div>
              
              {liveTask.description && (
                <div>
                  <h4 className="text-sm font-medium text-gray-700 dark:text-slate-300">Description</h4>
                  <p className="text-sm text-gray-600 dark:text-slate-400 mt-1 whitespace-pre-wrap">{liveTask.description}</p>
                </div>
              )}
              
              <div className="flex gap-4">
                {liveTask.start_date && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-700 dark:text-slate-300">Start Date</h4>
                    <p className="text-sm text-gray-600 dark:text-slate-400">
                      {new Date(liveTask.start_date + (liveTask.start_date.includes('Z') ? '' : 'Z')).toLocaleDateString('en-GB', { timeZone: 'UTC', day: '2-digit', month: 'short', year: 'numeric' })}
                    </p>
                  </div>
                )}
                {liveTask.duration != null && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-700 dark:text-slate-300">Duration</h4>
                    <p className="text-sm text-gray-600 dark:text-slate-400">{liveTask.duration} days</p>
                  </div>
                )}
              </div>
              
              {myPrecursors.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-gray-700 dark:text-slate-300">Depends on</h4>
                  <ul className="list-disc list-inside text-sm text-gray-600 dark:text-slate-400 mt-1">
                    {myPrecursors.map(t => <li key={t.id}>{t.title}</li>)}
                  </ul>
                </div>
              )}
              
              {myDependents.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-gray-700 dark:text-slate-300">Blocks</h4>
                  <ul className="list-disc list-inside text-sm text-gray-600 dark:text-slate-400 mt-1">
                    {myDependents.map(t => <li key={t.id}>{t.title}</li>)}
                  </ul>
                </div>
              )}

              <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-100 dark:border-slate-700">
                <button type="button" onClick={() => setViewingTask(null)} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-slate-300 bg-white dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-md hover:bg-gray-50 dark:hover:bg-slate-600 transition-colors">Close</button>
                <button type="button" onClick={() => { setViewingTask(null); openEditModal(liveTask); }} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 dark:hover:bg-blue-500 transition-colors dark:shadow-[0_0_15px_-3px_rgba(59,130,246,0.5)]">Edit Task</button>
              </div>
            </div>
          );
        })()}
      </Modal>

      <Modal isOpen={isTaskModalOpen} onClose={closeTaskModal} title={editingTask ? "Edit Task" : "Create Task"}>
        <form onSubmit={handleSaveTask} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300">Title <span className="text-red-500">*</span></label>
            <input required type="text" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} className="mt-1 block w-full rounded-md border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:placeholder-slate-500 shadow-sm p-2 border focus:border-blue-500 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300">Description</label>
            <textarea value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} className="mt-1 block w-full rounded-md border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:placeholder-slate-500 shadow-sm p-2 border focus:border-blue-500 focus:ring-blue-500" rows={3}></textarea>
          </div>
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300">Start Date</label>
              <input type="date" value={formData.start_date} onChange={e => setFormData({...formData, start_date: e.target.value})} className="mt-1 block w-full rounded-md border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:placeholder-slate-500 shadow-sm p-2 border focus:border-blue-500 focus:ring-blue-500" />
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300">Duration (Days)</label>
              <input type="number" step="0.5" min="0" value={formData.duration} onChange={e => setFormData({...formData, duration: e.target.value})} className="mt-1 block w-full rounded-md border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:placeholder-slate-500 shadow-sm p-2 border focus:border-blue-500 focus:ring-blue-500" />
            </div>
          </div>
          
          {editingTask && (() => {
            const currentPrecursors = graphData.dependencies.filter(d => d.dependent_id === editingTask.id).map(d => tasks.find(t => t.id === d.precursor_id)).filter(Boolean) as Task[];
            const availableTasks = tasks.filter(t => t.id !== editingTask.id && !currentPrecursors.some(p => p.id === t.id));

            return (
            <div className="border-t border-gray-200 dark:border-slate-700 pt-4 mt-4">
              
              {currentPrecursors.length > 0 && (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">Current Prerequisites</label>
                  <div className="flex flex-wrap gap-2">
                    {currentPrecursors.map(p => (
                      <span key={p.id} className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-600">
                        {p.title}
                        <button type="button" onClick={() => handleRemoveDependency(p.id, editingTask.id)} className="text-slate-400 hover:text-red-500 focus:outline-none ml-1 text-lg leading-none">&times;</button>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Add Prerequisite Dependency</label>
              <select value={selectedDependency} onChange={e => setSelectedDependency(e.target.value)} className="block w-full rounded-md border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 shadow-sm p-2 border focus:border-blue-500 focus:ring-blue-500 mb-4">
                <option value="">-- Select manually --</option>
                {availableTasks.map(t => (
                  <option key={t.id} value={t.id}>[{t.id}] {t.title}</option>
                ))}
              </select>

              <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-semibold text-blue-900">AI Dependency Suggestions</h4>
                  <button 
                    type="button"
                    onClick={handleSuggestDependencies}
                    disabled={aiLoading}
                    className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded flex items-center transition-colors disabled:opacity-50"
                  >
                    {aiLoading ? "Thinking..." : "✨ Suggest"}
                  </button>
                </div>
                
                {aiError && (
                  <div className="text-sm text-red-600 mb-3 bg-red-50 p-2 rounded border border-red-200">
                    {aiError}
                  </div>
                )}

                {aiSuggestions.length > 0 && (
                  <div className="space-y-2">
                    {aiSuggestions.map(s => (
                      <label key={s.task_id} className="flex items-start gap-2 bg-white p-2 rounded border border-blue-100 cursor-pointer hover:bg-blue-50/50">
                        <input 
                          type="checkbox" 
                          className="mt-1"
                          checked={selectedAiDependencies.includes(s.task_id)}
                          onChange={() => toggleAiDependency(s.task_id)}
                        />
                        <div className="flex-1 text-sm">
                          <span className="font-semibold block text-gray-800">{s.title}</span>
                          <span className="text-gray-600 text-xs mt-0.5 block">{s.reasoning}</span>
                        </div>
                      </label>
                    ))}
                  </div>
                )}
                {aiSuggestions.length === 0 && !aiLoading && !aiError && (
                  <p className="text-xs text-blue-600/70">Click suggest to let AI find missing prerequisites.</p>
                )}
              </div>
            </div>
            );
          })()}

          <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-100">
            <button type="button" onClick={closeTaskModal} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors">Cancel</button>
            <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 transition-colors">Save</button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={!!pendingDrag} onClose={cancelDrag} title="Warning: Task Blocked">
        <div className="space-y-4">
          <p className="text-gray-700 dark:text-slate-300">This task is still Blocked because a prerequisite isn't finished. Mark it Done anyway?</p>
          <div className="flex justify-end gap-3 mt-6">
            <button onClick={cancelDrag} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-slate-300 bg-white dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-md hover:bg-gray-50 dark:hover:bg-slate-600 transition-colors">Cancel</button>
            <button onClick={confirmDrag} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700">Confirm</button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={isDeleteModalOpen} onClose={() => setIsDeleteModalOpen(false)} title="Confirm Deletion">
        <div className="space-y-4">
          <p className="text-gray-700 dark:text-slate-300">Are you sure you want to delete this task? This action cannot be undone.</p>
          <div className="flex justify-end gap-3 mt-6">
            <button onClick={() => setIsDeleteModalOpen(false)} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-slate-300 bg-white dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-md hover:bg-gray-50 dark:hover:bg-slate-600 transition-colors">Cancel</button>
            <button onClick={confirmDelete} className="px-4 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-md hover:bg-red-700">Delete</button>
          </div>
        </div>
      </Modal>
      <ToastContainer toasts={toasts} />
    </div>
  );
}

