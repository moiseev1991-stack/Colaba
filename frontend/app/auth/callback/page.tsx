'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';

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
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        <div className="rounded-lg border p-8 shadow-lg bg-white dark:bg-gray-800">
          {status === 'loading' && (
            <div className="text-center py-8">
              <Loader2 className="h-12 w-12 animate-spin mx-auto mb-4 text-blue-500" />
              <h2 className="text-xl font-semibold mb-2">Обработка авторизации...</h2>
              <p className="text-gray-500 dark:text-gray-400">
                Пожалуйста, подождите
              </p>
            </div>
          )}

          {status === 'success' && (
            <div className="text-center py-8">
              <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-500" />
              <h2 className="text-xl font-semibold mb-2 text-green-600 dark:text-green-400">
                Успешно!
              </h2>
              <p className="text-gray-500 dark:text-gray-400 mb-6">{message}</p>
            </div>
          )}

          {status === 'error' && (
            <div className="text-center py-8">
              <XCircle className="h-12 w-12 mx-auto mb-4 text-red-500" />
              <h2 className="text-xl font-semibold mb-2 text-red-600 dark:text-red-400">
                Ошибка
              </h2>
              <p className="text-gray-500 dark:text-gray-400 mb-6">{message}</p>
              <Button
                onClick={() => router.push('/auth/login')}
                className="w-full"
              >
                Вернуться к входу
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function OAuthCallbackPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-blue-500" />
      </div>
    }>
      <CallbackContent />
    </Suspense>
  );
}
