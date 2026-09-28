import axios from 'axios';

const API_URL = 'http://localhost:8000';

export interface Task {
  id: number;
  title: string;
  description?: string;
  workflow_status: 'Backlog' | 'In Progress' | 'Review' | 'Done';
  position: number;
  start_date?: string;
  duration?: number;
  dependency_status: 'Ready' | 'Blocked';
}

export const getTasks = () => axios.get<Task[]>(`${API_URL}/tasks`);
export const createTask = (task: Partial<Task>) => axios.post<Task>(`${API_URL}/tasks`, task);
export const updateTask = (id: number, task: Partial<Task>) => axios.put<Task>(`${API_URL}/tasks/${id}`, task);
export const updateTaskPosition = (id: number, status: string, position: number) => axios.put<Task>(`${API_URL}/tasks/${id}/position`, { workflow_status: status, position });
export const deleteTask = (id: number) => axios.delete(`${API_URL}/tasks/${id}`);
export const createDependency = (precursor_id: number, dependent_id: number) => axios.post(`${API_URL}/dependencies`, { precursor_id, dependent_id });
export const deleteDependency = (precursor_id: number, dependent_id: number) => axios.delete(`${API_URL}/dependencies?precursor_id=${precursor_id}&dependent_id=${dependent_id}`);
export const suggestDependencies = (id: number) => axios.post(`${API_URL}/tasks/${id}/suggest-dependencies`);
export const getCriticalPath = () => axios.get<{dependencies: {precursor_id: number, dependent_id: number}[], critical_path: number[]}>(`${API_URL}/critical-path`);
