'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Loader2, Eye, EyeOff } from 'lucide-react';
import { apiClient, tokenStorage } from '@/client';

function GoogleIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

function getPasswordStrength(p: string): 0 | 1 | 2 | 3 {
  if (!p) return 0;
  let s = 0;
  if (p.length >= 4) s++;
  if (p.length >= 8) s++;
  if (/\d/.test(p) && /[a-zA-Z]/.test(p)) s++;
  return Math.min(s, 3) as 0 | 1 | 2 | 3;
}

export function LandingRegisterForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const passwordValid = password.length >= 8 && /\d/.test(password);
  const showConfirm = passwordValid || confirmPassword.length > 0;

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!email.trim()) e.email = 'Введите email';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = 'Неверный формат email';
    if (password.length < 8) e.password = 'Минимум 8 символов';
    else if (!/\d/.test(password)) e.password = 'Должна быть хотя бы 1 цифра';
    if (password !== confirmPassword) e.confirmPassword = 'Пароли не совпадают';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const isValid = Boolean(email.trim() && passwordValid && password === confirmPassword);
  const strength = getPasswordStrength(password);

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!validate() || loading) return;
    setLoading(true);
    setErrors({});
    try {
      await apiClient.post('/auth/register', { email, password });
      const { data } = await apiClient.post('/auth/login', { email, password });
      tokenStorage.setTokens(data.access_token, data.refresh_token);
      window.location.href = '/app';
    } catch (err: any) {
      const msg = err.response?.data?.detail || (err.code === 'ERR_NETWORK' ? 'Сервер недоступен' : err.message) || 'Ошибка при регистрации';
      setErrors({ form: Array.isArray(msg) ? msg.join(', ') : String(msg) });
    } finally {
      setLoading(false);
    }
  };

  const inputBase =
    'w-full h-[46px] px-4 rounded-[12px] border text-[14px] focus:outline-none focus:ring-2 focus:ring-[var(--landing-accent)] focus:ring-offset-1 transition-colors placeholder:opacity-80';
  const inputError = 'border-[var(--landing-danger)] focus:ring-[var(--landing-danger)]/30';

  return (
    <form onSubmit={handleSubmit} className="space-y-[14px]">
      {errors.form && (
        <div
          className="rounded-[12px] p-3 text-sm min-h-[40px] flex items-center"
          style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', color: 'var(--landing-danger)' }}
        >
          {errors.form}
        </div>
      )}
      <div>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => { setEmail(e.target.value); setErrors((p) => ({ ...p, email: '' })); }}
          className={`${inputBase} ${errors.email ? inputError : ''}`}
          style={{
            borderColor: errors.email ? 'var(--landing-danger)' : 'var(--landing-border)',
            backgroundColor: 'var(--landing-card)',
            color: 'var(--landing-text)',
          }}
        />
        {errors.email && <p className="mt-1 text-xs min-h-[16px]" style={{ color: 'var(--landing-danger)' }}>{errors.email}</p>}
      </div>
      <div>
        <div className="relative">
          <input
            type={showPassword ? 'text' : 'password'}
            placeholder="Пароль"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setErrors((p) => ({ ...p, password: '' })); }}
            className={`${inputBase} pr-10 ${errors.password ? inputError : ''}`}
            style={{
              borderColor: errors.password ? 'var(--landing-danger)' : 'var(--landing-border)',
              backgroundColor: 'var(--landing-card)',
              color: 'var(--landing-text)',
            }}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-black/5"
            style={{ color: 'var(--landing-muted)' }}
            aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <div className="mt-1.5 flex items-center gap-2">
          {password.length > 0 && (
            <div className="flex gap-0.5" title={strength === 1 ? 'Слабый' : strength === 2 ? 'Средний' : strength === 3 ? 'Сильный' : ''}>
              {[1, 2, 3].map((i) => (
                <span
                  key={i}
                  className="h-1 w-6 rounded-full transition-colors"
                  style={{
                    backgroundColor: strength >= i
                      ? strength === 1
                        ? 'var(--landing-danger)'
                        : strength === 2
                        ? 'var(--landing-warning)'
                        : 'var(--landing-success)'
                      : 'var(--landing-border)',
                  }}
                />
              ))}
            </div>
          )}
          <p className="text-[12px] min-h-[16px]" style={{ color: errors.password ? 'var(--landing-danger)' : 'var(--landing-muted)' }}>
            {errors.password || 'мин. 8 символов, 1 цифра'}
          </p>
        </div>
      </div>
      {showConfirm && (
        <div>
          <input
            type="password"
            placeholder="Подтвердите пароль"
            value={confirmPassword}
            onChange={(e) => { setConfirmPassword(e.target.value); setErrors((p) => ({ ...p, confirmPassword: '' })); }}
            className={`${inputBase} ${errors.confirmPassword ? inputError : ''}`}
            style={{
              borderColor: errors.confirmPassword ? 'var(--landing-danger)' : 'var(--landing-border)',
              backgroundColor: 'var(--landing-card)',
              color: 'var(--landing-text)',
            }}
          />
          {errors.confirmPassword && <p className="mt-1 text-xs min-h-[16px]" style={{ color: 'var(--landing-danger)' }}>{errors.confirmPassword}</p>}
        </div>
      )}
      <button
        type="submit"
        disabled={loading || !isValid}
        className="w-full h-[46px] rounded-[12px] text-[14px] font-medium text-white flex items-center justify-center gap-2 transition-all hover:opacity-90 active:opacity-95 focus:outline-none focus:ring-2 focus:ring-[var(--landing-accent)] focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed"
        style={{ backgroundColor: 'var(--landing-accent)' }}
      >
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin shrink-0" />
            Создаём…
          </>
        ) : (
          'Создать аккаунт'
        )}
      </button>
      <p className="text-[12px] text-center" style={{ color: 'var(--landing-muted)' }}>
        Можно удалить аккаунт в 1 клик
      </p>
      <div className="flex items-center gap-3 pt-1">
        <span className="flex-1 h-px" style={{ backgroundColor: 'var(--landing-border)', opacity: 0.6 }} />
        <span className="text-xs shrink-0" style={{ color: 'var(--landing-muted)', opacity: 0.8 }}>или</span>
        <span className="flex-1 h-px" style={{ backgroundColor: 'var(--landing-border)', opacity: 0.6 }} />
      </div>
      <button
        type="button"
        className="w-full h-[46px] rounded-[12px] border flex items-center justify-center gap-2 text-[14px] font-medium transition-colors hover:bg-[var(--landing-accent-soft)] active:bg-[var(--landing-accent-soft)] focus:outline-none focus:ring-2 focus:ring-[var(--landing-accent)] focus:ring-offset-2"
        style={{ borderColor: 'var(--landing-border)', color: 'var(--landing-text)' }}
      >
        <GoogleIcon />
        Продолжить с Google
      </button>
      <p className="text-center text-[13px]" style={{ color: 'var(--landing-muted)' }}>
        Уже есть аккаунт?{' '}
        <Link href="/auth/login" className="font-medium hover:underline" style={{ color: 'var(--landing-accent)' }}>
          Войти
        </Link>
      </p>
    </form>
  );
}
