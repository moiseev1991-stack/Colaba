/**
 * Уникальные блоки для решенческих SEO-страниц (ТЗ КП-фокус §2.3-2.7).
 *
 * Каждый блок живёт ровно на одной странице:
 *   /parser-2gis         → TwoGisFieldsBlock     («Что достаём из карточки 2GIS»)
 *   /parser-yandex-maps  → TwoSourcesBlock        («Зачем второй источник»)
 *   /baza-klientov       → BaseRowFieldsBlock     («Что в каждой строке базы»)
 *   /sbor-kontaktov      → ContactsSourcesBlock   («Откуда берём контакты»)
 *   /holodnaya-rassylka  → MailHygieneBlock       («Гигиена рассылок»)
 *
 * Все блоки используют одну стилистическую обёртку SeoSection,
 * чтобы выглядеть как часть Shell'а (фон, отступы, типографика).
 */

import {
  AtSign,
  Building2,
  Database,
  FileText,
  Globe,
  Hash,
  MapPin,
  Phone,
  Shield,
  ShieldCheck,
  Sparkles,
  Star,
  Tag,
  type LucideIcon,
} from 'lucide-react';

function SeoSection({
  label,
  title,
  description,
  children,
  bg,
}: {
  label?: string;
  title: string;
  description?: string;
  children: React.ReactNode;
  bg?: 'surface' | 'default';
}) {
  return (
    <section
      className="py-14 md:py-20"
      style={bg === 'surface' ? { background: 'hsl(var(--surface))' } : undefined}
    >
      <div className="max-w-5xl mx-auto px-6">
        {label && (
          <div
            className="text-center text-xs font-semibold uppercase tracking-widest mb-3"
            style={{ color: 'hsl(var(--muted))' }}
          >
            {label}
          </div>
        )}
        <h2
          className="font-display font-semibold tracking-tight text-2xl md:text-3xl mb-3 text-center"
          style={{ color: 'hsl(var(--text))' }}
        >
          {title}
        </h2>
        {description && (
          <p
            className="text-center text-sm md:text-base mb-10 max-w-2xl mx-auto"
            style={{ color: 'hsl(var(--muted))' }}
          >
            {description}
          </p>
        )}
        {children}
      </div>
    </section>
  );
}

// ============================================================================
// /parser-2gis — «Что достаём из карточки 2GIS»
// ============================================================================

const TWO_GIS_FIELDS: { Icon: LucideIcon; label: string; hint: string; fill: string }[] = [
  { Icon: Building2, label: 'Название', hint: 'Юр.лицо и публичное имя', fill: '~100%' },
  { Icon: Tag, label: 'Рубрика', hint: 'Из дерева 2GIS', fill: '~100%' },
  { Icon: MapPin, label: 'Адрес', hint: 'Координаты + почтовый', fill: '~98%' },
  { Icon: Phone, label: 'Телефон', hint: 'С карточки 2GIS', fill: '~80%' },
  { Icon: Globe, label: 'Сайт', hint: 'Ссылка, если указана', fill: '~55%' },
  { Icon: AtSign, label: 'Email с сайта', hint: 'Краулер /contacts /about', fill: '~40%' },
  { Icon: Star, label: 'Рейтинг + отзывов', hint: 'Свежее число', fill: '~100%' },
  { Icon: Sparkles, label: 'Pain-теги из отзывов', hint: 'AI-анализ', fill: 'Эксклюзив' },
];

export function TwoGisFieldsBlock() {
  return (
    <SeoSection
      bg="surface"
      label="Полнота карточек 2GIS"
      title="Что достаём из карточки 2GIS"
      description="Карточка 2GIS отдаёт 7 базовых полей и список отзывов. SpinLid дополнительно тянет email с сайта и через AI выделяет повторяющиеся жалобы клиентов — этого нет в карточке, но это и есть основа письма."
    >
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        {TWO_GIS_FIELDS.map(({ Icon, label, hint, fill }) => (
          <div
            key={label}
            className="rounded-xl border p-4"
            style={{
              background: 'hsl(var(--bg))',
              borderColor: 'hsl(var(--border))',
            }}
          >
            <div className="flex items-center gap-2 mb-1.5">
              <Icon size={16} strokeWidth={2.2} color="#0891b2" />
              <div
                className="font-display font-semibold text-sm"
                style={{ color: 'hsl(var(--text))' }}
              >
                {label}
              </div>
            </div>
            <div
              className="text-[12px] leading-snug mb-2"
              style={{ color: 'hsl(var(--muted))' }}
            >
              {hint}
            </div>
            <div
              className="inline-block text-[11px] font-semibold px-2 py-0.5 rounded"
              style={{
                background:
                  fill === 'Эксклюзив'
                    ? 'rgba(45,212,191,0.15)'
                    : 'rgba(8,145,178,0.10)',
                color: fill === 'Эксклюзив' ? '#0d9488' : '#0891b2',
              }}
            >
              {fill}
            </div>
          </div>
        ))}
      </div>
      <p
        className="mt-6 text-center text-[12px]"
        style={{ color: 'hsl(var(--muted))' }}
      >
        Краулер сайта работает через Playwright — берём страницы /contacts,
        /about, /team. Если у компании нет сайта — телефон с 2GIS остаётся
        главным контактом.
      </p>
    </SeoSection>
  );
}

