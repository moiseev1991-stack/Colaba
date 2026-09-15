'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { AlertCircle, Check } from 'lucide-react';
import { apiClient, tokenStorage } from '@/client';
import { ButtonV2 } from '@/components/ui/ButtonV2';
import { BrandMark } from '@/components/BrandMark';
import { authErrorMessage } from '@/lib/authErrors';

// Экран регистрации: карточка в том же стиле, что вход, логотип ведёт на сайт,
// коротко — что человек получит. Требования к паролю совпадают с формой на главной.

const BENEFITS = [
  'Компании из Яндекс.Карт и 2GIS по нише и городу',
  'Боли клиентов из отзывов — с цитатами',
  'Черновик письма под каждую компанию',
];

function RegisterForm() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const getNextPath = (): string => {
    const next = searchParams?.get('next') || '/app/leads';
    return next.startsWith('/') ? next : '/app/leads';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 8 || !/\d/.test(password)) {
      setError('Пароль: минимум 8 символов и хотя бы одна цифра');
      return;
    }

    if (password !== confirmPassword) {
      setError('Пароли не совпадают');
      return;
    }

    if (!consent) {
      setError(
        'Для регистрации необходимо принять Пользовательское соглашение и согласиться на обработку персональных данных'
      );
      return;
    }

    setLoading(true);

    try {
      await apiClient.post('/auth/register', { email, password });
      await apiClient.post('/auth/login', { email, password });
      tokenStorage.setTokens('', '');
      window.location.href = getNextPath();
    } catch (err: unknown) {
      setError(authErrorMessage(err, 'register'));
    } finally {
      setLoading(false);
    }
  };

  const inputCls =
    'block w-full h-10 px-3 py-2 text-sm rounded-v2-sm border focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 focus:z-10 transition-colors';
  const inputStyle = {
    background: 'hsl(var(--surface))',
    borderColor: 'hsl(var(--border))',
    color: 'hsl(var(--text))',
  } as const;

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-10 bg-mesh-brand"
      style={{ background: 'hsl(var(--bg))' }}
    >
      <div className="w-full max-w-[440px]">
        <div
          className="rounded-v2-lg border p-8 shadow-v2"
          style={{ backgroundColor: 'hsl(var(--surface))', borderColor: 'hsl(var(--border))' }}
        >
          <Link href="/" className="mb-6 flex items-center justify-center gap-2" aria-label="SpinLid — на главную">
            <BrandMark
              size={40}
              gradient="linear-gradient(135deg, #10b981 0%, #06b6d4 100%)"
              spiralColor="white"
              glow="var(--shadow-v2-sm)"
            />
            <span
              className="font-display font-semibold tracking-tight text-xl"
              style={{ color: 'hsl(var(--text))' }}
            >
              SpinLid
            </span>
          </Link>

          <h1
            className="text-center font-display font-semibold tracking-tight text-2xl"
            style={{ color: 'hsl(var(--text))' }}
          >
            Регистрация
          </h1>
          <p className="mt-2 text-center text-sm" style={{ color: 'hsl(var(--muted))' }}>
            Уже есть аккаунт?{' '}
            <Link href="/auth/login" className="font-medium text-brand-600 dark:text-brand-400 hover:underline">
              Войти
            </Link>
          </p>

          <ul className="mt-6 space-y-2">
            {BENEFITS.map((text) => (
              <li key={text} className="flex items-start gap-2 text-sm" style={{ color: 'hsl(var(--text))' }}>
                <Check className="h-4 w-4 shrink-0 mt-0.5 text-brand-600" aria-hidden />
                <span>{text}</span>
              </li>
            ))}
          </ul>

          <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
            {error && (
              <div
                className="rounded-v2-sm border p-4 flex items-start gap-2 text-sm"
                style={{
                  background: 'var(--signal-hot-bg)',
                  borderColor: 'rgb(239 68 68 / 0.3)',
                  color: 'var(--signal-hot)',
                }}
                role="alert"
              >
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <p>{error}</p>
              </div>
            )}
            <div className="space-y-3">
              <div>
                <label htmlFor="email" className="sr-only">Email</label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputCls}
                  style={inputStyle}
                  placeholder="Email адрес"
                />
              </div>
              <div>
                <label htmlFor="password" className="sr-only">Пароль</label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={inputCls}
                  style={inputStyle}
                  placeholder="Пароль"
                />
                <p className="mt-1 text-xs" style={{ color: 'hsl(var(--muted))' }}>
                  Минимум 8 символов и хотя бы одна цифра
                </p>
              </div>
              <div>
                <label htmlFor="confirmPassword" className="sr-only">Подтвердите пароль</label>
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={inputCls}
                  style={inputStyle}
                  placeholder="Подтвердите пароль"
                />
              </div>
            </div>

            <label
              className="flex items-start gap-3 text-xs"
              style={{ color: 'hsl(var(--muted))' }}
            >
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border focus:ring-2 focus:ring-brand-500"
                style={{ borderColor: 'hsl(var(--border))' }}
                required
              />
              <span>
                Создавая аккаунт, я принимаю{' '}
                <Link
                  href="/terms"
                  target="_blank"
                  className="text-brand-600 dark:text-brand-400 hover:underline"
                >
                  Пользовательское соглашение
                </Link>{' '}
                и даю{' '}
                <Link
                  href="/consent"
                  target="_blank"
                  className="text-brand-600 dark:text-brand-400 hover:underline"
                >
                  согласие на обработку персональных данных
                </Link>{' '}
                в соответствии с{' '}
                <Link
                  href="/policy"
                  target="_blank"
                  className="text-brand-600 dark:text-brand-400 hover:underline"
                >
                  Политикой конфиденциальности
                </Link>
                .
              </span>
            </label>

            {/* Кнопка всегда контрастная: без галочки согласия покажем понятную ошибку, а не бледную кнопку */}
            <ButtonV2
              type="submit"
              variant="primary"
              size="lg"
              loading={loading}
              className="w-full"
            >
              Зарегистрироваться
            </ButtonV2>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense
      fallback={
        <div
          className="min-h-screen flex items-center justify-center"
          style={{ color: 'hsl(var(--muted))' }}
        >
          Загрузка...
        </div>
      }
    >
      <RegisterForm />
    </Suspense>
  );
}
