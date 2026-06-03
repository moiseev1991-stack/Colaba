'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { CheckCircle, Loader2, XCircle } from 'lucide-react';
import Link from 'next/link';
import { apiClient } from '@/client';
import { ButtonV2 } from '@/components/ui/ButtonV2';

function SuccessContent() {
  const params = useSearchParams();
  const paymentId = params?.get('payment_id') ?? null;
  const [status, setStatus] = useState<'loading' | 'paid' | 'pending' | 'failed'>('loading');

  useEffect(() => {
    if (!paymentId) { setStatus('pending'); return; }
    apiClient.get<{ paid: boolean; status: string }>(`/payments/${paymentId}/status`)
      .then(r => {
        if (r.data.paid) setStatus('paid');
        else if (r.data.status === 'canceled') setStatus('failed');
        else setStatus('pending');
      })
      .catch(() => setStatus('pending'));
  }, [paymentId]);

  const h1Cls = 'font-display font-semibold tracking-tight text-2xl mb-2';
  const pCls = 'mb-6';

  return (
    <div className="max-w-[440px] mx-auto px-4 py-16 text-center">
      {status === 'loading' && (
        <Loader2
          className="h-12 w-12 animate-spin mx-auto mb-4"
          style={{ color: 'hsl(var(--muted))' }}
        />
      )}
      {status === 'paid' && (
        <>
          <CheckCircle
            className="h-14 w-14 mx-auto mb-4"
            style={{ color: 'var(--signal-good)' }}
          />
          <h1 className={h1Cls} style={{ color: 'hsl(var(--text))' }}>Оплата прошла успешно!</h1>
          <p className={pCls} style={{ color: 'hsl(var(--muted))' }}>Подписка активирована. Добро пожаловать!</p>
          <Link href="/app" className="contents">
            <ButtonV2 variant="primary" size="md">Перейти в панель</ButtonV2>
          </Link>
        </>
      )}
      {status === 'pending' && (
        <>
          <Loader2
            className="h-12 w-12 animate-spin mx-auto mb-4"
            style={{ color: 'var(--signal-warm)' }}
          />
          <h1 className={h1Cls} style={{ color: 'hsl(var(--text))' }}>Обработка платежа…</h1>
          <p className={pCls} style={{ color: 'hsl(var(--muted))' }}>Платёж в обработке. Страница обновится автоматически.</p>
          <Link
            href="/app"
            className="text-sm text-brand-600 dark:text-brand-400 hover:underline"
          >
            Вернуться в панель
          </Link>
        </>
      )}
      {status === 'failed' && (
        <>
          <XCircle
            className="h-12 w-12 mx-auto mb-4"
            style={{ color: 'var(--signal-hot)' }}
          />
          <h1 className={h1Cls} style={{ color: 'hsl(var(--text))' }}>Платёж отменён</h1>
          <p className={pCls} style={{ color: 'hsl(var(--muted))' }}>Оплата не была завершена. Попробуйте снова.</p>
          <Link href="/payment" className="contents">
            <ButtonV2 variant="primary" size="md">Повторить</ButtonV2>
          </Link>
        </>
      )}
    </div>
  );
}

export default function PaymentSuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin" style={{ color: 'hsl(var(--muted))' }} />
        </div>
      }
    >
      <SuccessContent />
    </Suspense>
  );
}
