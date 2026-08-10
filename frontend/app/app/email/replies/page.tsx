'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Redirect /app/email/replies → /app/email/messages
 *
 * Старая страница «Ответы» (таблица без текста/формы) заменена на
 * полноценный чат-мессенджер /app/email/messages. Этот файл оставляет
 * редирект, чтобы старые ссылки/закладки не ломались.
 */
export default function EmailRepliesRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/app/email/messages');
  }, [router]);
  return null;
}
