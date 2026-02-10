'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Search, Users, BarChart3, ChevronRight } from 'lucide-react';
import { tokenStorage } from '@/client';
import { ThemeInit } from '@/components/ThemeInit';

export default function LandingPage() {
  const router = useRouter();

  useEffect(() => {
    const token = tokenStorage.getAccessToken();
    if (token) router.replace('/app');
  }, [router]);

  const features = [
    { icon: Search, title: 'SEO', desc: 'Аудит, проверки, история запросов' },
    { icon: Users, title: 'Лиды', desc: 'Поиск, контакты, экспорт, блеклист' },
    { icon: BarChart3, title: 'Госзакупки', desc: 'Мониторинг, история, фильтры' },
  ];

  const steps = [
    { n: 1, title: 'Выберите модуль', desc: 'SEO, поиск лидов или госзакупки' },
    { n: 2, title: 'Настройте параметры', desc: 'Фильтры, провайдеры, регион' },
    { n: 3, title: 'Получите результат', desc: 'Таблицы, экспорт, аналитика' },
  ];

  return (
    <>
      <ThemeInit />
      <div className="min-h-screen" style={{ backgroundColor: 'hsl(var(--bg))' }}>
        <header className="flex h-14 items-center justify-between px-6 border-b" style={{ borderColor: 'hsl(var(--border))' }}>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-[6px] bg-[hsl(var(--accent-weak))]">
              <span className="text-[14px] font-bold" style={{ color: 'hsl(var(--accent))' }}>S</span>
            </div>
            <span className="font-semibold text-[15px]" style={{ color: 'hsl(var(--text))' }}>SpinLid</span>
          </div>
          <Link
            href="/auth/login"
            className="rounded-[6px] px-4 py-2 text-[14px] font-medium transition-colors hover:opacity-90"
            style={{ backgroundColor: 'hsl(var(--accent))', color: 'white' }}
          >
            Войти
          </Link>
        </header>

        <section className="mx-auto max-w-4xl px-6 py-20 text-center">
          <h1 className="text-3xl font-bold md:text-4xl" style={{ color: 'hsl(var(--text))' }}>
            Поиск лидов, SEO и госзакупки — в одном кабинете
          </h1>
          <p className="mt-4 text-[16px]" style={{ color: 'hsl(var(--muted))' }}>
            Скорость, данные, таблицы. Всё для аналитики и сбора лидов.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <Link
              href="/auth/login"
              className="inline-flex items-center gap-2 rounded-[6px] px-6 py-3 text-[14px] font-medium text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: 'hsl(var(--accent))' }}
            >
              Войти <ChevronRight className="h-4 w-4" />
            </Link>
            <a
              href="#features"
              className="inline-flex items-center gap-2 rounded-[6px] border px-6 py-3 text-[14px] font-medium transition-colors hover:bg-[hsl(var(--surface-2))]"
              style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--text))' }}
            >
              Посмотреть возможности
            </a>
          </div>
        </section>

        <section id="features" className="border-t py-16" style={{ borderColor: 'hsl(var(--border))' }}>
          <div className="mx-auto max-w-5xl px-6">
            <h2 className="mb-10 text-center text-2xl font-semibold" style={{ color: 'hsl(var(--text))' }}>Возможности</h2>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {features.map((f) => {
                const Icon = f.icon;
                return (
                  <div
                    key={f.title}
                    className="rounded-[8px] border p-6"
                    style={{ backgroundColor: 'hsl(var(--surface))', borderColor: 'hsl(var(--border))' }}
                  >
                    <Icon className="mb-3 h-8 w-8" style={{ color: 'hsl(var(--accent))' }} />
                    <h3 className="text-[16px] font-semibold" style={{ color: 'hsl(var(--text))' }}>{f.title}</h3>
                    <p className="mt-1 text-[14px]" style={{ color: 'hsl(var(--muted))' }}>{f.desc}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="border-t py-16" style={{ borderColor: 'hsl(var(--border))' }}>
          <div className="mx-auto max-w-3xl px-6 text-center">
            <h2 className="mb-10 text-2xl font-semibold" style={{ color: 'hsl(var(--text))' }}>Как это работает</h2>
            <div className="flex flex-col gap-8 sm:flex-row sm:justify-center">
              {steps.map((s) => (
                <div key={s.n} className="flex flex-col items-center">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full text-[14px] font-semibold" style={{ backgroundColor: 'hsl(var(--accent-weak))', color: 'hsl(var(--accent))' }}>
                    {s.n}
                  </div>
                  <h3 className="mt-2 text-[15px] font-medium" style={{ color: 'hsl(var(--text))' }}>{s.title}</h3>
                  <p className="mt-1 text-[13px]" style={{ color: 'hsl(var(--muted))' }}>{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <footer className="border-t py-6" style={{ borderColor: 'hsl(var(--border))' }}>
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-6">
            <span className="text-[13px]" style={{ color: 'hsl(var(--muted))' }}>© SpinLid</span>
            <div className="flex gap-6 text-[13px]" style={{ color: 'hsl(var(--muted))' }}>
              <Link href="#" className="hover:underline">Политика</Link>
              <Link href="#" className="hover:underline">Контакты</Link>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}
