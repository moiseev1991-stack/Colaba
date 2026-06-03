'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';
import { ButtonV2 } from '@/components/ui/ButtonV2';
import { CardV2 } from '@/components/ui/CardV2';

// §4.18 ТЗ редизайна 2026-06-03 (Phase C batch 7): OAuth callback на v2.

function CallbackContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const processCallback = async () => {
      const code = searchParams.get('code');
      const provider = searchParams.get('provider');
      const state = searchParams.get('state');

      const error = searchParams.get('error');
      const errorDescription = searchParams.get('error_description');

      if (error) {
        setStatus('error');
        setMessage(errorDescription || 'Ошибка авторизации');
        return;
      }

      if (!code || !provider) {
        setStatus('error');
        setMessage('Отсутствуют необходимые параметры');
        return;
      }

      try {
        const response = await fetch(`/api/v1/auth/oauth/${provider}/callback?code=${code}&state=${state}`, {
          method: 'GET',
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.detail || 'Ошибка авторизации');
        }

        setStatus('success');
        setMessage('Успешная авторизация! Перенаправление...');

        setTimeout(() => {
          const next = searchParams.get('next');
          router.push(next || '/app');
        }, 2000);

      } catch (err: any) {
        setStatus('error');
        setMessage(err.message || 'Произошла ошибка при авторизации');
      }
    };

    processCallback();
  }, [searchParams, router]);

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-mesh-brand">
      <div className="max-w-md w-full">
        <CardV2 className="p-8">
          {status === 'loading' && (
            <div className="text-center py-8">
              <Loader2
                className="h-12 w-12 animate-spin mx-auto mb-4 text-brand-600 dark:text-brand-400"
              />
              <h2
                className="font-display font-semibold tracking-tight text-xl mb-2"
                style={{ color: 'hsl(var(--text))' }}
              >
                Обработка авторизации...
              </h2>
              <p style={{ color: 'hsl(var(--muted))' }}>
                Пожалуйста, подождите
              </p>
            </div>
          )}

          {status === 'success' && (
            <div className="text-center py-8">
              <CheckCircle
                className="h-12 w-12 mx-auto mb-4"
                style={{ color: 'var(--signal-good)' }}
              />
              <h2
                className="font-display font-semibold tracking-tight text-xl mb-2"
                style={{ color: 'var(--signal-good)' }}
              >
                Успешно!
              </h2>
              <p style={{ color: 'hsl(var(--muted))' }}>{message}</p>
            </div>
          )}

          {status === 'error' && (
            <div className="text-center py-8">
              <XCircle
                className="h-12 w-12 mx-auto mb-4"
                style={{ color: 'var(--signal-hot)' }}
              />
              <h2
                className="font-display font-semibold tracking-tight text-xl mb-2"
                style={{ color: 'var(--signal-hot)' }}
              >
                Ошибка
              </h2>
              <p className="mb-6" style={{ color: 'hsl(var(--muted))' }}>{message}</p>
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
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-brand-600 dark:text-brand-400" />
      </div>
    }>
      <CallbackContent />
    </Suspense>
  );
}
