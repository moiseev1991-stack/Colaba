'use client';

import { Suspense, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSearchParams } from 'next/navigation';
import { apiClient, tokenStorage } from '@/client';

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const getNextPath = (): string => {
    const next = searchParams?.get('next') || '/';
    return next.startsWith('/') ? next : '/';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validation
    if (password.length < 8) {
      setError('Пароль должен содержать минимум 8 символов');
      return;
    }

    if (password !== confirmPassword) {
      setError('Пароли не совпадают');
      return;
    }

    setLoading(true);

    try {
      // Register user
      await apiClient.post('/auth/register', {
        email,
        password,
      });

      // Auto login after registration
      const loginResponse = await apiClient.post('/auth/login', {
        email,
        password,
      });

      const { access_token, refresh_token } = loginResponse.data;
      tokenStorage.setTokens(access_token, refresh_token);

      // Redirect back (if user was bounced by middleware)
      // Use full navigation to ensure Next middleware sees fresh cookies.
      window.location.href = getNextPath();
    } catch (err: any) {
      const msg = err.response?.data?.detail
        || (err.code === 'ERR_NETWORK' ? 'Сервер недоступен. Запустите backend (Docker).' : err.message)
        || 'Ошибка при регистрации. Попробуйте еще раз.';
      setError(Array.isArray(msg) ? msg.join(', ') : String(msg));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900 dark:text-white">
            Регистрация
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600 dark:text-gray-400">
            Или{' '}
            <button
              onClick={() => router.push('/auth/login')}
              className="font-medium text-saas-primary hover:opacity-80"
            >
              войдите в существующий аккаунт
            </button>
          </p>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="rounded-[10px] bg-red-50 dark:bg-red-900/20 p-4">
              <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
            </div>
          )}
          <div className="rounded-[10px] shadow-sm -space-y-px">
            <div>
              <label htmlFor="email" className="sr-only">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="appearance-none relative block w-full h-9 px-3 py-2.5 border border-gray-300 dark:border-gray-700 placeholder-gray-500 dark:placeholder-gray-400 text-gray-900 dark:text-white bg-white dark:bg-gray-800 rounded-t-[10px] focus:outline-none focus:ring-2 focus:ring-saas-primary focus:border-saas-primary focus:ring-offset-1 focus:z-10 sm:text-sm"
                placeholder="Email адрес"
              />
            </div>
            <div>
              <label htmlFor="password" className="sr-only">
                Пароль
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="appearance-none relative block w-full h-9 px-3 py-2.5 border border-gray-300 dark:border-gray-700 placeholder-gray-500 dark:placeholder-gray-400 text-gray-900 dark:text-white bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-saas-primary focus:border-saas-primary focus:ring-offset-1 focus:z-10 sm:text-sm"
                placeholder="Пароль (минимум 8 символов)"
              />
            </div>
            <div>
              <label htmlFor="confirmPassword" className="sr-only">
                Подтвердите пароль
              </label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="appearance-none relative block w-full h-9 px-3 py-2.5 border border-gray-300 dark:border-gray-700 placeholder-gray-500 dark:placeholder-gray-400 text-gray-900 dark:text-white bg-white dark:bg-gray-800 rounded-b-[10px] focus:outline-none focus:ring-2 focus:ring-saas-primary focus:border-saas-primary focus:ring-offset-1 focus:z-10 sm:text-sm"
                placeholder="Подтвердите пароль"
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className="group relative w-full flex justify-center h-9 py-2 px-4 border border-transparent text-sm font-medium rounded-[10px] text-white bg-saas-primary hover:bg-saas-primary-hover focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-saas-primary disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer min-w-[120px]"
            >
              {loading ? 'Регистрация...' : 'Зарегистрироваться'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Загрузка...</div>}>
      <RegisterForm />
    </Suspense>
  );
}