// ============================================================================
// /parser-yandex-maps — «Зачем второй источник»
// ============================================================================

export function TwoSourcesBlock() {
  return (
    <SeoSection
      label="Покрытие 2GIS и Яндекс.Карт"
      title="Зачем второй источник, если есть 2GIS"
      description="В Москве и Питере покрытие у 2GIS и Я.Карт примерно равное, но 30-40% карточек уникальны для одного из источников. В регионах разница больше. Брать только один — терять рынок и слать одной компании письмо дважды."
    >
      <div className="grid gap-4 md:grid-cols-3 items-stretch">
        {/* Левый круг: 2GIS */}
        <div
          className="rounded-2xl border p-5 text-center"
          style={{
            background: 'rgba(25,193,41,0.05)',
            borderColor: 'rgba(25,193,41,0.30)',
          }}
        >
          <div
            className="inline-flex items-center justify-center w-12 h-12 rounded-full mx-auto mb-3"
            style={{ background: 'rgba(25,193,41,0.15)' }}
          >
            <MapPin size={22} color="#19c129" />
          </div>
          <div
            className="font-display font-semibold mb-1"
            style={{ color: 'hsl(var(--text))' }}
          >
            Только 2GIS
          </div>
          <div className="text-[13px]" style={{ color: 'hsl(var(--muted))' }}>
            Сильнее в Поволжье, Сибири, на Урале. Полная база автосервисов
            и строительных компаний.
          </div>
        </div>

        {/* Центр: пересечение */}
        <div
          className="rounded-2xl border-2 p-5 text-center"
          style={{
            background:
              'linear-gradient(135deg, rgba(45,212,191,0.10), rgba(6,182,212,0.05))',
            borderColor: 'rgba(45,212,191,0.45)',
          }}
        >
          <div
            className="inline-flex items-center justify-center w-12 h-12 rounded-full mx-auto mb-3"
            style={{ background: 'rgba(6,182,212,0.18)' }}
          >
            <Sparkles size={22} color="#0891b2" />
          </div>
          <div
            className="font-display font-semibold mb-1"
            style={{ color: 'hsl(var(--text))' }}
          >
            2GIS ∪ Я.Карты − дубли
          </div>
          <div className="text-[13px]" style={{ color: 'hsl(var(--muted))' }}>
            Полная картина ниши + одна компания = одно письмо. Склейка
            дублей по телефону, домену сайта и адресу.
          </div>
        </div>

        {/* Правый круг: Я.Карты */}
        <div
          className="rounded-2xl border p-5 text-center"
          style={{
            background: 'rgba(255,204,0,0.05)',
            borderColor: 'rgba(255,204,0,0.45)',
          }}
        >
          <div
            className="inline-flex items-center justify-center w-12 h-12 rounded-full mx-auto mb-3"
            style={{ background: 'rgba(255,204,0,0.20)' }}
          >
            <MapPin size={22} color="#d97706" />
          </div>
          <div
            className="font-display font-semibold mb-1"
            style={{ color: 'hsl(var(--text))' }}
          >
            Только Я.Карты
          </div>
          <div className="text-[13px]" style={{ color: 'hsl(var(--muted))' }}>
            Сильнее в Москве, Питере, столичных областных центрах. Полная
            база общепита и услуг для частных лиц.
          </div>
        </div>
      </div>
      <p
        className="mt-6 text-center text-[12px]"
        style={{ color: 'hsl(var(--muted))' }}
      >
        В SpinLid склейка дублей встроена. Видите ровно одну строку на
        компанию, даже если она есть на обоих источниках.
      </p>
    </SeoSection>
  );
}

// ============================================================================
// /baza-klientov — «Что в каждой строке базы»
// ============================================================================

