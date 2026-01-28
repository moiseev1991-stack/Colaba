/**
 * API client для взаимодействия с backend API.
 * 
 * Использует axios для HTTP запросов с автоматической обработкой ошибок и токенов.
 */

import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

// Create axios instance
export const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000, // 30 seconds
});

// Token management utilities
const TOKEN_KEY = 'access_token';
const REFRESH_TOKEN_KEY = 'refresh_token';

function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const cookies = document.cookie ? document.cookie.split('; ') : [];
  for (const part of cookies) {
    const eqIdx = part.indexOf('=');
    const key = eqIdx >= 0 ? part.slice(0, eqIdx) : part;
    if (key === name) {
      const raw = eqIdx >= 0 ? part.slice(eqIdx + 1) : '';
      try {
        return decodeURIComponent(raw);
      } catch {
        return raw;
      }
    }
  }
  return null;
}

function setCookie(name: string, value: string, days: number): void {
  if (typeof document === 'undefined') return;
  const maxAge = Math.max(0, Math.floor(days * 24 * 60 * 60));
  const secure = typeof window !== 'undefined' && window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}`;
}

function deleteCookie(name: string): void {
  if (typeof document === 'undefined') return;
  const secure = typeof window !== 'undefined' && window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
}

export const tokenStorage = {
  getAccessToken: (): string | null => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(TOKEN_KEY) || getCookie(TOKEN_KEY);
  },
  getRefreshToken: (): string | null => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(REFRESH_TOKEN_KEY) || getCookie(REFRESH_TOKEN_KEY);
  },
  setTokens: (accessToken: string, refreshToken: string): void => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(TOKEN_KEY, accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
    // Mirror to cookies so Next.js middleware can protect routes.
    // Note: This is MVP-level (not httpOnly). If needed, we can move this to a Next route handler later.
    setCookie(TOKEN_KEY, accessToken, 30);
    setCookie(REFRESH_TOKEN_KEY, refreshToken, 30);
  },
  clearTokens: (): void => {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    deleteCookie(TOKEN_KEY);
    deleteCookie(REFRESH_TOKEN_KEY);
  },
};

// Request interceptor: Add auth token
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = tokenStorage.getAccessToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error: AxiosError) => {
    return Promise.reject(error);
  }
);

// Response interceptor: Handle errors
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    // Handle 401 Unauthorized (token expired)
    if (error.response?.status === 401) {
      const refreshToken = tokenStorage.getRefreshToken();
      if (refreshToken) {
        try {
          // Try to refresh token
          const response = await axios.post(
            `${API_BASE_URL}/auth/refresh`,
            { refresh_token: refreshToken }
          );
          const { access_token, refresh_token } = response.data;
          tokenStorage.setTokens(access_token, refresh_token);
          
          // Retry original request with new token
          if (error.config) {
            error.config.headers.Authorization = `Bearer ${access_token}`;
            return apiClient.request(error.config);
          }
        } catch (refreshError) {
          // Refresh failed, clear tokens and redirect to login
          tokenStorage.clearTokens();
          if (typeof window !== 'undefined') {
            window.location.href = '/auth/login';
          }
        }
      } else {
        // No refresh token, redirect to login
        tokenStorage.clearTokens();
        if (typeof window !== 'undefined') {
          window.location.href = '/auth/login';
        }
      }
    }
    
    // Handle other errors
    return Promise.reject(error);
  }
);
