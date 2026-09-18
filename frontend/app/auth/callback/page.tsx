'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';
import { ButtonV2 } from '@/components/ui/ButtonV2';
import { CardV2 } from '@/components/ui/CardV2';
import { tokenStorage } from '@/client';

/**
 * OAuth callback (переработка 18.09): провайдер возвращает
 * ?code&state&device_id. Обмениваем код на нашем бэкенде — прокси сам
 * кладёт access/refresh в httpOnly-куки (AUTH_TOKEN_PATHS включает
 * auth/oauth). Нам остаётся поставить sentinel и уйти в кабинет.
 */

function CallbackContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const processCallback = async () => {
      const code = searchParams.get('code');
      // Провайдеры (Яндекс, VK ID) возвращают только code+state и не умеют
      // дописывать provider в redirect_uri — берём его из sessionStorage,
      // куда login положил перед уходом к провайдеру.
      let storedProvider: string | null = null;
      try {
        storedProvider = sessionStorage.getItem('oauth_provider');
      } catch {
        storedProvider = null;
      }
      const provider = searchParams.get('provider') || storedProvider || '';
      const state = searchParams.get('state');
      const deviceId = searchParams.get('device_id');

      const error = searchParams.get('error');
      const errorDescription = searchParams.get('error_description');

      if (error) {
        setStatus('error');
        setMessage(errorDescription || 'Провайдер отклонил авторизацию');
        return;
      }

      if (!code || !provider) {
        setStatus('error');
        setMessage('Отсутствуют необходимые параметры');
        return;
      }

      try {
        sessionStorage.removeItem('oauth_provider');
      } catch {
        // noop
      }

      try {
        const params = new URLSearchParams({ code, state: state ?? '' });
        if (deviceId) params.set('device_id', deviceId);
        const response = await fetch(`/api/v1/auth/oauth/${provider}/callback?${params}`, {
          method: 'GET',
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.detail || 'Ошибка авторизации');
        }

        // Куки уже стоят (прокси); sentinel для middleware.
        tokenStorage.setTokens('', '');
        setStatus('success');
        setMessage('Успешная авторизация! Перенаправление...');

        setTimeout(() => {
          const next = searchParams.get('next');
          window.location.href = next && next.startsWith('/') ? next : '/app';
        }, 900);
      } catch (err: unknown) {
        setStatus('error');
        setMessage((err as Error)?.message || 'Произошла ошибка при авторизации');
      }
    };

    void processCallback();
  }, [searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-ui-bg">
      <div className="max-w-md w-full">
        <CardV2 className="p-8">
          {status === 'loading' && (
            <div className="text-center py-8">
              <Loader2 className="h-12 w-12 animate-spin mx-auto mb-4 text-ui-accent" aria-hidden />
              <h2 className="font-display font-semibold tracking-tight text-xl mb-2 text-ui-text">
                Обработка авторизации...
              </h2>
              <p className="text-sm text-ui-text-muted">Пожалуйста, подождите</p>
            </div>
          )}

          {status === 'success' && (
            <div className="text-center py-8">
              <CheckCircle className="h-12 w-12 mx-auto mb-4 text-ui-success" aria-hidden />
              <h2 className="font-display font-semibold tracking-tight text-xl mb-2 text-ui-success">
                Успешно!
              </h2>
              <p className="text-sm text-ui-text-muted">{message}</p>
            </div>
          )}

          {status === 'error' && (
            <div className="text-center py-8">
              <XCircle className="h-12 w-12 mx-auto mb-4 text-ui-danger" aria-hidden />
              <h2 className="font-display font-semibold tracking-tight text-xl mb-2 text-ui-danger">
                Ошибка
              </h2>
              <p className="mb-6 text-sm text-ui-text-muted">{message}</p>
              <ButtonV2
                variant="primary"
                size="md"
                onClick={() => router.push('/auth/login')}
                className="w-full"
              >
                Вернуться к входу
              </ButtonV2>
            </div>
          )}
        </CardV2>
      </div>
    </div>
  );
}

export default function OAuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="h-12 w-12 animate-spin text-ui-accent" aria-hidden />
        </div>
      }
    >
      <CallbackContent />
    </Suspense>
  );
}
