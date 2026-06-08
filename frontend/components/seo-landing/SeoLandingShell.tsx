import Link from 'next/link';
import { cookies, headers } from 'next/headers';
import {
  Search,
  Sparkles,
  Target,
  Mail,
  MapPin,
  Map as MapIcon,
  Globe,
  FileText,
  Building2,
  Phone,
  Star,
  Quote,
  Banknote,
  Send,
  MailCheck,
  MailX,
  MessageSquare,
  Tag,
  PhoneCall,
  AtSign,
  Hash,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { SeoLandingFooter } from './SeoLandingFooter';
import { SEO_NAV_LINKS } from '@/components/landing/seoNavLinks';
import { BrandMark } from '@/components/BrandMark';
import { Reveal } from '@/components/Reveal';
import { HeroBackgroundDecor } from '@/components/HeroBackgroundDecor';

/**
 * Принудительная светлая палитра для SEO-страниц. Переопределяет CSS-токены
 * на root-обёртке, чтобы промо-страницы выглядели одинаково светлыми
 * у залогиненных юзеров (которые могут сидеть в dark theme) и в инкогнито.
 *
 * Значения совпадают с :root (light) из globals.css.
 */
const SEO_LIGHT_VARS = {
  '--bg': '216 20% 97%',
  '--surface': '0 0% 100%',
  '--surface-2': '214 32% 95%',
  '--border': '214 32% 89%',
  '--text': '222 47% 8%',
  '--muted': '215 16% 40%',
} as Record<string, string>;

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
  h1: string;
  lead: string;
  problemSolutionParagraphs: string[];
  howItWorksTitle?: string;
  howItWorks: HowItWorksItem[];
  killer: { title: string; body: string };
  faq: FaqItem[];
  related: RelatedLink[];
  /**
   * Тематика декоративных «стикеров» в фоне hero. Каждая SEO-страница
   * выбирает свою, чтобы фон ассоциировался с её темой (карты, отзывы,
   * контакты, юр.данные, рассылки). Если не задано — общий микс.
   */
  decorTheme?: keyof typeof HERO_DECOR;
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
  decorTheme = 'mixed',
}: SeoLandingShellProps) {
  const isAuthed = Boolean(cookies().get('access_token')?.value);

  let currentHref: string | undefined;
  try {
    const path = headers().get('x-pathname') || headers().get('next-url') || '';
    const match = SEO_NAV_LINKS.find((s) => path.endsWith(s.href));
    currentHref = match?.href;
  } catch {}

  return (
    <div
      className="min-h-screen flex flex-col"
      data-theme="light"
      style={{
        ...SEO_LIGHT_VARS,
        background: 'hsl(var(--bg))',
        color: 'hsl(var(--text))',
        fontFamily: 'var(--font-body), system-ui, sans-serif',
      } as React.CSSProperties}
    >
      <SeoHeader isAuthed={isAuthed} />

      <main className="flex-1">
        {/* === HERO: левая колонка (заголовок+CTA), правая (демо-карточка) === */}
        {isAuthed ? <CompactAuthedHero h1={h1} lead={lead} /> : <GuestHero h1={h1} lead={lead} decorTheme={decorTheme} />}

        {/* Trust-strip */}
        <Reveal><TrustStrip /></Reveal>

        {/* «Было / стало» — визуальная схема вместо текстовых абзацев */}
        <Reveal><BeforeAfterDiagram /></Reveal>

        {/* Проблема → решение (плотные параграфы, max-width 640) */}
        <Reveal>
          <section className="max-w-2xl mx-auto px-6 py-12 md:py-16">
            <div className="space-y-4 text-base leading-relaxed">
              {problemSolutionParagraphs.map((p, i) => (
                <p key={i} style={{ color: 'hsl(var(--text))' }}>
                  {p}
                </p>
              ))}
            </div>
          </section>
        </Reveal>

        {/* Как это работает — 4 шага с иконками */}
        <Reveal><HowItWorksSection title={howItWorksTitle} items={howItWorks} /></Reveal>

        {/* Источники данных — логотипы */}
        <Reveal><SourcesSection /></Reveal>

        {/* Скриншоты кабинета (mock-блоки) */}
        <Reveal><ScreensSection /></Reveal>

        {/* Сравнение «обычный парсер vs SpinLid» */}
        <Reveal><CompareTable /></Reveal>

        {/* Фишка-блок (брендовая плашка) */}
        <Reveal><KillerBlock title={killer.title} body={killer.body} /></Reveal>

        {/* FAQ */}
        {faq.length > 0 && <Reveal><FaqSection items={faq} /></Reveal>}

        {/* Финальный CTA */}
        <Reveal>{isAuthed ? <CompactAuthedCta /> : <FinalCta />}</Reveal>

        {/* Перелинковка */}
        {related.length > 0 && <Reveal><RelatedBlock related={related} /></Reveal>}
      </main>

      <SeoLandingFooter currentHref={currentHref} />
    </div>
  );
}

// ============================================================================
// HERO — две колонки: H1+CTA слева, демо-карточка с диагнозом справа
// ============================================================================

