import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000/api';

// Create axios instance
const api = axios.create({
  baseURL: API_BASE_URL,
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Auth services
export const authService = {
  login: async (credentials) => {
    const response = await api.post('/auth/login', credentials);
    return response.data;
  },

  signup: async (data) => {
    const response = await api.post('/auth/signup', data);
    return response.data;
  },

  getProfile: async () => {
    const response = await api.get('/auth/profile');
    return response.data;
  },

  refreshToken: async () => {
    const response = await api.post('/auth/refresh');
    return response.data;
  }
};

// Expense services
export const expenseService = {
  getExpenses: async (params = {}) => {
    const response = await api.get('/expenses', { params });
    return response.data;
  },

  getExpense: async (id) => {
    const response = await api.get(`/expenses/${id}`);
    return response.data;
  },

  createExpense: async (data) => {
    const response = await api.post('/expenses', data);
    return response.data;
  },

  updateExpense: async (id, data) => {
    const response = await api.put(`/expenses/${id}`, data);
    return response.data;
  },

  deleteExpense: async (id) => {
    const response = await api.delete(`/expenses/${id}`);
    return response.data;
  },

  getCategories: async () => {
    const response = await api.get('/expenses/categories/list');
    return response.data;
  },

  processOCR: async (file) => {
    const formData = new FormData();
    formData.append('receipt', file);
    
    const response = await api.post('/expenses/ocr/process', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    return response.data;
  }
};

// Approval services
export const approvalService = {
  getPendingApprovals: async (params = {}) => {
    const response = await api.get('/approvals/pending', { params });
    return response.data;
  },

  processApproval: async (expenseId, data) => {
    const response = await api.post(`/approvals/${expenseId}/process`, data);
    return response.data;
  },

  getApprovalHistory: async (expenseId) => {
    const response = await api.get(`/approvals/${expenseId}/history`);
    return response.data;
  },

  overrideApproval: async (expenseId, data) => {
    const response = await api.post(`/approvals/${expenseId}/override`, data);
    return response.data;
  },

  getApprovalRules: async () => {
    const response = await api.get('/approvals/rules');
    return response.data;
  },

  createApprovalRule: async (data) => {
    const response = await api.post('/approvals/rules', data);
    return response.data;
  },

  updateApprovalRule: async (id, data) => {
    const response = await api.put(`/approvals/rules/${id}`, data);
    return response.data;
  },

  deleteApprovalRule: async (id) => {
    const response = await api.delete(`/approvals/rules/${id}`);
    return response.data;
  }
};

// User services
export const userService = {
  getUsers: async (params = {}) => {
    const response = await api.get('/users', { params });
    return response.data;
  },

  getUser: async (id) => {
    const response = await api.get(`/users/${id}`);
    return response.data;
  },

  createUser: async (data) => {
    const response = await api.post('/users', data);
    return response.data;
  },

  updateUser: async (id, data) => {
    const response = await api.put(`/users/${id}`, data);
    return response.data;
  },

  deleteUser: async (id) => {
    const response = await api.delete(`/users/${id}`);
    return response.data;
  },

  getManagers: async () => {
    const response = await api.get('/users/managers/list');
    return response.data;
  },

  getTeamMembers: async () => {
    const response = await api.get('/users/team/members');
    return response.data;
  },

  changePassword: async (data) => {
    const response = await api.post('/users/change-password', data);
    return response.data;
  }
};

// Company services
export const companyService = {
  getProfile: async () => {
    const response = await api.get('/companies/profile');
    return response.data;
  },

  updateProfile: async (data) => {
    const response = await api.put('/companies/profile', data);
    return response.data;
  },

  getCurrencies: async () => {
    const response = await api.get('/companies/currencies');
    return response.data;
  },

  getCategories: async () => {
    const response = await api.get('/companies/categories');
    return response.data;
  },

  createCategory: async (data) => {
    const response = await api.post('/companies/categories', data);
    return response.data;
  },

  updateCategory: async (id, data) => {
    const response = await api.put(`/companies/categories/${id}`, data);
    return response.data;
  },

  deleteCategory: async (id) => {
    const response = await api.delete(`/companies/categories/${id}`);
    return response.data;
  },

  getAnalytics: async (params = {}) => {
    const response = await api.get('/companies/analytics', { params });
    return response.data;
  },

  exportExpenses: async (params = {}) => {
    const response = await api.get('/companies/export/expenses', { 
      params,
      responseType: 'blob'
    });
    return response.data;
  }
};

export default api;