const BASE_ROW_COLUMNS: { Icon: LucideIcon; label: string; hint: string }[] = [
  { Icon: Building2, label: 'Название', hint: 'Публичное имя + юр.лицо из DaData' },
  { Icon: Hash, label: 'ИНН и ОГРН', hint: 'Через DaData по названию и адресу' },
  { Icon: MapPin, label: 'Адрес', hint: 'Юр. + фактический, координаты' },
  { Icon: Phone, label: 'Телефон', hint: '2GIS + сайт, нормализованный формат' },
  { Icon: AtSign, label: 'Email', hint: 'Краулер /contacts, /team' },
  { Icon: Globe, label: 'Сайт + домен', hint: 'Прямая ссылка, домен отдельно' },
  { Icon: Star, label: 'Рейтинг и отзывы', hint: '2GIS и Я.Карты раздельно + средний' },
  { Icon: Sparkles, label: 'Pain-теги', hint: 'Топ-3 жалоб клиентов с цитатами' },
  { Icon: Tag, label: 'Рубрика', hint: 'Из дерева 2GIS / Я.Карт' },
  { Icon: ShieldCheck, label: 'ЛПР', hint: 'Директор по ИНН из DaData' },
  { Icon: Database, label: 'Возраст компании', hint: 'Дата регистрации в ЕГРЮЛ' },
  { Icon: Sparkles, label: 'Температура лида', hint: 'AI-оценка готовности купить 0-100' },
];

export function BaseRowFieldsBlock() {
  return (
    <SeoSection
      bg="surface"
      label="Колонки выгрузки"
      title="Что в каждой строке базы"
      description="Не «название + телефон + сайт» как в .xlsx за 5 000 ₽, а 12 нормализованных полей плюс эксклюзивные SpinLid: pain-теги клиентов из отзывов и AI-оценка температуры лида."
    >
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {BASE_ROW_COLUMNS.map(({ Icon, label, hint }) => (
          <div
            key={label}
            className="flex items-start gap-3 rounded-xl border p-3.5"
            style={{
              background: 'hsl(var(--bg))',
              borderColor: 'hsl(var(--border))',
            }}
          >
            <div
              className="flex items-center justify-center w-9 h-9 shrink-0 rounded-lg"
              style={{ background: 'rgba(6,182,212,0.10)' }}
            >
              <Icon size={16} color="#0891b2" />
            </div>
            <div className="min-w-0">
              <div
                className="font-display font-semibold text-sm"
                style={{ color: 'hsl(var(--text))' }}
              >
                {label}
              </div>
              <div
                className="text-[12px] leading-snug mt-0.5"
                style={{ color: 'hsl(var(--muted))' }}
              >
                {hint}
              </div>
            </div>
          </div>
        ))}
      </div>
      <p
        className="mt-6 text-center text-[12px]"
        style={{ color: 'hsl(var(--muted))' }}
      >
        Выгрузка — .xlsx с двумя вкладками: «Лиды» (все поля) и «Производство
        сайта» (контакты + ЛПР для веб-студий). Или CSV для импорта в CRM.
      </p>
    </SeoSection>
  );
}

// ============================================================================
// /sbor-kontaktov — «Откуда берём контакты» + «Нормализация»
// ============================================================================

const CONTACT_SOURCES: { source: string; gives: string; fill: string; color: string; Icon: LucideIcon }[] = [
  { source: 'Карточка 2GIS / Я.Карт', gives: 'Телефон, иногда email', fill: '~80% телефонов', color: '#0891b2', Icon: MapPin },
  { source: 'Сайт компании (краулер)', gives: 'Email c /contacts /about, телефоны', fill: '~50% email', color: '#a855f7', Icon: Globe },
  { source: 'DaData по ИНН', gives: 'ФИО директора, юр.лицо', fill: '~70% юр.лиц', color: '#2563eb', Icon: ShieldCheck },
];