function GuestHero({ h1, lead, decorTheme }: { h1: string; lead: string; decorTheme: keyof typeof HERO_DECOR }) {
  return (
    <section
      style={{
        position: 'relative',
        overflow: 'hidden',
        background: '#070b14',
        color: '#fff',
      }}
    >
      {/* Декоративный фон: mesh-blobs + dot-matrix + SVG-граф потоков данных */}
      <HeroBackgroundDecor />

      {/* Декоративные «стикеры» — тема под конкретную SEO-страницу */}
      <HeroFloatingTags theme={decorTheme} />

      <div className="relative max-w-6xl mx-auto px-6 pt-14 pb-16 md:pt-20 md:pb-24 grid gap-12 md:grid-cols-2 items-center" style={{ zIndex: 1 }}>
        <div>
          <h1
            className="font-display font-bold tracking-tight mb-5"
            style={{
              fontSize: 'clamp(2rem, 4vw, 3.25rem)',
              lineHeight: 1.07,
              color: '#fff',
            }}
          >
            {h1}
          </h1>
          <p
            style={{
              fontSize: 'clamp(0.95rem, 1.3vw, 1.125rem)',
              lineHeight: 1.55,
              color: 'rgba(255,255,255,0.78)',
              maxWidth: '520px',
            }}
          >
            {lead}
          </p>
          <div className="flex flex-wrap gap-3 mt-7">
            <Link
              href="/auth/register"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                background: 'linear-gradient(135deg, #2dd4bf 0%, #06b6d4 100%)',
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

        {/* Демо-карточка в hero (перенесена с самого низа сюда) */}
        <DemoCompanyCard variant="hero" />
      </div>
    </section>
  );
}

/**
 * Декоративные «плавающие стикеры» в фоне hero. SSR-friendly, без JS.
 * Каждый стикер — стилизованный chip с продуктовой деталью (карта, отзыв,
 * контакт, рассылка, юр.данные). На каждой SEO-странице — свой набор,
 * чтобы фон ассоциировался с темой страницы. Псевдо-3D через rotate +
 * glassy backdrop-blur + glow в бренд-цвете.
 */
type DecorItem = {
  Icon?: LucideIcon;
  text: string;
  color: string;
  top: string;
  left: string;
  rotate: number;
};

