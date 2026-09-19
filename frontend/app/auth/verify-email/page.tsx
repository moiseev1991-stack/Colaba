'use client';

/** Подтверждение email по токену из письма (?token=). */

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { CheckCircle, XCircle } from 'lucide-react';
import { apiClient } from '@/client';
import { CardV2 } from '@/components/ui/CardV2';
import { Loader2 } from 'lucide-react';

function VerifyInner() {
  const sp = useSearchParams();
  const token = sp.get('token') || '';
  const [state, setState] = useState<'loading' | 'ok' | 'fail'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) {
      setState('fail');
      setMessage('Ссылка неполная');
      return;
    }
    apiClient
      .post('/auth/verify-email/confirm', { token })
      .then(() => setState('ok'))
      .catch((e: unknown) => {
        const d = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
        setState('fail');
        setMessage(typeof d === 'string' ? d : 'Ссылка недействительна или истекла');
      });
  }, [token]);

  return (
    <div className="flex min-h-screen items-center justify-center px-4 bg-ui-bg">
      <CardV2 className="w-full max-w-md p-8 text-center">
        {state === 'loading' && (
          <Loader2 className="mx-auto h-10 w-10 animate-spin text-ui-accent" aria-hidden />
        )}
        {state === 'ok' && (
          <>
            <CheckCircle className="mx-auto mb-3 h-10 w-10 text-ui-success" aria-hidden />
            <p className="text-sm text-ui-text">Email подтверждён — теперь войдите в аккаунт.</p>
            <a
              href="/auth/login"
              className="mt-4 inline-block text-sm font-semibold text-ui-accent hover:underline"
            >
              Перейти ко входу →
            </a>
          </>
        )}
        {state === 'fail' && (
          <>
            <XCircle className="mx-auto mb-3 h-10 w-10 text-ui-danger" aria-hidden />
            <p className="text-sm text-ui-text-muted">{message}</p>
          </>
        )}
      </CardV2>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyInner />
    </Suspense>
  );
}
