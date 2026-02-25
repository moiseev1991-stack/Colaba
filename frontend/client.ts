/**
 * API client для взаимодействия с backend API.
 * 
 * Использует axios для HTTP запросов с автоматической обработкой ошибок и токенов.
 */

import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';

// Default to same-origin to work behind reverse proxies and avoid browser loopback/CORS blocks.
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '/api/v1';

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

// #region agent log
fetch('http://127.0.0.1:7244/ingest/0399435a-c7fd-43d9-8a3b-05cfb4c1e391',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'client.ts:init',message:'apiClient initialized',data:{API_BASE_URL,NEXT_PUBLIC_API_URL_ENV:process.env.NEXT_PUBLIC_API_URL},timestamp:Date.now(),hypothesisId:'H-B'})}).catch(()=>{});
// #endregion

// Request interceptor: Add auth token
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/0399435a-c7fd-43d9-8a3b-05cfb4c1e391',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'client.ts:request',message:'outgoing request',data:{baseURL:config.baseURL,url:config.url,method:config.method,fullUrl:`${config.baseURL||''}${config.url||''}`},timestamp:Date.now(),hypothesisId:'H-B,H-D'})}).catch(()=>{});
    // #endregion
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

// Response interceptor: Handle errors + dev logging
apiClient.interceptors.response.use(
  (response) => {
    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/0399435a-c7fd-43d9-8a3b-05cfb4c1e391',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'client.ts:response-ok',message:'response ok',data:{status:response.status,url:response.config?.url,upstream:response.headers?.['x-debug-upstream']},timestamp:Date.now(),hypothesisId:'H-A,H-C'})}).catch(()=>{});
    // #endregion
    return response;
  },
  async (error: AxiosError) => {
    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/0399435a-c7fd-43d9-8a3b-05cfb4c1e391',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'client.ts:response-error',message:'response error',data:{code:error.code,message:error.message,status:error.response?.status,url:error.config?.url,baseURL:error.config?.baseURL,upstream:error.response?.headers?.['x-debug-upstream'],responseData:error.response?.data},timestamp:Date.now(),hypothesisId:'H-A,H-B,H-C,H-D'})}).catch(()=>{});
    // #endregion
    if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
      const msg = `${error.response?.status} ${error.config?.url} ${JSON.stringify(error.response?.data ?? error.message)}`;
      console.error('[API]', msg);
      window.dispatchEvent(new CustomEvent('api-error', { detail: { message: msg } }));
    }
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