const HERO_DECOR: Record<string, DecorItem[]> = {
  // /parser-2gis — карты, точки, телефоны, рейтинг
  maps: [
    { Icon: MapPin, text: 'Москва · 2GIS', color: '#19c129', top: '10%', left: '5%', rotate: -8 },
    { Icon: Star, text: '★ 3.8 · 142 отзыва', color: '#f59e0b', top: '22%', left: '44%', rotate: 4 },
    { Icon: Phone, text: '+7 (495) 123-45-67', color: '#06b6d4', top: '72%', left: '6%', rotate: 5 },
    { Icon: Building2, text: 'Карточка компании', color: '#a855f7', top: '8%', left: '76%', rotate: 6 },
    { Icon: Tag, text: 'Ниша · стоматология', color: '#3b82f6', top: '78%', left: '50%', rotate: -3 },
    { Icon: MapPin, text: '55.7558°, 37.6173°', color: '#ef4444', top: '58%', left: '86%', rotate: -5 },
  ],
  // /parser-yandex-maps — карты Яндекс, склейка дублей
  'maps-yandex': [
    { Icon: MapIcon, text: 'Я.Карты · СПб', color: '#ffcc00', top: '10%', left: '5%', rotate: -8 },
    { Icon: MapPin, text: 'Метро · Невский пр.', color: '#06b6d4', top: '22%', left: '44%', rotate: 4 },
    { Icon: Sparkles, text: 'Склейка дублей', color: '#a855f7', top: '72%', left: '6%', rotate: 5 },
    { Icon: Star, text: '★ 4.2', color: '#f59e0b', top: '8%', left: '78%', rotate: 6 },
    { Icon: Phone, text: '+7 (812) 555-12-34', color: '#19c129', top: '78%', left: '50%', rotate: -3 },
    { Icon: Building2, text: '8 470 компаний', color: '#3b82f6', top: '58%', left: '86%', rotate: -5 },
  ],
  // /parsing-otzyvov — отзывы, цитаты, рейтинги, pain-теги
  reviews: [
    { Icon: Star, text: '★ 3.8 · 142 отзыва', color: '#f59e0b', top: '10%', left: '5%', rotate: -8 },
    { Icon: Quote, text: '«долго ждали приём»', color: '#ef4444', top: '22%', left: '44%', rotate: 4 },
    { Icon: Tag, text: 'pain · цены', color: '#a855f7', top: '72%', left: '6%', rotate: 5 },
    { Icon: MessageSquare, text: '31 негатив', color: '#ec4899', top: '8%', left: '76%', rotate: 6 },
    { Icon: Sparkles, text: 'AI · кластеризация', color: '#06b6d4', top: '78%', left: '50%', rotate: -3 },
    { Icon: Quote, text: '«не перезвонили»', color: '#f59e0b', top: '58%', left: '86%', rotate: -5 },
  ],
  // /baza-klientov — юр.данные, лиды, деньги, ИНН
  database: [
    { Icon: Hash, text: 'ИНН 7704123456', color: '#3b82f6', top: '10%', left: '5%', rotate: -8 },
    { Icon: Banknote, text: 'выручка 18 млн ₽', color: '#19c129', top: '22%', left: '44%', rotate: 4 },
    { Icon: Users, text: 'ЛПР: Иванов И. И.', color: '#a855f7', top: '72%', left: '6%', rotate: 5 },
    { Icon: FileText, text: 'ОГРН · ЕГРЮЛ', color: '#64748b', top: '8%', left: '78%', rotate: 6 },
    { Icon: Building2, text: 'возраст 8 лет', color: '#06b6d4', top: '78%', left: '50%', rotate: -3 },
    { Icon: Tag, text: 'DaData · обогащение', color: '#f59e0b', top: '58%', left: '86%', rotate: -5 },
  ],
  // /sbor-kontaktov — email, телефоны, мессенджеры, краулер
  contacts: [
    { Icon: AtSign, text: 'info@ulybka-plus.ru', color: '#06b6d4', top: '10%', left: '5%', rotate: -8 },
    { Icon: PhoneCall, text: '+7 (495) 123-45-67', color: '#19c129', top: '22%', left: '44%', rotate: 4 },
    { Icon: Globe, text: '/contacts · /team', color: '#a855f7', top: '72%', left: '6%', rotate: 5 },
    { Icon: MessageSquare, text: 'Telegram · WhatsApp', color: '#3b82f6', top: '8%', left: '78%', rotate: 6 },
    { Icon: Mail, text: '12 480 email собрано', color: '#ec4899', top: '78%', left: '50%', rotate: -3 },
    { Icon: Phone, text: '+7 (812) 555-90-12', color: '#f59e0b', top: '58%', left: '86%', rotate: -5 },
  ],
  // /holodnaya-rassylka — конверты, статусы доставки, кампании
  mailing: [
    { Icon: Send, text: 'Кампания · 500 писем', color: '#06b6d4', top: '10%', left: '5%', rotate: -8 },
    { Icon: MailCheck, text: 'доставлено 487', color: '#19c129', top: '22%', left: '44%', rotate: 4 },
    { Icon: Mail, text: 'открыто 213 (44%)', color: '#a855f7', top: '72%', left: '6%', rotate: 5 },
    { Icon: MailX, text: 'отказы 13 (2.6%)', color: '#ef4444', top: '8%', left: '78%', rotate: 6 },
    { Icon: Sparkles, text: 'персональный pain', color: '#f59e0b', top: '78%', left: '50%', rotate: -3 },
    { Icon: AtSign, text: 'ivan@example.ru', color: '#3b82f6', top: '58%', left: '86%', rotate: -5 },
  ],
  // дефолтный микс — лендинг / непрофильные страницы
  mixed: [
    { Icon: MapPin, text: '2GIS · отзывы', color: '#19c129', top: '12%', left: '6%', rotate: -8 },
    { Icon: PhoneCall, text: 'Я.Карты · контакты', color: '#ffcc00', top: '22%', left: '46%', rotate: 4 },
    { Icon: Hash, text: 'DaData · ИНН/ОГРН', color: '#3b82f6', top: '70%', left: '8%', rotate: 5 },
    { Icon: Sparkles, text: 'AI · pain-теги', color: '#a855f7', top: '8%', left: '78%', rotate: 6 },
    { Icon: Users, text: 'ЛПР · /team', color: '#f59e0b', top: '60%', left: '88%', rotate: -5 },
    { Icon: Mail, text: 'Рассылка · CTR 44%', color: '#06b6d4', top: '78%', left: '52%', rotate: -3 },
  ],
};

function HeroFloatingTags({ theme }: { theme: keyof typeof HERO_DECOR }) {
  const items = HERO_DECOR[theme] ?? HERO_DECOR.mixed;
  return (
    <div
      aria-hidden
      className="hidden md:block"
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 0,
      }}
    >
      {items.map((t, i) => (
        <span
          key={i}
          style={{
            position: 'absolute',
            top: t.top,
            left: t.left,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            transform: `rotate(${t.rotate}deg)`,
            background: 'rgba(15, 23, 42, 0.55)',
            border: `1px solid ${t.color}55`,
            color: t.color,
            fontSize: '11px',
            fontWeight: 600,
            letterSpacing: '0.02em',
            padding: '5px 11px 5px 9px',
            borderRadius: '999px',
            boxShadow: `0 0 0 1px ${t.color}22, 0 8px 24px rgba(0,0,0,0.35)`,
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            opacity: 0.75,
            whiteSpace: 'nowrap',
          }}
        >
          {t.Icon && <t.Icon size={12} strokeWidth={2.4} color={t.color} />}
          {t.text}
        </span>
      ))}
    </div>
  );
}

