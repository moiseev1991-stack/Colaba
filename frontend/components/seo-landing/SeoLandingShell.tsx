import Link from 'next/link';
import { LegalFooter } from '@/components/legal/LegalFooter';

export interface FaqItem {
  q: string;
  a: string | React.ReactNode;
}

export interface RelatedLink {
  href: string;
  title: string;
  hint: string;
}

export interface HowItWorksItem {
  title: string;
  body: string;
}

interface SeoLandingShellProps {
  /** Главный H1 — содержит главный ключ кластера. */
  h1: string;
  /** Подзаголовок hero — описание пользы. */
  lead: string;
  /** Блок «проблема → решение» — 2-4 параграфа. */
  problemSolutionParagraphs: string[];
  /** Заголовок блока «как это делает SpinLid». */
  howItWorksTitle?: string;
  /** 3-4 шага «как это делает SpinLid». */
  howItWorks: HowItWorksItem[];
  /** Блок-фишка («диагноз из отзывов» либо своя фишка под нишу). */
  killer: { title: string; body: string };
  /** Мини-FAQ под конкретный запрос. */
  faq: FaqItem[];
  /** 2-3 смежные SEO-страницы для перелинковки. */
  related: RelatedLink[];
}

export function SeoLandingShell({
  h1,
  lead,
  problemSolutionParagraphs,
  howItWorksTitle = 'Как это работает в SpinLid',
  howItWorks,
  killer,
  faq,
  related,
}: SeoLandingShellProps) {
  return (
    <div
      className="min-h-screen flex flex-col"
      style={{
        background: 'hsl(var(--bg))',
        color: 'hsl(var(--text))',
        fontFamily: 'var(--font-body), system-ui, sans-serif',
      }}
    >
      <SeoHeader />

      <main className="flex-1">
        {/* Hero */}
        <section
          style={{
            background:
              'radial-gradient(1200px 600px at 50% -200px, rgba(45, 212, 191, 0.18), transparent), #0b1220',
            color: '#fff',
          }}
        >
          <div className="max-w-4xl mx-auto px-6 pt-16 pb-20 md:pt-24 md:pb-28 text-center">
            <h1
              className="font-display font-bold tracking-tight mb-5"
              style={{
                fontSize: 'clamp(2rem, 5vw, 3.5rem)',
                lineHeight: 1.1,
                color: '#fff',
              }}
            >
              {h1}
            </h1>
            <p
              className="mx-auto"
              style={{
                fontSize: 'clamp(1rem, 1.5vw, 1.25rem)',
                lineHeight: 1.55,
                color: 'rgba(255,255,255,0.8)',
                maxWidth: '680px',
              }}
            >
              {lead}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3 mt-9">
              <Link
                href="/auth/register"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  background:
                    'linear-gradient(135deg, #2dd4bf 0%, #06b6d4 100%)',
                  color: '#0b1220',
                  fontWeight: 600,
                  fontSize: '15px',
                  padding: '13px 22px',
                  borderRadius: '10px',
                  boxShadow: '0 10px 28px rgba(6, 182, 212, 0.32)',
                }}
              >
                Создать аккаунт
              </Link>
              <Link
                href="/#diagnosis"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  background: 'transparent',
                  color: 'rgba(255,255,255,0.85)',
                  fontWeight: 500,
                  fontSize: '15px',
                  padding: '12px 20px',
                  borderRadius: '10px',
                  border: '1px solid rgba(255,255,255,0.25)',
                }}
              >
                Посмотреть демо
              </Link>
            </div>
          </div>
        </section>

        {/* Проблема → решение */}
        <section className="max-w-3xl mx-auto px-6 py-14 md:py-20">
          <div className="space-y-5 text-base md:text-lg leading-relaxed">
            {problemSolutionParagraphs.map((p, i) => (
              <p key={i} style={{ color: 'hsl(var(--text))' }}>
                {p}
              </p>
            ))}
          </div>
        </section>

        {/* Как это делает SpinLid */}
        <section
          className="py-16 md:py-20"
          style={{ background: 'hsl(var(--surface))' }}
        >
          <div className="max-w-5xl mx-auto px-6">
            <h2
              className="font-display font-semibold tracking-tight text-2xl md:text-3xl mb-10 text-center"
              style={{ color: 'hsl(var(--text))' }}
            >
              {howItWorksTitle}
            </h2>
            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
              {howItWorks.map((step, i) => (
                <div
                  key={i}
                  className="rounded-2xl p-6 border"
                  style={{
                    background: 'hsl(var(--bg))',
                    borderColor: 'hsl(var(--border))',
                  }}
                >
                  <div
                    className="inline-flex items-center justify-center w-9 h-9 rounded-full mb-4 font-semibold"
                    style={{
                      background:
                        'linear-gradient(135deg, #2dd4bf 0%, #06b6d4 100%)',
                      color: '#0b1220',
                    }}
                  >
                    {i + 1}
                  </div>
                  <h3
                    className="font-display font-semibold text-base mb-2"
                    style={{ color: 'hsl(var(--text))' }}
                  >
                    {step.title}
                  </h3>
                  <p
                    className="text-sm leading-relaxed"
                    style={{ color: 'hsl(var(--muted))' }}
                  >
                    {step.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Фишка */}
        <section className="py-16 md:py-20">
          <div className="max-w-3xl mx-auto px-6">
            <div
              className="rounded-3xl p-8 md:p-10 border"
              style={{
                background:
                  'linear-gradient(135deg, rgba(45,212,191,0.10), rgba(6,182,212,0.06))',
                borderColor: 'rgba(45, 212, 191, 0.35)',
              }}
            >
              <div
                className="inline-block text-xs font-semibold tracking-widest uppercase mb-3 px-3 py-1 rounded-full"
                style={{
                  color: '#0b1220',
                  background:
                    'linear-gradient(135deg, #2dd4bf 0%, #06b6d4 100%)',
                }}
              >
                Фишка SpinLid
              </div>
              <h2
                className="font-display font-semibold tracking-tight text-2xl md:text-3xl mb-4"
                style={{ color: 'hsl(var(--text))' }}
              >
                {killer.title}
              </h2>
              <p
                className="text-base md:text-lg leading-relaxed"
                style={{ color: 'hsl(var(--text))' }}
              >
                {killer.body}
              </p>
              <div className="mt-6">
                <Link
                  href="/parsing-otzyvov"
                  className="text-sm font-semibold hover:underline"
                  style={{ color: '#06b6d4' }}
                >
                  Подробнее о диагнозе болей →
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ */}
        {faq.length > 0 && (
          <section
            className="py-16 md:py-20"
            style={{ background: 'hsl(var(--surface))' }}
          >
            <div className="max-w-3xl mx-auto px-6">
              <h2
                className="font-display font-semibold tracking-tight text-2xl md:text-3xl mb-8 text-center"
                style={{ color: 'hsl(var(--text))' }}
              >
                Частые вопросы
              </h2>
              <div className="space-y-3">
                {faq.map((item, i) => (
                  <details
                    key={i}
                    className="rounded-xl border px-5 py-4"
                    style={{
                      background: 'hsl(var(--bg))',
                      borderColor: 'hsl(var(--border))',
                    }}
                  >
                    <summary
                      className="cursor-pointer font-semibold text-base"
                      style={{ color: 'hsl(var(--text))' }}
                    >
                      {item.q}
                    </summary>
                    <div
                      className="mt-3 text-sm leading-relaxed"
                      style={{ color: 'hsl(var(--muted))' }}
                    >
                      {item.a}
                    </div>
                  </details>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Финальный CTA */}
        <section
          className="py-20"
          style={{
            background:
              'radial-gradient(900px 400px at 50% 50%, rgba(45, 212, 191, 0.2), transparent), #0b1220',
            color: '#fff',
            textAlign: 'center',
          }}
        >
          <div className="max-w-3xl mx-auto px-6">
            <h2
              className="font-display font-bold tracking-tight mb-4"
              style={{ fontSize: 'clamp(1.75rem, 3.5vw, 2.5rem)' }}
            >
              Готовы попробовать?
            </h2>
            <p
              className="mb-8"
              style={{
                color: 'rgba(255,255,255,0.75)',
                fontSize: '1rem',
                lineHeight: 1.55,
              }}
            >
              Регистрация за 30 секунд, без кредитной карты.
              <br />
              Первые 500 лидов и 5 кампаний КП — бесплатно.
            </p>
            <Link
              href="/auth/register"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                background:
                  'linear-gradient(135deg, #2dd4bf 0%, #06b6d4 100%)',
                color: '#0b1220',
                fontWeight: 600,
                fontSize: '16px',
                padding: '14px 26px',
                borderRadius: '10px',
                boxShadow: '0 12px 32px rgba(6, 182, 212, 0.4)',
              }}
            >
              Создать аккаунт →
            </Link>
          </div>
        </section>

        {/* Перелинковка */}
        {related.length > 0 && (
          <section className="py-12 md:py-16">
            <div className="max-w-5xl mx-auto px-6">
              <h2
                className="font-display font-semibold tracking-tight text-xl md:text-2xl mb-6"
                style={{ color: 'hsl(var(--text))' }}
              >
                Смежные возможности
              </h2>
              <div className="grid gap-4 md:grid-cols-3">
                {related.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="rounded-2xl p-5 border transition-colors hover:border-brand-500"
                    style={{
                      background: 'hsl(var(--surface))',
                      borderColor: 'hsl(var(--border))',
                    }}
                  >
                    <div
                      className="font-display font-semibold text-base mb-1"
                      style={{ color: 'hsl(var(--text))' }}
                    >
                      {link.title}
                    </div>
                    <div
                      className="text-sm"
                      style={{ color: 'hsl(var(--muted))' }}
                    >
                      {link.hint}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        )}
      </main>

      <LegalFooter />
    </div>
  );
}

function SeoHeader() {
  return (
    <header
      className="border-b"
      style={{
        borderColor: 'hsl(var(--border))',
        background: 'hsl(var(--bg))',
      }}
    >
      <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
        <Link
          href="/"
          className="font-display font-bold text-lg tracking-tight"
          style={{ color: 'hsl(var(--text))' }}
        >
          SpinLid
        </Link>
        <nav className="flex items-center gap-5 text-sm">
          <Link
            href="/#pricing"
            className="hover:underline"
            style={{ color: 'hsl(var(--muted))' }}
          >
            Тарифы
          </Link>
          <Link
            href="/auth/login"
            className="hover:underline"
            style={{ color: 'hsl(var(--muted))' }}
          >
            Войти
          </Link>
          <Link
            href="/auth/register"
            style={{
              background: 'linear-gradient(135deg, #2dd4bf 0%, #06b6d4 100%)',
              color: '#0b1220',
              fontWeight: 600,
              padding: '8px 14px',
              borderRadius: '8px',
            }}
          >
            Создать аккаунт
          </Link>
        </nav>
      </div>
    </header>
  );
}
