'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { CheckCircle, Loader2, XCircle } from 'lucide-react';
import Link from 'next/link';
import { apiClient } from '@/client';

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

  return (
    <div className="max-w-[440px] mx-auto px-4 py-16 text-center">
      {status === 'loading' && <Loader2 className="h-12 w-12 text-gray-400 animate-spin mx-auto mb-4" />}
      {status === 'paid' && (
        <>
          <CheckCircle className="h-14 w-14 text-green-500 mx-auto mb-4" />
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mb-2">Оплата прошла успешно!</h1>
          <p className="text-gray-600 dark:text-gray-400 mb-6">Подписка активирована. Добро пожаловать!</p>
          <Link href="/app" className="inline-flex items-center justify-center px-6 py-2.5 rounded-[8px] bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors">
            Перейти в панель
          </Link>
        </>
      )}
      {status === 'pending' && (
        <>
          <Loader2 className="h-12 w-12 text-amber-500 animate-spin mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Обработка платежа…</h1>
          <p className="text-gray-600 dark:text-gray-400 mb-6">Платёж в обработке. Страница обновится автоматически.</p>
          <Link href="/app" className="text-sm text-blue-600 hover:underline">Вернуться в панель</Link>
        </>
      )}
      {status === 'failed' && (
        <>
          <XCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Платёж отменён</h1>
          <p className="text-gray-600 dark:text-gray-400 mb-6">Оплата не была завершена. Попробуйте снова.</p>
          <Link href="/payment" className="inline-flex items-center justify-center px-6 py-2.5 rounded-[8px] bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors">
            Повторить
          </Link>
        </>
      )}
    </div>
  );
}

export default function PaymentSuccessPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>}>
      <SuccessContent />
    </Suspense>
  );
}
