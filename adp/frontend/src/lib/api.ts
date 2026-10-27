import axios from 'axios';

const api = axios.create({
  baseURL: '/api/v1',
  withCredentials: true,
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401 && !window.location.pathname.startsWith('/login')) {
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default api;

// Auth
export const authApi = {
  login: (data: { username: string; password: string; totp_code?: string }) =>
    api.post('/auth/login', data),
  logout: () => api.post('/auth/logout'),
  me: () => api.get('/auth/me'),
  sessions: () => api.get('/auth/sessions'),
  revokeSession: (id: string) => api.delete(`/auth/sessions/${id}`),
  setupTotp: () => api.post('/auth/totp/setup'),
  verifyTotp: (code: string) => api.post('/auth/totp/verify', { code }),
  removeTotp: () => api.delete('/auth/totp'),
  disableTotp: (password: string) => api.delete('/auth/totp', { data: { password } }),
  changePassword: (currentPassword: string, newPassword: string) =>
    api.post('/auth/change-password', { current_password: currentPassword, new_password: newPassword }),
};

// Servers
export const serversApi = {
  list: () => api.get('/servers'),
  create: (data: Record<string, unknown>) => api.post('/servers', data),
  get: (id: string) => api.get(`/servers/${id}`),
  update: (id: string, data: Record<string, unknown>) => api.patch(`/servers/${id}`, data),
  start: (id: string) => api.post(`/servers/${id}/start`),
  stop: (id: string) => api.post(`/servers/${id}/stop`),
  restart: (id: string) => api.post(`/servers/${id}/restart`),
  status: (id: string) => api.get(`/servers/${id}/status`),
  logs: (id: string, params?: Record<string, unknown>) => api.get(`/servers/${id}/logs`, { params }),
  delete: (id: string, deleteFiles: boolean) =>
    api.delete(`/servers/${id}`, { data: { confirm: 'DELETE', delete_files: deleteFiles } }),
};

// Files
export const filesApi = {
  list: (projectId: string, path = '/') => api.get(`/projects/${projectId}/files`, { params: { path } }),
  read: (projectId: string, path: string) => api.get(`/projects/${projectId}/files/read`, { params: { path } }),
  write: (projectId: string, path: string, content: string) =>
    api.post(`/projects/${projectId}/files/write`, { path, content }),
  upload: (projectId: string, formData: FormData, path: string) =>
    api.post(`/projects/${projectId}/files/upload`, formData, {
      params: { path },
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  download: (projectId: string, path: string) =>
    `/api/v1/projects/${projectId}/files/download?path=${encodeURIComponent(path)}`,
  mkdir: (projectId: string, path: string) => api.post(`/projects/${projectId}/files/mkdir`, { path }),
  rename: (projectId: string, from: string, to: string) =>
    api.post(`/projects/${projectId}/files/rename`, { from, to }),
  delete: (projectId: string, paths: string[]) =>
    api.delete(`/projects/${projectId}/files`, { data: { paths } }),
  extract: (projectId: string, data: Record<string, unknown>) =>
    api.post(`/projects/${projectId}/files/extract`, data),
  zip: (projectId: string, data: Record<string, unknown>) =>
    api.post(`/projects/${projectId}/files/zip`, data),
};

// Databases
export const dbApi = {
  list: () => api.get('/databases'),
  create: (data: Record<string, unknown>) => api.post('/databases', data),
  get: (id: string) => api.get(`/databases/${id}`),
  delete: (id: string) => api.delete(`/databases/${id}`, { data: { confirm: 'DELETE' } }),
  resetPassword: (id: string) => api.post(`/databases/${id}/reset-password`),
};

// Users
export const usersApi = {
  list: () => api.get('/users'),
  create: (data: Record<string, unknown>) => api.post('/users', data),
  get: (id: string) => api.get(`/users/${id}`),
  update: (id: string, data: Record<string, unknown>) => api.patch(`/users/${id}`, data),
  resetPassword: (id: string, newPassword: string) =>
    api.post(`/users/${id}/reset-password`, { new_password: newPassword }),
  delete: (id: string) => api.delete(`/users/${id}`, { data: { confirm: 'DELETE' } }),
};

// Monitoring
export const monitoringApi = {
  current: () => api.get('/monitoring/current'),
  history: (from: string, to: string) => api.get('/monitoring/history', { params: { from, to } }),
};

// API Tokens
export const tokenApi = {
  list: () => api.get('/tokens'),
  create: (data: Record<string, unknown>) => api.post('/tokens', data),
  revoke: (id: string) => api.delete(`/tokens/${id}`),
};

// Audit
export const auditApi = {
  list: (params?: Record<string, unknown>) => api.get('/audit', { params }),
};
