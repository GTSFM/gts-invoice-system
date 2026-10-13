import axios, { AxiosError, AxiosRequestConfig, AxiosResponse } from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || '';

const apiClient = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000,
});

// ─── Request Interceptor: attach Bearer token ────────────────────────────────

apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('gts_token');
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ─── Response Interceptor: handle 401 ────────────────────────────────────────

apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('gts_token');
      localStorage.removeItem('gts_user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// ─── Generic typed API methods ────────────────────────────────────────────────

export const api = {
  get: <T = unknown>(url: string, config?: AxiosRequestConfig): Promise<T> =>
    apiClient.get<T>(url, config).then((r: AxiosResponse<T>) => r.data),

  post: <T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> =>
    apiClient.post<T>(url, data, config).then((r: AxiosResponse<T>) => r.data),

  put: <T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> =>
    apiClient.put<T>(url, data, config).then((r: AxiosResponse<T>) => r.data),

  patch: <T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> =>
    apiClient.patch<T>(url, data, config).then((r: AxiosResponse<T>) => r.data),

  delete: <T = unknown>(url: string, config?: AxiosRequestConfig): Promise<T> =>
    apiClient.delete<T>(url, config).then((r: AxiosResponse<T>) => r.data),
};

// ─── File upload helper ───────────────────────────────────────────────────────

export const uploadFile = <T = unknown>(url: string, formData: FormData): Promise<T> => {
  const token = localStorage.getItem('gts_token');
  return apiClient
    .post<T>(url, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    })
    .then((r: AxiosResponse<T>) => r.data);
};

// ─── Download helper ──────────────────────────────────────────────────────────

export const downloadFile = async (url: string, filename: string): Promise<void> => {
  const token = localStorage.getItem('gts_token');
  const response = await apiClient.get(url, {
    responseType: 'blob',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const blob = new Blob([response.data as BlobPart]);
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
};

export default apiClient;
