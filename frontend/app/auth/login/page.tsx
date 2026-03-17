'use client';

import { useState } from 'react';
import { apiClient, tokenStorage } from '@/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { OAuthButton } from '@/components/OAuthButton';
import { GoogleIcon } from '@/components/OAuthIcons';
import { YandexIcon } from '@/components/OAuthIcons';
import { VKIcon } from '@/components/OAuthIcons';
import { TelegramIcon } from '@/components/OAuthIcons';

export default function LoginPage() {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOAuthLoading] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const form = e.currentTarget;
    const formData = new FormData(form);
    const email = String(formData.get('email') ?? '').trim();
    const password = String(formData.get('password') ?? '');

    try {
      await apiClient.post('/auth/login', {
        email,
        password,
      });

      // Tokens are now set as httpOnly cookies by server-side proxy.
      // setTokens() sets the auth_present sentinel cookie so JS can detect auth state.
      tokenStorage.setTokens('', '');
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

  const handleOAuthLogin = (provider: string) => {
    setOAuthLoading(provider);
    // Redirect to backend OAuth endpoint
    window.location.href = `/api/v1/auth/oauth/${provider}`;
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
          <h2 className="text-center text-2xl font-semibold mb-2" style={{ color: 'hsl(var(--text))' }}>
            Вход в систему
          </h2>
          <p className="mt-2 text-center text-sm" style={{ color: 'hsl(var(--muted))' }}>
            Войдите или создайте аккаунт
          </p>

          {/* OAuth Buttons */}
          <div className="mt-6 space-y-3">
            <OAuthButton
              provider="google"
              label="Войти через Google"
              icon={<GoogleIcon />}
              onClick={() => handleOAuthLogin('google')}
              disabled={oauthLoading !== null}
              loading={oauthLoading === 'google'}
            />
            <OAuthButton
              provider="yandex"
              label="Войти через Яндекс"
              icon={<YandexIcon />}
              onClick={() => handleOAuthLogin('yandex')}
              disabled={oauthLoading !== null}
              loading={oauthLoading === 'yandex'}
            />
            <OAuthButton
              provider="vk"
              label="Войти через VK"
              icon={<VKIcon />}
              onClick={() => handleOAuthLogin('vk')}
              disabled={oauthLoading !== null}
              loading={oauthLoading === 'vk'}
            />
            <OAuthButton
              provider="telegram"
              label="Войти через Telegram"
              icon={<TelegramIcon />}
              onClick={() => handleOAuthLogin('telegram')}
              disabled={oauthLoading !== null}
              loading={oauthLoading === 'telegram'}
            />
          </div>

          <div className="relative mt-6 mb-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t" style={{ borderColor: 'hsl(var(--border))' }}></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white dark:bg-gray-800" style={{ color: 'hsl(var(--muted))' }}>
                или через email
              </span>
            </div>
          </div>

          {/* Email/Password Form */}
          <form className="space-y-4" onSubmit={handleSubmit}>
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
            <Button
              type="submit"
              disabled={loading}
              className="ui-btn ui-btn-primary w-full disabled:opacity-70 disabled:cursor-wait"
            >
              {loading ? 'Подключение...' : 'Войти'}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <a
              href="/auth/register"
              className="text-sm font-medium hover:underline"
              style={{ color: 'hsl(var(--primary))' }}
            >
              Нет аккаунта? Зарегистрируйтесь
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
