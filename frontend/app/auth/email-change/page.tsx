'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { CheckCircle, Loader2, XCircle } from 'lucide-react';

import { CardV2 } from '@/components/ui/CardV2';
import { apiClient } from '@/client';

function EmailChangeContent() {
  const searchParams = useSearchParams();
  const [state, setState] = useState<'loading' | 'ok' | 'fail'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const payload = searchParams.get('payload');
    if (!payload) {
      setState('fail');
      setMessage('Ссылка неполная');
      return;
    }
    apiClient
      .post('/auth/email/change-confirm', { payload })
      .then((res) => {
        setState('ok');
        setMessage(res.data?.message ?? 'Email обновлён');
      })
      .catch((err) => {
        setState('fail');
        setMessage(err.response?.data?.detail || 'Не удалось подтвердить смену email');
      });
  }, [searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-ui-bg">
      <div className="max-w-md w-full">
        <CardV2 className="p-8 text-center">
          {state === 'loading' && (
            <Loader2 className="mx-auto h-10 w-10 animate-spin text-ui-accent" aria-hidden />
          )}
          {state === 'ok' && (
            <>
              <CheckCircle className="mx-auto mb-3 h-10 w-10 text-ui-success" aria-hidden />
              <p className="text-sm text-ui-text">{message}</p>
              <a
                href="/auth/login"
                className="mt-4 inline-block text-sm font-semibold text-ui-accent hover:underline"
              >
                Войти с новым email →
              </a>
            </>
          )}
          {state === 'fail' && (
            <>
              <XCircle className="mx-auto mb-3 h-10 w-10 text-ui-danger" aria-hidden />
              <p className="text-sm text-ui-text-muted">{message}</p>
              <a
                href="/app/settings/profile"
                className="mt-4 inline-block text-sm font-semibold text-ui-accent hover:underline"
              >
                К настройкам аккаунта →
              </a>
            </>
          )}
        </CardV2>
      </div>
    </div>
  );
}

export default function EmailChangePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-ui-bg">
          <Loader2 className="h-10 w-10 animate-spin text-ui-accent" aria-hidden />
        </div>
      }
    >
      <EmailChangeContent />
    </Suspense>
  );
}
