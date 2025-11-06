import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001/api';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add token to requests if available
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('adminToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

export const authAPI = {
  login: (username, password) => 
    api.post('/auth/login', { username, password }),
  verify: () => 
    api.get('/auth/verify'),
};

export const chatAPI = {
  getSessions: () => 
    api.get('/chat/sessions'),
  getActiveSessions: () =>
    api.get('/chat/sessions/active'),
  getPastSessions: () =>
    api.get('/chat/sessions/past'),
  getSessionMessages: (sessionId) => 
    api.get(`/chat/sessions/${sessionId}/messages`),
  getSession: (sessionId) => 
    api.get(`/chat/sessions/${sessionId}`),
  toggleAi: (sessionId, enabled) =>
    api.patch(`/chat/sessions/${sessionId}/ai`, { enabled }),
  upload: (file) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/chat/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
  }
};

// Public (no auth) endpoints for customer widget
export const publicChatAPI = {
  getSessionMessages: (sessionId) =>
    api.get(`/chat/sessions/${sessionId}/messages`),
};

export default api;

