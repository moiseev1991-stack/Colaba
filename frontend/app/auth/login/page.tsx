'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AlertCircle } from 'lucide-react';
import { apiClient, tokenStorage } from '@/client';
import { Input } from '@/components/ui/input';
import { ButtonV2 } from '@/components/ui/ButtonV2';
import { BrandMark } from '@/components/BrandMark';
import { OAuthButton } from '@/components/OAuthButton';
import { GoogleIcon } from '@/components/OAuthIcons';
import { YandexIcon } from '@/components/OAuthIcons';
import { VKIcon } from '@/components/OAuthIcons';
import { TelegramIcon } from '@/components/OAuthIcons';
import { authErrorMessage } from '@/lib/authErrors';
import { OAUTH_ENABLED } from '@/lib/featureFlags';

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
      window.location.href = next && next.startsWith('/') ? next : '/app/leads';
    } catch (err: unknown) {
      setError(authErrorMessage(err, 'login'));
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
    <div className="min-h-screen flex items-center justify-center px-4 bg-mesh-brand" style={{ backgroundColor: 'hsl(var(--bg))' }}>
      <div className="w-full max-w-[440px]">
        <div
          className="rounded-v2-lg border p-8 shadow-v2"
          style={{ backgroundColor: 'hsl(var(--surface))', borderColor: 'hsl(var(--border))' }}
        >
          <Link href="/" className="mb-8 flex items-center justify-center gap-2" aria-label="SpinLid — на главную">
            <BrandMark
              size={40}
              gradient="linear-gradient(135deg, #10b981 0%, #06b6d4 100%)"
              spiralColor="white"
              glow="var(--shadow-v2-sm)"
            />
            <span
              className="font-display font-semibold tracking-tight text-xl"
              style={{ color: 'hsl(var(--text))' }}
            >
              SpinLid
            </span>
          </Link>
          <h1
            className="text-center font-display font-semibold tracking-tight text-2xl mb-2"
            style={{ color: 'hsl(var(--text))' }}
          >
            Вход в систему
          </h1>
          <p className="mt-2 text-center text-sm" style={{ color: 'hsl(var(--muted))' }}>
            Войдите в кабинет SpinLid
          </p>

          {/* OAuth: скрыт флагом, пока вход через соцсети не починен на бэкенде */}
          {OAUTH_ENABLED && (
            <>
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
                  <span className="px-2" style={{ color: 'hsl(var(--muted))', background: 'hsl(var(--surface))' }}>
                    или через email
                  </span>
                </div>
              </div>
            </>
          )}

          {/* Email/Password Form */}
          <form className={`space-y-4 ${OAUTH_ENABLED ? '' : 'mt-6'}`} onSubmit={handleSubmit}>
            {error && (
              <div
                className="rounded-v2-sm border p-4 flex items-start gap-2"
                style={{
                  background: 'var(--signal-hot-bg)',
                  borderColor: 'rgb(239 68 68 / 0.3)',
                  color: 'var(--signal-hot)',
                }}
                role="alert"
              >
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <p className="text-sm font-medium">{error}</p>
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
              />
            </div>
            <ButtonV2
              type="submit"
              variant="primary"
              size="lg"
              loading={loading}
              className="w-full"
            >
              Войти
            </ButtonV2>
          </form>

          <div className="mt-6 text-center">
            <a
              href="/auth/register"
              className="text-sm font-medium text-brand-600 dark:text-brand-400 hover:underline"
            >
              Нет аккаунта? Зарегистрируйтесь
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
