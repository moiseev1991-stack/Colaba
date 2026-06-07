import Link from 'next/link';
import { cookies, headers } from 'next/headers';
import { SeoLandingFooter } from './SeoLandingFooter';
import { SEO_NAV_LINKS } from '@/components/landing/seoNavLinks';

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
  // Текущий путь (для футера — скрыть себя из «Решений»). next-headers
  // в App Router server component'е даёт нам path через middleware-добавленный
  // заголовок или через href. Простой подход: парсим referer или берём
  // первый match из SEO_NAV_LINKS, если заголовок не пришёл. Жертвуем
  // точностью — это не критично, повторяющаяся ссылка не сломает UX.
  let currentHref: string | undefined;
  try {
    const path = headers().get('x-pathname') || headers().get('next-url') || '';
    const match = SEO_NAV_LINKS.find((s) => path.endsWith(s.href));
    currentHref = match?.href;
  } catch {
    /* server-only headers недоступны на build-time для статических страниц — OK */
  }

  // Залогиненный юзер уже в продукте — ему незачем «Создать аккаунт» и
  // gigantic hero. Cookie access_token есть только у авторизованных
  // (см. middleware.ts).
  const isAuthed = Boolean(cookies().get('access_token')?.value);

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{
        background: 'hsl(var(--bg))',
        color: 'hsl(var(--text))',
        fontFamily: 'var(--font-body), system-ui, sans-serif',
      }}
    >
      <SeoHeader isAuthed={isAuthed} />

      <main className="flex-1">
        {/* Hero — компактный для залогиненного, гостевой большой для незалогиненного */}
        {isAuthed ? (
          <section
            className="border-b"
            style={{
              borderColor: 'hsl(var(--border))',
              background: 'hsl(var(--bg))',
            }}
          >
            <div className="max-w-4xl mx-auto px-6 py-8">
              <h1
                className="font-display font-semibold tracking-tight mb-2"
                style={{
                  fontSize: 'clamp(1.5rem, 3vw, 2rem)',
                  color: 'hsl(var(--text))',
                }}
              >
                {h1}
              </h1>
              <p
                className="text-base"
                style={{ color: 'hsl(var(--muted))', maxWidth: '640px' }}
              >
                {lead}
              </p>
              <div className="mt-5">
                <Link
                  href="/app/leads"
                  className="inline-flex items-center gap-2 text-sm font-semibold hover:underline"
                  style={{ color: '#06b6d4' }}
                >
                  Открыть в кабинете →
                </Link>
              </div>
            </div>
          </section>
        ) : (
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
        )}

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

        {/* Демо-карточка — что юзер увидит в кабинете */}
        <section className="py-12 md:py-16">
          <div className="max-w-3xl mx-auto px-6">
            <div
              className="rounded-2xl border overflow-hidden"
              style={{
                background: 'hsl(var(--bg))',
                borderColor: 'hsl(var(--border))',
                boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
              }}
            >
              <div
                className="px-6 py-3 border-b text-xs font-semibold tracking-wide uppercase"
                style={{
                  background: 'hsl(var(--surface))',
                  borderColor: 'hsl(var(--border))',
                  color: 'hsl(var(--muted))',
                }}
              >
                Пример карточки компании в кабинете
              </div>
              <div className="p-6">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <div
                      className="font-display font-semibold text-lg"
                      style={{ color: 'hsl(var(--text))' }}
                    >
                      Стоматология «Улыбка+»
                    </div>
                    <div
                      className="text-sm mt-0.5"
                      style={{ color: 'hsl(var(--muted))' }}
                    >
                      Москва, ул. Ленина 12 · ★ 3.8 · 142 отзыва
                    </div>
                  </div>
                  <span
                    className="text-xs font-semibold px-2 py-0.5 rounded-full"
                    style={{
                      background: 'rgba(239, 68, 68, 0.12)',
                      color: '#dc2626',
                    }}
                  >
                    31 негатив
                  </span>
                </div>
                <div
                  className="text-sm mb-3"
                  style={{ color: 'hsl(var(--muted))' }}
                >
                  +7 (495) 123-45-67 · info@ulybka-plus.ru
                </div>
                <div
                  className="text-xs font-semibold uppercase tracking-wide mb-3"
                  style={{ color: '#f59e0b' }}
                >
                  Диагноз по отзывам
                </div>
                <div className="space-y-2">
                  <DemoPainTag
                    label="Долгое ожидание"
                    count={12}
                    quote="«Записала ребёнка на 10:00, приняли в 11:20.»"
                  />
                  <DemoPainTag
                    label="Непрозрачные цены"
                    count={7}
                    quote="«На сайте от 1500 ₽, по факту чек 4800.»"
                  />
                  <DemoPainTag
                    label="Не перезванивают"
                    count={5}
                    quote="«Оставила заявку три дня назад — ни звонка, ни SMS.»"
                  />
                </div>
              </div>
            </div>
            <p
              className="mt-3 text-center text-xs"
              style={{ color: 'hsl(var(--muted))' }}
            >
              Так выглядит каждая карточка в выдаче SpinLid — с конкретными
              жалобами клиентов, готовыми для зацепки в письме.
            </p>
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

        {/* Финальный CTA — для гостей «Создать аккаунт», для залогиненных «Открыть кабинет» */}
        {isAuthed ? (
          <section
            className="py-12 border-t"
            style={{
              borderColor: 'hsl(var(--border))',
              background: 'hsl(var(--surface))',
              textAlign: 'center',
            }}
          >
            <div className="max-w-3xl mx-auto px-6">
              <Link
                href="/app/leads"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  background:
                    'linear-gradient(135deg, #2dd4bf 0%, #06b6d4 100%)',
                  color: '#0b1220',
                  fontWeight: 600,
                  fontSize: '15px',
                  padding: '12px 24px',
                  borderRadius: '10px',
                }}
              >
                Открыть в кабинете →
              </Link>
            </div>
          </section>
        ) : (
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
        )}

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

      <SeoLandingFooter currentHref={currentHref} />
    </div>
  );
}

