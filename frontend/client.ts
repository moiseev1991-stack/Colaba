/**
 * API client для взаимодействия с backend API через Next.js proxy.
 *
 * Токены хранятся в httpOnly cookies — JavaScript не имеет к ним доступа.
 * Authorization header добавляется серверным прокси (route.ts) автоматически.
 */

import axios, { AxiosInstance, AxiosError } from 'axios';

// Always use same-origin proxy path.
const API_BASE_URL = '/api/v1';

export const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
});

// ---------------------------------------------------------------------------
// tokenStorage: backward-compat shim.
// Tokens are now stored as httpOnly cookies (set by the server-side proxy).
// JS cannot read them — that's intentional. getAccessToken() returns null.
// Code that checks `!!tokenStorage.getAccessToken()` should migrate to
// checking `document.cookie` for the non-sensitive `auth_present` cookie,
// but for now those checks rely on the presence of any access_token cookie.
// ---------------------------------------------------------------------------
export const tokenStorage = {
  getAccessToken: (): string | null => {
    if (typeof document === 'undefined') return null;
    // httpOnly cookies are invisible to JS — return sentinel based on auth_present
    const cookies = document.cookie.split('; ');
    const sentinel = cookies.find(c => c.startsWith('auth_present='));
    return sentinel ? '1' : null;
  },
  getRefreshToken: (): string | null => null,
  setTokens: (_accessToken: string, _refreshToken: string): void => {
    // Tokens are now set via server-side proxy (httpOnly cookies).
    // Set a non-sensitive sentinel cookie so JS can detect auth state.
    if (typeof document !== 'undefined') {
      const secure = window.location.protocol === 'https:' ? '; Secure' : '';
      document.cookie = `auth_present=1; Path=/; SameSite=Lax; Max-Age=${30 * 24 * 3600}${secure}`;
    }
  },
  /** Clears client-side sentinel. Returns a promise that resolves once the server
   *  has cleared the httpOnly cookies — callers MUST await before redirecting. */
  clearTokens: async (): Promise<void> => {
    if (typeof document === 'undefined') return;
    document.cookie = 'auth_present=; Path=/; SameSite=Lax; Max-Age=0';
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Ignore network errors — the redirect will clear the session anyway
    }
  },
};

// Guard against multiple simultaneous logout redirects
let isRedirectingToLogin = false;

async function logoutAndRedirect(): Promise<void> {
  if (isRedirectingToLogin) return;
  isRedirectingToLogin = true;
  // MUST await so httpOnly cookies are cleared before the browser navigates
  await tokenStorage.clearTokens();
  window.location.href = '/auth/login';
}

// Response interceptor: handle 401 (session expired)
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    if (error.response?.status === 401) {
      const requestUrl = error.config?.url ?? '';

      // Skip redirect for auth endpoints — let the caller handle the error.
      if (requestUrl.includes('/auth/')) {
        return Promise.reject(error);
      }

      // Try to refresh via server-side proxy (reads httpOnly refresh_token cookie).
      try {
        await axios.post(`${API_BASE_URL}/auth/refresh`, {});
        // Retry original request — proxy will inject the new access_token.
        if (error.config) {
          return apiClient.request(error.config);
        }
      } catch {
        // Refresh failed — session is truly expired; clear cookies and redirect.
        if (typeof window !== 'undefined') {
          await logoutAndRedirect();
        }
      }
    }

    return Promise.reject(error);
  },
);
