'use client';

/** Запрос сброса пароля (аудит 18.09): всегда одинаковый ответ сервера. */

import { useState } from 'react';
import { Mail } from 'lucide-react';
import { apiClient } from '@/client';
import { Button } from '@/components/ui/button';
import { CardV2 } from '@/components/ui/CardV2';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/toast';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || loading) return;
    setLoading(true);
    try {
      await apiClient.post('/auth/password-reset/request', { email: email.trim() });
      setSent(true);
    } catch {
      toast.error('Не удалось отправить письмо. Попробуйте позже.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 bg-ui-bg">
      <CardV2 className="w-full max-w-md p-8">
        <div className="mb-6 flex items-center gap-2 text-sm font-bold text-ui-text">
          <Mail className="h-5 w-5 text-ui-accent" aria-hidden /> Восстановление пароля
        </div>
        {sent ? (
          <p className="text-sm text-ui-text-muted">
            Если аккаунт существует, письмо со ссылкой отправлено. Проверьте почту — ссылка
            действует 1 час.
          </p>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <p className="text-sm text-ui-text-muted">
              Укажите email — отправим ссылку для установки нового пароля.
            </p>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              autoFocus
              required
            />
            <Button type="submit" variant="primary" size="lg" className="w-full" loading={loading}>
              Отправить ссылку
            </Button>
          </form>
        )}
        <a
          href="/auth/login"
          className="mt-6 block text-center text-sm text-ui-text-muted hover:text-ui-text hover:underline"
        >
          Вернуться к входу
        </a>
      </CardV2>
    </div>
  );
}