function CompactAuthedHero({ h1, lead }: { h1: string; lead: string }) {
  return (
    <section
      className="border-b"
      style={{
        borderColor: 'hsl(var(--border))',
        background: 'hsl(var(--bg))',
      }}
    >
      <div className="max-w-5xl mx-auto px-6 py-8">
        <h1
          className="font-display font-semibold tracking-tight mb-2"
          style={{
            fontSize: 'clamp(1.5rem, 3vw, 2rem)',
            color: 'hsl(var(--text))',
          }}
        >
          {h1}
        </h1>
        <p className="text-base" style={{ color: 'hsl(var(--muted))', maxWidth: '640px' }}>
          {lead}
        </p>
        <Link
          href="/app/leads"
          className="mt-4 inline-flex items-center gap-2 text-sm font-semibold hover:underline"
          style={{ color: '#06b6d4' }}
        >
          Открыть в кабинете →
        </Link>
      </div>
    </section>
  );
}

// ============================================================================
// Demo company card — главное доказательство
// ============================================================================

function DemoCompanyCard({ variant = 'inline' }: { variant?: 'hero' | 'inline' }) {
  const inHero = variant === 'hero';
  return (
    <div
      className="rounded-2xl border overflow-hidden"
      style={{
        background: inHero ? '#fff' : 'hsl(var(--bg))',
        borderColor: inHero ? 'rgba(255,255,255,0.15)' : 'hsl(var(--border))',
        boxShadow: inHero
          ? '0 30px 60px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.08)'
          : '0 4px 16px rgba(0,0,0,0.06)',
        color: '#0b1220',
      }}
    >
      <div
        className="px-5 py-2.5 border-b text-[11px] font-semibold tracking-wide uppercase"
        style={{
          background: '#f8fafc',
          borderColor: '#e2e8f0',
          color: '#64748b',
        }}
      >
        Карточка компании в кабинете
      </div>
      <div className="p-5">
        <div className="flex items-start justify-between gap-3 mb-1">
          <div>
            <div
              className="font-display font-semibold"
              style={{ color: '#0f172a', fontSize: '18px' }}
            >
              Стоматология «Улыбка+»
            </div>
            <div className="text-sm mt-0.5" style={{ color: '#64748b' }}>
              Москва, ул. Ленина 12 · ★ 3.8 · 142 отзыва
            </div>
          </div>
          <span
            className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
            style={{ background: '#fee2e2', color: '#b91c1c' }}
          >
            31 негатив
          </span>
        </div>
        <div className="text-sm mb-3" style={{ color: '#64748b' }}>
          +7 (495) 123-45-67 · info@ulybka-plus.ru
        </div>
        <div
          className="text-[11px] font-semibold uppercase tracking-wide mb-3"
          style={{ color: '#d97706' }}
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
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            className="flex-1 text-[13px] font-semibold py-2 rounded-lg"
            style={{
              background: 'linear-gradient(135deg, #2dd4bf 0%, #06b6d4 100%)',
              color: '#0b1220',
              cursor: 'default',
            }}
          >
            ✨ Сгенерировать КП
          </button>
        </div>
      </div>
    </div>
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
        background: '#fef3c7',
        border: '1px solid #fde68a',
      }}
    >
      <div className="flex items-center gap-2">
        <span
          className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
          style={{ background: '#fbbf24', color: '#78350f' }}
        >
          {label}
        </span>
        <span className="text-[11px]" style={{ color: '#a16207' }}>
          × {count}
        </span>
      </div>
      <div
        className="mt-1 text-[13px] italic leading-snug"
        style={{ color: '#0f172a' }}
      >
        {quote}
      </div>
    </div>
  );
}

// ============================================================================
// Trust strip (4 числа)
// ============================================================================

function TrustStrip() {
  return (
    <section
      className="border-y"
      style={{
        background: 'hsl(var(--surface))',
        borderColor: 'hsl(var(--border))',
      }}
    >
      <div className="max-w-5xl mx-auto px-6 py-5">
        <div
          className="grid grid-cols-2 md:grid-cols-4 gap-px overflow-hidden rounded-xl"
          style={{ background: 'hsl(var(--border))' }}
        >
          <TrustCell value="5" label="источников данных" hint="2GIS, Я.Карты, сайты, ЕГРЮЛ, DaData" />
          <TrustCell value="~60 сек" label="до результата" hint="первый поиск" />
          <TrustCell value="500" label="лидов бесплатно" hint="без кредитной карты" />
          <TrustCell value="0 ₽" label="за старт" hint="платный тариф — при росте" />
        </div>
      </div>
    </section>
  );
}