function SeoHeader({ isAuthed }: { isAuthed: boolean }) {
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
          {isAuthed ? (
            <>
              <Link
                href="/dashboard"
                className="hover:underline"
                style={{ color: 'hsl(var(--muted))' }}
              >
                Дашборд
              </Link>
              <Link
                href="/app/leads"
                style={{
                  background: 'linear-gradient(135deg, #2dd4bf 0%, #06b6d4 100%)',
                  color: '#0b1220',
                  fontWeight: 600,
                  padding: '8px 14px',
                  borderRadius: '8px',
                }}
              >
                К поиску
              </Link>
            </>
          ) : (
            <>
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
            </>
          )}
        </nav>
      </div>

      {/* Sub-nav: ссылки на все SEO-страницы. Все ссылки сразу в DOM —
          поисковики видят внутреннюю перелинковку, юзер быстро
          переключается между темами. Прокручивается горизонтально на
          узких экранах. */}
      <div
        style={{
          background: 'hsl(var(--surface))',
          borderTop: '1px solid hsl(var(--border))',
          borderBottom: '1px solid hsl(var(--border))',
        }}
      >
        <div
          className="max-w-5xl mx-auto px-6 py-2 flex items-center gap-1 overflow-x-auto"
          style={{ fontSize: '13px', whiteSpace: 'nowrap' }}
        >
          <span
            style={{
              fontSize: '11px',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              fontWeight: 600,
              color: 'hsl(var(--muted))',
              marginRight: '8px',
              flexShrink: 0,
            }}
          >
            Возможности:
          </span>
          {SEO_NAV_LINKS.map((s, i) => (
            <span key={s.href} style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
              <Link
                href={s.href}
                style={{
                  padding: '4px 8px',
                  borderRadius: '6px',
                  color: 'hsl(var(--text))',
                  textDecoration: 'none',
                }}
              >
                {shortLabel(s.href)}
              </Link>
              {i < SEO_NAV_LINKS.length - 1 && (
                <span style={{ color: 'hsl(var(--muted))', opacity: 0.4 }}>·</span>
              )}
            </span>
          ))}
        </div>
      </div>
    </header>
  );
}

function DemoPainTag({
  label,
  count,
  quote,
}: {
  label: string;
  count: number;
  quote: string;
}) {
  return (
    <div
      className="rounded-lg px-3 py-2"
      style={{
        background: 'rgba(245, 158, 11, 0.06)',
        border: '1px solid rgba(245, 158, 11, 0.18)',
      }}
    >
      <div className="flex items-center gap-2">
        <span
          className="text-xs font-semibold px-2 py-0.5 rounded-full"
          style={{
            background: 'rgba(245, 158, 11, 0.18)',
            color: '#b45309',
          }}
        >
          {label}
        </span>
        <span
          className="text-xs"
          style={{ color: 'hsl(var(--muted))' }}
        >
          × {count}
        </span>
      </div>
      <div
        className="mt-1 text-sm italic"
        style={{ color: 'hsl(var(--text))' }}
      >
        {quote}
      </div>
    </div>
  );
}

function shortLabel(href: string): string {
  switch (href) {
    case '/parsing-otzyvov':
      return 'Анализ отзывов';
    case '/parser-2gis':
      return 'Парсер 2GIS';
    case '/parser-yandex-maps':
      return 'Парсер Я.Карт';
    case '/baza-klientov':
      return 'База клиентов';
    case '/sbor-kontaktov':
      return 'Сбор контактов';
    case '/holodnaya-rassylka':
      return 'Холодная рассылка';
    default:
      return href;
  }
}
