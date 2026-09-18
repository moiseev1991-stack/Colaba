'use client';

/** Установка нового пароля по токену из письма (?token=). */

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { KeyRound } from 'lucide-react';
import { apiClient } from '@/client';
import { Button } from '@/components/ui/button';
import { CardV2 } from '@/components/ui/CardV2';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/toast';

function ResetInner() {
  const sp = useSearchParams();
  const token = sp.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      toast.error('Пароль — минимум 8 символов');
      return;
    }
    if (password !== confirm) {
      toast.error('Пароли не совпадают');
      return;
    }
    setLoading(true);
    try {
      await apiClient.post('/auth/password-reset/confirm', { token, new_password: password });
      setDone(true);
    } catch (err: unknown) {
      const d = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(typeof d === 'string' ? d : 'Ссылка недействительна или истекла');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 bg-ui-bg">
      <CardV2 className="w-full max-w-md p-8">
        <div className="mb-6 flex items-center gap-2 text-sm font-bold text-ui-text">
          <KeyRound className="h-5 w-5 text-ui-accent" aria-hidden /> Новый пароль
        </div>
        {!token ? (
          <p className="text-sm text-ui-text-muted">
            Ссылка неполная — откройте её из письма целиком.
          </p>
        ) : done ? (
          <div>
            <p className="text-sm text-ui-text-muted">Пароль обновлён.</p>
            <Button
              variant="primary"
              className="mt-4 w-full"
              onClick={() => (window.location.href = '/auth/login')}
            >
              Войти с новым паролем
            </Button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Новый пароль (8+)"
              autoFocus
              required
            />
            <Input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Повторите пароль"
              required
            />
            <Button type="submit" variant="primary" size="lg" className="w-full" loading={loading}>
              Установить пароль
            </Button>
          </form>
        )}
      </CardV2>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetInner />
    </Suspense>
  );
}