export function ContactsSourcesBlock() {
  return (
    <SeoSection
      label="3 канала сбора"
      title="Откуда берём контакты"
      description="Не один краулер, а три параллельных канала с разной полнотой. У каждой компании в выгрузке вы видите, из какого канала пришёл контакт — чтобы понимать, что писать и кому."
    >
      <div className="grid gap-4 md:grid-cols-3">
        {CONTACT_SOURCES.map(({ source, gives, fill, color, Icon }) => (
          <div
            key={source}
            className="rounded-2xl border p-5"
            style={{
              background: 'hsl(var(--bg))',
              borderColor: 'hsl(var(--border))',
            }}
          >
            <div
              className="inline-flex items-center justify-center w-11 h-11 rounded-xl mb-3"
              style={{ background: `${color}1f`, border: `1px solid ${color}55` }}
            >
              <Icon size={22} color={color} />
            </div>
            <div
              className="font-display font-semibold text-sm mb-1"
              style={{ color: 'hsl(var(--text))' }}
            >
              {source}
            </div>
            <div
              className="text-[12.5px] leading-snug mb-3"
              style={{ color: 'hsl(var(--muted))' }}
            >
              {gives}
            </div>
            <div
              className="inline-block text-[11px] font-semibold px-2 py-0.5 rounded"
              style={{ background: `${color}1a`, color }}
            >
              {fill}
            </div>
          </div>
        ))}
      </div>

      <div
        className="mt-10 rounded-2xl border p-6"
        style={{
          background: 'hsl(var(--surface))',
          borderColor: 'hsl(var(--border))',
        }}
      >
        <div
          className="text-[11px] font-semibold uppercase tracking-widest mb-2"
          style={{ color: '#0891b2' }}
        >
          Нормализация
        </div>
        <div
          className="font-display font-semibold text-lg mb-3"
          style={{ color: 'hsl(var(--text))' }}
        >
          Чистка перед тем как отдать в рассылку
        </div>
        <ul
          className="space-y-1.5 text-sm leading-relaxed list-disc pl-5"
          style={{ color: 'hsl(var(--text))' }}
        >
          <li>Телефоны — к +7 (XXX) XXX-XX-XX, мобильные и городские отдельно.</li>
          <li>Email — lower-case + отсев дублей info@/sales@/contact@ если есть личный.</li>
          <li>Проверка MX-записи домена email перед запуском кампании.</li>
          <li>Blacklist собственных доменов и конкурентов — не уйдут случайно в рассылку.</li>
        </ul>
      </div>
    </SeoSection>
  );
}

// ============================================================================
// /holodnaya-rassylka — «Гигиена рассылок»
// ============================================================================

const HYGIENE_ITEMS: { Icon: LucideIcon; title: string; body: string }[] = [
  {
    Icon: Sparkles,
    title: 'Расписание без всплесков',
    body: 'Письма уходят равномерно в течение дня (не «1000 за 5 минут»), почтовые провайдеры не считают это спам-залпом.',
  },
  {
    Icon: AtSign,
    title: 'Отписка одной кнопкой',
    body: 'Ссылка отписки в подвале каждого письма, клик мгновенно блокирует адрес. Не нужно отвечать «STOP» — это снижает жалобы.',
  },
  {
    Icon: Shield,
    title: 'Автоматический blacklist',
    body: 'Hard bounce и жалобы на спам → адрес автоматом в чёрный список. На него больше никогда не уйдёт письмо ни в одной кампании.',
  },
  {
    Icon: ShieldCheck,
    title: 'Catch-all для ответов',
    body: 'Все ответы (включая автоматические «Out of office») собираются в один ящик через catch-all. Не нужно следить за рассылочным адресом.',
  },
  {
    Icon: FileText,
    title: 'SPF / DKIM / DMARC',
    body: 'У всех рассылочных доменов настроены подписи DKIM и DMARC-политика. Провайдеры видят: письмо от того, за кого себя выдаёт.',
  },
  {
    Icon: Phone,
    title: 'Прогретые отправители',
    body: 'Используем доменные пары с историей рассылок, чтобы первое же сообщение не уходило в спам. На холодном домене — медленный прогрев.',
  },
];

export function MailHygieneBlock() {
  return (
    <SeoSection
      bg="surface"
      label="Антиспам и репутация"
      title="Гигиена рассылок"
      description="Холодные рассылки боятся не «забанят» — а медленного протухания репутации домена. SpinLid держит шесть базовых правил, которые суммарно снимают почти все стандартные риски."
    >
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {HYGIENE_ITEMS.map(({ Icon, title, body }) => (
          <div
            key={title}
            className="rounded-2xl border p-5"
            style={{
              background: 'hsl(var(--bg))',
              borderColor: 'hsl(var(--border))',
            }}
          >
            <div
              className="inline-flex items-center justify-center w-10 h-10 rounded-xl mb-3"
              style={{
                background:
                  'linear-gradient(135deg, rgba(16,185,129,0.18), rgba(6,182,212,0.14))',
                border: '1px solid rgba(16,185,129,0.30)',
              }}
            >
              <Icon size={20} color="#0b1220" />
            </div>
            <div
              className="font-display font-semibold text-sm mb-1.5"
              style={{ color: 'hsl(var(--text))' }}
            >
              {title}
            </div>
            <div
              className="text-[12.5px] leading-relaxed"
              style={{ color: 'hsl(var(--muted))' }}
            >
              {body}
            </div>
          </div>
        ))}
      </div>
      <p
        className="mt-6 text-center text-[12px]"
        style={{ color: 'hsl(var(--muted))' }}
      >
        Это не «гарантия 100% inbox» — гарантии в email невозможны. Это
        набор практик, которые работают совместно с персонализацией под
        боль клиента и снижают жалобы до уровня прогретой транзакционной
        рассылки.
      </p>
    </SeoSection>
  );
}
