import axios from 'axios';
import { clearToken, readToken } from '../auth/storage';

const baseURL = 'https://puntocafe.pixelia.com.co';

export const api = axios.create({ baseURL });

api.interceptors.request.use((config) => {
  const token = readToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      const url = error.config?.url ?? '';
      // El login fallido tambi�n responde 401; no hay que expulsar de la pantalla.
      if (!url.includes('/auth/login')) {
        clearToken();
        if (window.location.pathname !== '/login') {
          window.location.assign('/login');
        }
      }
    }
    return Promise.reject(error);
  },
);
