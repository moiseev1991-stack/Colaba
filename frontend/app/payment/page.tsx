'use client';

/**
 * /payment — редирект в ЛК биллинга (2026-09): тарифы, оплата, подписка
 * и история живут на /app/billing. Старый адрес оставляем для совместности
 * (закладки, ссылки из старых писем). /payment/success сохранён — на него
 * возвращает ЮKassa после оплаты.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function PaymentRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/app/billing');
  }, [router]);

  return (
    <div className="flex min-h-[50vh] items-center justify-center text-sm text-ui-text-muted">
      Открываем баланс и тарифы…
    </div>
  );
}
