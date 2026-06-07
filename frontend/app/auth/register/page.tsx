'use client';

import { Suspense, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { AlertCircle } from 'lucide-react';
import { apiClient, tokenStorage } from '@/client';
import { ButtonV2 } from '@/components/ui/ButtonV2';

// §4.11 ТЗ редизайна 2026-06-03 (Phase C batch 3): экран регистрации на v2.
// Первое впечатление — h2 в display-шрифте, gradient-акцент, чистые токены.

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const getNextPath = (): string => {
    const next = searchParams?.get('next') || '/';
    return next.startsWith('/') ? next : '/';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Пароль должен содержать минимум 8 символов');
      return;
    }

    if (password !== confirmPassword) {
      setError('Пароли не совпадают');
      return;
    }

    if (!consent) {
      setError(
        'Для регистрации необходимо принять Пользовательское соглашение и согласиться на обработку персональных данных'
      );
      return;
    }

    setLoading(true);

    try {
      await apiClient.post('/auth/register', { email, password });
      await apiClient.post('/auth/login', { email, password });
      tokenStorage.setTokens('', '');
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

  const inputCls =
    'block w-full h-10 px-3 py-2 text-sm rounded-v2-sm border focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 focus:z-10 transition-colors';
  const inputStyle = {
    background: 'hsl(var(--surface))',
    borderColor: 'hsl(var(--border))',
    color: 'hsl(var(--text))',
  } as const;

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 bg-mesh-brand"
      style={{ background: 'hsl(var(--bg))' }}
    >
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2
            className="mt-6 text-center font-display font-semibold tracking-tight"
            style={{ fontSize: 'clamp(1.75rem, 4vw, 2.25rem)', color: 'hsl(var(--text))' }}
          >
            Регистрация в <span className="text-gradient-brand">SpinLid</span>
          </h2>
          <p className="mt-2 text-center text-sm" style={{ color: 'hsl(var(--muted))' }}>
            Или{' '}
            <button
              onClick={() => router.push('/auth/login')}
              className="font-medium text-brand-600 dark:text-brand-400 hover:underline"
            >
              войдите в существующий аккаунт
            </button>
          </p>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div
              className="rounded-v2-sm border p-4 flex items-start gap-2 text-sm"
              style={{
                background: 'var(--signal-hot-bg)',
                borderColor: 'rgb(239 68 68 / 0.3)',
                color: 'var(--signal-hot)',
              }}
            >
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <p>{error}</p>
            </div>
          )}
          <div className="space-y-3">
            <div>
              <label htmlFor="email" className="sr-only">Email</label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputCls}
                style={inputStyle}
                placeholder="Email адрес"
              />
            </div>
            <div>
              <label htmlFor="password" className="sr-only">Пароль</label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputCls}
                style={inputStyle}
                placeholder="Пароль (минимум 8 символов)"
              />
            </div>
            <div>
              <label htmlFor="confirmPassword" className="sr-only">Подтвердите пароль</label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={inputCls}
                style={inputStyle}
                placeholder="Подтвердите пароль"
              />
            </div>
          </div>

          <label
            className="flex items-start gap-3 text-xs"
            style={{ color: 'hsl(var(--muted))' }}
          >
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border focus:ring-2 focus:ring-brand-500"
              style={{ borderColor: 'hsl(var(--border))' }}
              required
            />
            <span>
              Создавая аккаунт, я принимаю{' '}
              <Link
                href="/terms"
                target="_blank"
                className="text-brand-600 dark:text-brand-400 hover:underline"
              >
                Пользовательское соглашение
              </Link>{' '}
              и даю{' '}
              <Link
                href="/consent"
                target="_blank"
                className="text-brand-600 dark:text-brand-400 hover:underline"
              >
                согласие на обработку персональных данных
              </Link>{' '}
              в соответствии с{' '}
              <Link
                href="/policy"
                target="_blank"
                className="text-brand-600 dark:text-brand-400 hover:underline"
              >
                Политикой конфиденциальности
              </Link>
              .
            </span>
          </label>

          <ButtonV2
            type="submit"
            variant="primary"
            size="lg"
            loading={loading}
            disabled={!consent}
            className="w-full"
          >
            Зарегистрироваться
          </ButtonV2>
        </form>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense
      fallback={
        <div
          className="min-h-screen flex items-center justify-center"
          style={{ color: 'hsl(var(--muted))' }}
        >
          Загрузка...
        </div>
      }
    >
      <RegisterForm />
    </Suspense>
  );
}
