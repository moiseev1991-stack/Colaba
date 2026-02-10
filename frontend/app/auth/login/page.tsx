'use client';

import { useState } from 'react';
import { apiClient, tokenStorage } from '@/client';
import { Input } from '@/components/ui/input';

export default function LoginPage() {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const form = e.currentTarget;
    const formData = new FormData(form);
    const email = String(formData.get('email') ?? '').trim();
    const password = String(formData.get('password') ?? '');

    try {
      const response = await apiClient.post('/auth/login', {
        email,
        password,
      });

      const { access_token, refresh_token } = response.data;
      tokenStorage.setTokens(access_token, refresh_token);
      const next = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('next') : null;
      window.location.href = next && next.startsWith('/') ? next : '/app';
    } catch (err: any) {
      let msg = 'Ошибка при входе. Проверьте email и пароль.';
      if (err.code === 'ERR_NETWORK' || err.message?.includes('Network Error')) {
        msg = 'Сервер недоступен. Запустите backend: docker compose up -d';
      } else if (err.response?.data?.detail) {
        const d = err.response.data.detail;
        msg = Array.isArray(d) ? d.join(', ') : String(d);
      } else if (err.response?.status === 500) {
        msg = 'Ошибка сервера. Проверьте, что backend запущен (docker compose up -d).';
      } else if (err.message) {
        msg = err.message;
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: 'hsl(var(--bg))' }}>
      <div className="w-full max-w-[440px]">
        <div className="rounded-[8px] border p-8 shadow-lg" style={{ backgroundColor: 'hsl(var(--surface))', borderColor: 'hsl(var(--border))' }}>
          <div className="mb-8 flex items-center justify-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-[6px] bg-saas-primary-weak" aria-hidden>
              <span className="text-saas-primary font-bold text-lg">S</span>
            </div>
            <span className="text-xl font-semibold" style={{ color: 'hsl(var(--text))' }}>SpinLid</span>
          </div>
          <h2 className="text-center text-2xl font-semibold" style={{ color: 'hsl(var(--text))' }}>
            Вход в систему
          </h2>
          <p className="mt-2 text-center text-sm" style={{ color: 'hsl(var(--muted))' }}>
            Регистрация — скоро
          </p>
          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            {error && (
              <div className="rounded-[6px] border-2 border-red-500 bg-red-50 p-4 dark:border-red-400 dark:bg-red-950/50" role="alert">
                <p className="text-sm font-medium text-red-700 dark:text-red-300">{error}</p>
              </div>
            )}
            <div>
              <label htmlFor="email" className="sr-only">Email</label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                placeholder="Email адрес"
                className="rounded-b-none border-b-0"
              />
            </div>
            <div>
              <label htmlFor="password" className="sr-only">Пароль</label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                placeholder="Пароль"
                className="rounded-t-none"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="ui-btn ui-btn-primary w-full disabled:opacity-70 disabled:cursor-wait"
            >
              {loading ? 'Подключение...' : 'Войти'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