function TrustCell({
  value,
  label,
  hint,
}: {
  value: string;
  label: string;
  hint?: string;
}) {
  return (
    <div className="px-3 py-3 md:px-4 md:py-4" style={{ background: 'hsl(var(--bg))' }}>
      <div
        className="font-display font-bold text-xl md:text-2xl"
        style={{
          background: 'linear-gradient(135deg, #2dd4bf 0%, #06b6d4 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          color: 'transparent',
          letterSpacing: '-0.01em',
        }}
      >
        {value}
      </div>
      <div className="text-xs md:text-sm mt-0.5 font-medium" style={{ color: 'hsl(var(--text))' }}>
        {label}
      </div>
      {hint && (
        <div
          className="text-[11px] mt-0.5 leading-tight"
          style={{ color: 'hsl(var(--muted))' }}
        >
          {hint}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Before / After diagram — визуальная схема
// ============================================================================

function BeforeAfterDiagram() {
  return (
    <section className="py-14 md:py-20">
      <div className="max-w-5xl mx-auto px-6">
        <h2
          className="font-display font-semibold tracking-tight text-2xl md:text-3xl mb-3 text-center"
          style={{ color: 'hsl(var(--text))' }}
        >
          200 отзывов → 3 конкретные боли
        </h2>
        <p
          className="text-center text-sm md:text-base mb-10 max-w-xl mx-auto"
          style={{ color: 'hsl(var(--muted))' }}
        >
          Стандартный путь — таблица из 200 строк. Наш — три повторяющиеся
          жалобы с цитатами клиента, готовые для зацепки в письме.
        </p>
        <div className="grid gap-4 md:grid-cols-[1fr_60px_1fr] items-center">
          {/* BEFORE */}
          <div
            className="rounded-2xl border p-5"
            style={{
              background: 'hsl(var(--surface))',
              borderColor: 'hsl(var(--border))',
            }}
          >
            <div
              className="text-[11px] font-semibold uppercase tracking-wider mb-3"
              style={{ color: 'hsl(var(--muted))' }}
            >
              Было: 200 отзывов в Excel
            </div>
            <div className="space-y-1.5">
              {[
                'Долго ждала ребенка с приема...',
                'Хорошие врачи, рекомендую.',
                'Очень удобное расписание.',
                'Сказали 1500, заплатила 4800!',
                'Записалась за неделю, всё ок.',
                'Не позвонили после заявки.',
                'Спасибо доктору Иванову...',
                'Пришла к 10, приняли в 11:20.',
              ].map((t, i) => (
                <div
                  key={i}
                  className="text-[12px] px-2 py-1 rounded truncate"
                  style={{
                    background: 'hsl(var(--bg))',
                    color: 'hsl(var(--muted))',
                  }}
                >
                  • {t}
                </div>
              ))}
              <div
                className="text-[11px] text-center mt-2 italic"
                style={{ color: 'hsl(var(--muted))' }}
              >
                ... и ещё 192 строки
              </div>
            </div>
          </div>

          {/* ARROW */}
          <div className="hidden md:flex flex-col items-center gap-2">
            <div
              className="flex items-center justify-center rounded-full w-14 h-14 font-bold text-lg"
              style={{
                background: 'linear-gradient(135deg, #2dd4bf 0%, #06b6d4 100%)',
                color: '#0b1220',
              }}
            >
              AI
            </div>
            <div className="text-3xl" style={{ color: '#06b6d4' }}>
              →
            </div>
          </div>
          <div className="md:hidden flex justify-center my-2 text-2xl" style={{ color: '#06b6d4' }}>
            ↓
          </div>

          {/* AFTER */}
          <div
            className="rounded-2xl border p-5"
            style={{
              background:
                'linear-gradient(135deg, rgba(45,212,191,0.10), rgba(6,182,212,0.05))',
              borderColor: 'rgba(45, 212, 191, 0.35)',
            }}
          >
            <div
              className="text-[11px] font-semibold uppercase tracking-wider mb-3"
              style={{ color: '#0891b2' }}
            >
              Стало: 3 боли с цитатами
            </div>
            <div className="space-y-2">
              <AfterPainTag label="Долгое ожидание × 12" />
              <AfterPainTag label="Непрозрачные цены × 7" />
              <AfterPainTag label="Не перезванивают × 5" />
            </div>
            <div
              className="mt-3 text-[12px] leading-snug"
              style={{ color: 'hsl(var(--text))' }}
            >
              Каждая — с реальной цитатой клиента, готова для зацепки в письме.
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function AfterPainTag({ label }: { label: string }) {
  return (
    <div
      className="px-3 py-2 rounded-lg text-sm font-medium"
      style={{
        background: 'rgba(245, 158, 11, 0.15)',
        color: '#92400e',
        border: '1px solid rgba(245, 158, 11, 0.3)',
      }}
    >
      ⚠ {label}
    </div>
  );
}

// ============================================================================
// How it works — 4 шага с иконками
// ============================================================================

function HowItWorksSection({
  title,
  items,
}: {
  title: string;
  items: HowItWorksItem[];
}) {
  const stepIcons = [Search, Sparkles, Target, Mail];
  return (
    <section
      className="py-16 md:py-20"
      style={{ background: 'hsl(var(--surface))' }}
    >
      <div className="max-w-5xl mx-auto px-6">
        <h2
          className="font-display font-semibold tracking-tight text-2xl md:text-3xl mb-10 text-center"
          style={{ color: 'hsl(var(--text))' }}
        >
          {title}
        </h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {items.map((step, i) => {
            const Icon = stepIcons[i] ?? Sparkles;
            return (
              <div
                key={i}
                className="rounded-2xl p-5 border"
                style={{
                  background: 'hsl(var(--bg))',
                  borderColor: 'hsl(var(--border))',
                }}
              >
                <div className="flex items-center gap-3 mb-3">
                  <div
                    className="inline-flex items-center justify-center w-11 h-11 rounded-xl"
                    style={{
                      background:
                        'linear-gradient(135deg, rgba(16,185,129,0.22), rgba(6,182,212,0.18))',
                      border: '1px solid rgba(16,185,129,0.35)',
                      boxShadow: '0 4px 14px rgba(6,182,212,0.18)',
                    }}
                  >
                    <Icon size={22} strokeWidth={2.2} color="#0b1220" />
                  </div>
                  <div
                    className="text-[11px] font-bold tracking-widest uppercase"
                    style={{ color: '#0ea97a' }}
                  >
                    Шаг {i + 1}
                  </div>
                </div>
                <h3
                  className="font-display font-semibold text-base mb-1.5"
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
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ============================================================================
// Sources — логотипы 5 источников
// ============================================================================

const SOURCES = [
  { label: '2GIS', hint: 'Карточки компаний и отзывы', color: '#19c129', Icon: MapPin },
  { label: 'Яндекс.Карты', hint: 'Альтернативный источник', color: '#ffcc00', Icon: MapIcon },
  { label: 'Сайты компаний', hint: 'Краулер: контакты, /team', color: '#06b6d4', Icon: Globe },
  { label: 'ЕГРЮЛ', hint: 'ИНН, ОГРН, юр.адрес', color: '#64748b', Icon: FileText },
  { label: 'DaData', hint: 'Оборот, возраст, директор', color: '#2563eb', Icon: Building2 },
];

function SourcesSection() {
  return (
    <section className="py-12 md:py-16">
      <div className="max-w-5xl mx-auto px-6">
        <div
          className="text-center text-xs font-semibold uppercase tracking-widest mb-3"
          style={{ color: 'hsl(var(--muted))' }}
        >
          5 источников данных
        </div>
        <h2
          className="font-display font-semibold tracking-tight text-2xl md:text-3xl mb-8 text-center"
          style={{ color: 'hsl(var(--text))' }}
        >
          Не один парсер — пять открытых источников
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {SOURCES.map(({ label, hint, color, Icon }) => (
            <div
              key={label}
              className="rounded-xl border p-4 text-center transition-shadow hover:shadow-md"
              style={{
                background: 'hsl(var(--surface))',
                borderColor: 'hsl(var(--border))',
              }}
            >
              <div
                className="inline-flex items-center justify-center w-11 h-11 rounded-lg mx-auto mb-2"
                style={{
                  background: `${color}1f`,
                  border: `1px solid ${color}55`,
                }}
              >
                <Icon size={22} strokeWidth={2.2} color={color} />
              </div>
              <div
                className="font-display font-semibold text-sm mb-0.5"
                style={{ color: 'hsl(var(--text))' }}
              >
                {label}
              </div>
              <div className="text-[11px] leading-tight" style={{ color: 'hsl(var(--muted))' }}>
                {hint}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ============================================================================
// Mock-скриншоты кабинета — стилизованные UI блоки
// ============================================================================

function ScreensSection() {
  return (
    <section
      className="py-16 md:py-20"
      style={{ background: 'hsl(var(--surface))' }}
    >
      <div className="max-w-6xl mx-auto px-6">
        <h2
          className="font-display font-semibold tracking-tight text-2xl md:text-3xl mb-10 text-center"
          style={{ color: 'hsl(var(--text))' }}
        >
          Как это выглядит в кабинете
        </h2>
        <div className="grid gap-5 md:grid-cols-3">
          <ScreenMock
            title="Выдача со списком"
            sub="Бейджи источника, рейтинг, негатив, контакты"
            inner={<MockListView />}
          />
          <ScreenMock
            title="Карточка с диагнозом"
            sub="Pain-теги, цитаты, юр.данные, кнопка письма"
            inner={<DemoCompanyCard variant="inline" />}
          />
          <ScreenMock
            title="Драфт письма"
            sub="AI пишет с конкретной цитатой клиента"
            inner={<MockLetterDraft />}
          />
        </div>
      </div>
    </section>
  );
}

function ScreenMock({
  title,
  sub,
  inner,
}: {
  title: string;
  sub: string;
  inner: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2.5">
        <div
          className="font-display font-semibold text-sm"
          style={{ color: 'hsl(var(--text))' }}
        >
          {title}
        </div>
        <div className="text-[12px]" style={{ color: 'hsl(var(--muted))' }}>
          {sub}
        </div>
      </div>
      <div>{inner}</div>
    </div>
  );
}

function MockListView() {
  return (
    <div
      className="rounded-2xl border overflow-hidden"
      style={{ background: '#fff', borderColor: '#e2e8f0', color: '#0f172a' }}
    >
      <div
        className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wide border-b"
        style={{ background: '#f8fafc', borderColor: '#e2e8f0', color: '#64748b' }}
      >
        Найдено · 89 компаний
      </div>
      {[
        { name: 'Дента-Профит', rating: '4.7', src: '2GIS' },
        { name: 'Улыбка+', rating: '3.8', src: 'оба', neg: 31 },
        { name: 'Стома-Эксперт', rating: '4.2', src: 'Я.К' },
        { name: 'Дентал Люкс', rating: '4.5', src: '2GIS' },
      ].map((r, i) => (
        <div
          key={i}
          className="px-4 py-2.5 flex items-center justify-between text-sm border-b last:border-b-0"
          style={{ borderColor: '#f1f5f9' }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
              style={{ background: '#e0f2fe', color: '#0369a1' }}
            >
              {r.src}
            </span>
            <span className="truncate font-medium">{r.name}</span>
          </div>
          <div className="flex items-center gap-2 text-[12px] shrink-0">
            <span>★ {r.rating}</span>
            {r.neg && (
              <span
                className="px-1.5 py-0 rounded text-[10px] font-semibold"
                style={{ background: '#fee2e2', color: '#b91c1c' }}
              >
                −{r.neg}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function MockLetterDraft() {
  return (
    <div
      className="rounded-2xl border p-4"
      style={{ background: '#fff', borderColor: '#e2e8f0', color: '#0f172a' }}
    >
      <div
        className="text-[10px] font-semibold uppercase tracking-wide mb-1.5"
        style={{ color: '#64748b' }}
      >
        Кому: info@ulybka-plus.ru
      </div>
      <div
        className="text-[12px] font-semibold mb-2 pb-2 border-b"
        style={{ borderColor: '#f1f5f9' }}
      >
        Тема: Долгое ожидание клиентов — решаемо
      </div>
      <div className="text-[12px] leading-relaxed space-y-2">
        <p>Здравствуйте, Иван!</p>
        <p>
          Заметил в отзывах вашей клиники жалобу клиента: «Записала ребёнка на
          10:00, приняли в 11:20». 12 раз упоминается похожее.
        </p>
        <p>
          У нас инструмент онлайн-записи с автоматическим напоминанием за день
          и за час. Снижает простои регистратуры до 30%.
        </p>
        <p>10 минут на демо в Zoom?</p>
      </div>
    </div>
  );
}

// ============================================================================
// Compare table — обычный парсер vs SpinLid
// ============================================================================

function CompareTable() {
  const rows = [
    { f: 'Контакты компании (телефон, email)', a: true, b: true },
    { f: 'Юр.данные (ИНН, оборот)', a: 'часть', b: true },
    { f: 'Отзывы клиентов', a: 'таблица', b: true },
    { f: 'AI-анализ болей в отзывах', a: false, b: true },
    { f: 'Цитаты-доказательства под каждой болью', a: false, b: true },
    { f: 'Готовый черновик письма под боль', a: false, b: true },
    { f: 'Склейка дублей 2GIS ↔ Я.Карты', a: false, b: true },
    { f: 'ЛПР (директор) из открытых реестров', a: false, b: true },
  ];
  return (
    <section className="py-16 md:py-20">
      <div className="max-w-4xl mx-auto px-6">
        <h2
          className="font-display font-semibold tracking-tight text-2xl md:text-3xl mb-8 text-center"
          style={{ color: 'hsl(var(--text))' }}
        >
          Чем отличается от обычного парсера
        </h2>
        <div
          className="rounded-2xl border overflow-hidden"
          style={{
            background: 'hsl(var(--bg))',
            borderColor: 'hsl(var(--border))',
          }}
        >
          <div
            className="grid text-[12px] font-semibold uppercase tracking-wider"
            style={{
              gridTemplateColumns: '1.5fr 1fr 1fr',
              background: 'hsl(var(--surface))',
              color: 'hsl(var(--muted))',
            }}
          >
            <div className="px-4 py-3">Возможность</div>
            <div className="px-4 py-3 text-center">Обычный парсер</div>
            <div
              className="px-4 py-3 text-center"
              style={{
                background:
                  'linear-gradient(135deg, rgba(45,212,191,0.15), rgba(6,182,212,0.10))',
                color: '#0891b2',
              }}
            >
              SpinLid
            </div>
          </div>
          {rows.map((r, i) => (
            <div
              key={i}
              className="grid text-sm border-t"
              style={{
                gridTemplateColumns: '1.5fr 1fr 1fr',
                borderColor: 'hsl(var(--border))',
              }}
            >
              <div className="px-4 py-3" style={{ color: 'hsl(var(--text))' }}>
                {r.f}
              </div>
              <CompareCell value={r.a} />
              <div
                className="px-4 py-3 text-center"
                style={{
                  background:
                    'linear-gradient(135deg, rgba(45,212,191,0.06), rgba(6,182,212,0.04))',
                }}
              >
                <CompareCell value={r.b} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CompareCell({ value }: { value: boolean | string }) {
  if (value === true)
    return (
      <div className="px-4 py-3 text-center" style={{ color: '#10b981' }}>
        ✓
      </div>
    );
  if (value === false)
    return (
      <div className="px-4 py-3 text-center" style={{ color: 'hsl(var(--muted))' }}>
        —
      </div>
    );
  return (
    <div
      className="px-4 py-3 text-center text-[12px]"
      style={{ color: '#f59e0b' }}
    >
      {value}
    </div>
  );
}

// ============================================================================
// Killer block, FAQ, CTA, Related — компактнее
// ============================================================================

function KillerBlock({ title, body }: { title: string; body: string }) {
  return (
    <section className="py-14">
      <div className="max-w-3xl mx-auto px-6">
        <div
          className="rounded-3xl p-7 md:p-9 border"
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
              background: 'linear-gradient(135deg, #2dd4bf 0%, #06b6d4 100%)',
            }}
          >
            Фишка SpinLid
          </div>
          <h2
            className="font-display font-semibold tracking-tight text-2xl md:text-3xl mb-3"
            style={{ color: 'hsl(var(--text))' }}
          >
            {title}
          </h2>
          <p
            className="text-base md:text-lg leading-relaxed"
            style={{ color: 'hsl(var(--text))' }}
          >
            {body}
          </p>
        </div>
      </div>
    </section>
  );
}

function FaqSection({ items }: { items: FaqItem[] }) {
  return (
    <section className="py-14" style={{ background: 'hsl(var(--surface))' }}>
      <div className="max-w-3xl mx-auto px-6">
        <h2
          className="font-display font-semibold tracking-tight text-2xl md:text-3xl mb-7 text-center"
          style={{ color: 'hsl(var(--text))' }}
        >
          Частые вопросы
        </h2>
        <div className="space-y-2.5">
          {items.map((item, i) => (
            <details
              key={i}
              className="rounded-xl border px-5 py-3"
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
                className="mt-2.5 text-sm leading-relaxed"
                style={{ color: 'hsl(var(--muted))' }}
              >
                {item.a}
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section
      className="py-16"
      style={{
        background:
          'radial-gradient(700px 300px at 50% 50%, rgba(45, 212, 191, 0.2), transparent), #0b1220',
        color: '#fff',
        textAlign: 'center',
      }}
    >
      <div className="max-w-3xl mx-auto px-6">
        <h2
          className="font-display font-bold tracking-tight mb-3"
          style={{ fontSize: 'clamp(1.5rem, 3vw, 2.25rem)' }}
        >
          Готовы попробовать?
        </h2>
        <p
          className="mb-6"
          style={{
            color: 'rgba(255,255,255,0.75)',
            fontSize: '0.95rem',
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
            background: 'linear-gradient(135deg, #2dd4bf 0%, #06b6d4 100%)',
            color: '#0b1220',
            fontWeight: 600,
            fontSize: '15px',
            padding: '13px 24px',
            borderRadius: '10px',
            boxShadow: '0 12px 32px rgba(6, 182, 212, 0.4)',
          }}
        >
          Создать аккаунт →
        </Link>
      </div>
    </section>
  );
}

function CompactAuthedCta() {
  return (
    <section
      className="py-10 border-t"
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
            background: 'linear-gradient(135deg, #2dd4bf 0%, #06b6d4 100%)',
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
  );
}

function RelatedBlock({ related }: { related: RelatedLink[] }) {
  return (
    <section className="py-10 md:py-14">
      <div className="max-w-5xl mx-auto px-6">
        <h2
          className="font-display font-semibold tracking-tight text-lg md:text-xl mb-5"
          style={{ color: 'hsl(var(--text))' }}
        >
          Смежные возможности
        </h2>
        <div className="grid gap-3 md:grid-cols-3">
          {related.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-xl p-4 border transition-colors hover:border-brand-500"
              style={{
                background: 'hsl(var(--surface))',
                borderColor: 'hsl(var(--border))',
              }}
            >
              <div
                className="font-display font-semibold text-sm mb-1"
                style={{ color: 'hsl(var(--text))' }}
              >
                {link.title}
              </div>
              <div className="text-[13px]" style={{ color: 'hsl(var(--muted))' }}>
                {link.hint}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

// ============================================================================
// Header — лого + sub-nav
// ============================================================================

function SeoHeader({ isAuthed }: { isAuthed: boolean }) {
  return (
    <header
      className="border-b"
      style={{
        borderColor: 'hsl(var(--border))',
        background: 'hsl(var(--bg))',
      }}
    >
      <div className="max-w-6xl mx-auto px-6 py-3.5 flex items-center justify-between">
        <Link
          href="/"
          className="flex items-center gap-2 font-display font-bold text-lg tracking-tight"
          style={{ color: 'hsl(var(--text))' }}
        >
          <BrandMark size={32} />
          <span>SpinLid</span>
        </Link>
        <nav className="flex items-center gap-4 text-sm">
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
                className="hover:underline hidden sm:inline"
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

      <div
        style={{
          background: 'hsl(var(--surface))',
          borderTop: '1px solid hsl(var(--border))',
          borderBottom: '1px solid hsl(var(--border))',
        }}
      >
        <div
          className="max-w-6xl mx-auto px-6 py-2 flex items-center gap-1 overflow-x-auto"
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
