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

import Link from 'next/link';
import {
  AtSign,
  BookOpen,
  Building2,
  CheckCircle2,
  Clock,
  Database,
  FileText,
  Filter,
  Globe,
  Hash,
  MailCheck,
  MapPin,
  MessageSquare,
  Phone,
  PhoneCall,
  Quote,
  Search,
  Send,
  Shield,
  ShieldCheck,
  Sparkles,
  Star,
  Tag,
  User,
  Users,
  XCircle,
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

// ============================================================================
// /lidogeneraciya — «4 этапа лидогенерации»
// ============================================================================

const LIDGEN_STAGES: { Icon: LucideIcon; step: string; title: string; body: string }[] = [
  {
    Icon: Search,
    step: '01',
    title: 'Сбор',
    body: 'Парсим компании из 2GIS, Яндекс.Карт и Google Maps по нише и городу. На выходе — список организаций с телефонами, сайтами и рейтингами.',
  },
  {
    Icon: Filter,
    step: '02',
    title: 'Квалификация',
    body: 'Отсеиваем нецелевые: без сайта, закрытые, слишком крупные или мелкие. AI оценивает температуру лида 0-100 — насколько компания готова купить.',
  },
  {
    Icon: Sparkles,
    step: '03',
    title: 'Персонализация',
    body: 'По каждой компании разбираем отзывы и выделяем боли клиентов. Эти боли ложатся в письмо как зацепка — не «предлагаем CRM», а «вижу жалобы на долгое ожидание».',
  },
  {
    Icon: Send,
    step: '04',
    title: 'Касание',
    body: 'Встроенная рассылка с подстановкой болей в шаблон. Статусы доставки, открытий и ответов — сразу видно, какие лиды прогрелись.',
  },
];

export function LidgenFunnelBlock() {
  return (
    <SeoSection
      bg="surface"
      label="Как устроена лидогенерация"
      title="4 этапа: от списка компаний до тёплого лида"
      description="Лидогенерация — это не «купить базу и разослать всем одно письмо». Это воронка: собрать, отсеять, персонализировать под боль, коснуться. SpinLid проходит все четыре этапа в одном окне."
    >
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {LIDGEN_STAGES.map(({ Icon, step, title, body }) => (
          <div
            key={step}
            className="relative rounded-2xl border p-5"
            style={{
              background: 'hsl(var(--bg))',
              borderColor: 'hsl(var(--border))',
            }}
          >
            <div
              className="absolute top-4 right-4 font-display font-bold text-2xl"
              style={{ color: 'hsl(var(--border))' }}
            >
              {step}
            </div>
            <div
              className="inline-flex items-center justify-center w-11 h-11 rounded-xl mb-3"
              style={{ background: 'rgba(6,182,212,0.10)', border: '1px solid rgba(6,182,212,0.30)' }}
            >
              <Icon size={22} color="#0891b2" />
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
        Разница между «холодной базой» и «лидогенерацией» — именно в этапах
        2-3. Список без квалификации и персонализации даёт отклик 0.5-1%.
        Тот же список с болями клиентов — в разы выше.
      </p>
    </SeoSection>
  );
}

// ============================================================================
// /kupit-bazu-klientov — «Купленная база vs свежая под нишу»
// ============================================================================

const BUY_BASE_BAD: string[] = [
  'Собрана год-два назад: до 30% телефонов уже не отвечают, компании закрылись.',
  'Продана десяткам покупателей — по этим контактам уже прошлись конкуренты.',
  'Один формат «название + телефон». Ни ЛПР, ни email, ни повода написать.',
  'Вся ниша по стране в одном файле — 90% контактов вам не подходят.',
  'Нельзя проверить, откуда данные и согласны ли люди на обработку (152-ФЗ).',
];

const BUY_BASE_GOOD: string[] = [
  'Собирается в момент запроса: телефоны и сайты актуальны на сегодня.',
  'Эксклюзивна — вы задаёте нишу и город, база собирается под вас.',
  'Телефон, email, сайт, ЛПР, рейтинг и боли клиентов из отзывов в каждой строке.',
  'Точный срез: только ваша ниша, только нужные города.',
  'Только публичные карточки организаций, прозрачный источник данных.',
];

export function BuyBaseComparisonBlock() {
  return (
    <SeoSection
      bg="surface"
      label="Почему готовая база не работает"
      title="Купить базу .xlsx или собрать свежую под нишу"
      description="«База клиентов купить» обычно означает файл, собранный когда-то и проданный всем подряд. SpinLid даёт другое: базу, которая собирается в момент запроса под вашу нишу и город — с контактами, ЛПР и болями клиентов."
    >
      <div className="grid gap-4 md:grid-cols-2 items-start">
        {/* Плохо: готовый файл */}
        <div
          className="rounded-2xl border p-6"
          style={{ background: 'rgba(239,68,68,0.04)', borderColor: 'rgba(239,68,68,0.25)' }}
        >
          <div className="flex items-center gap-2 mb-4">
            <XCircle size={20} color="#ef4444" />
            <div className="font-display font-semibold" style={{ color: 'hsl(var(--text))' }}>
              Готовая база за 3 000-15 000 ₽
            </div>
          </div>
          <ul className="space-y-2.5">
            {BUY_BASE_BAD.map((t) => (
              <li key={t} className="flex items-start gap-2 text-[13px] leading-snug" style={{ color: 'hsl(var(--muted))' }}>
                <XCircle size={15} color="#ef4444" className="shrink-0 mt-0.5" />
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Хорошо: свежая под нишу */}
        <div
          className="rounded-2xl border-2 p-6"
          style={{
            background: 'linear-gradient(135deg, rgba(45,212,191,0.08), rgba(6,182,212,0.04))',
            borderColor: 'rgba(45,212,191,0.45)',
          }}
        >
          <div className="flex items-center gap-2 mb-4">
            <CheckCircle2 size={20} color="#0d9488" />
            <div className="font-display font-semibold" style={{ color: 'hsl(var(--text))' }}>
              Свежая база в SpinLid
            </div>
          </div>
          <ul className="space-y-2.5">
            {BUY_BASE_GOOD.map((t) => (
              <li key={t} className="flex items-start gap-2 text-[13px] leading-snug" style={{ color: 'hsl(var(--text))' }}>
                <CheckCircle2 size={15} color="#0d9488" className="shrink-0 mt-0.5" />
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <p className="mt-6 text-center text-[12px]" style={{ color: 'hsl(var(--muted))' }}>
        Оплачиваете не «файл», а доступ к сбору: запускаете поиск столько раз,
        сколько нужно, и всегда получаете актуальный срез ниши.
      </p>
    </SeoSection>
  );
}

// ============================================================================
// /baza-dlya-obzvona — «Что в базе для обзвона»
// ============================================================================

const CALL_BASE_FIELDS: { Icon: LucideIcon; label: string; hint: string }[] = [
  { Icon: PhoneCall, label: 'Телефон в едином формате', hint: '+7 (XXX) XXX-XX-XX, мобильные и городские раздельно — можно грузить в любой автодозвон.' },
  { Icon: User, label: 'ЛПР по имени', hint: 'Директор из ЕГРЮЛ по ИНН — чтобы просить не «кого-нибудь», а конкретного человека.' },
  { Icon: Quote, label: 'Зацепка из отзыва', hint: 'Готовая фраза на первые 10 секунд: «видел жалобы на долгое ожидание — как раз по этому звоню».' },
  { Icon: Building2, label: 'Ниша и размер', hint: 'Рубрика, рейтинг, число отзывов — понятно, крупный это игрок или частник.' },
  { Icon: Clock, label: 'Часовой пояс города', hint: 'Чтобы не звонить в Владивосток в 7 утра по Москве.' },
  { Icon: Globe, label: 'Сайт и email', hint: 'Не дозвонились — отправляете КП на почту прямо из карточки.' },
];

export function CallBaseBlock() {
  return (
    <SeoSection
      bg="surface"
      label="Заточено под холодный обзвон"
      title="Что в базе для обзвона, кроме телефонов"
      description="Список телефонов — это ещё не база для обзвона. Оператору нужно знать, кого спросить и с чего начать разговор. SpinLid кладёт в каждую строку имя ЛПР и готовую зацепку из отзывов клиентов."
    >
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {CALL_BASE_FIELDS.map(({ Icon, label, hint }) => (
          <div
            key={label}
            className="flex items-start gap-3 rounded-xl border p-3.5"
            style={{ background: 'hsl(var(--bg))', borderColor: 'hsl(var(--border))' }}
          >
            <div
              className="flex items-center justify-center w-9 h-9 shrink-0 rounded-lg"
              style={{ background: 'rgba(6,182,212,0.10)' }}
            >
              <Icon size={16} color="#0891b2" />
            </div>
            <div className="min-w-0">
              <div className="font-display font-semibold text-sm" style={{ color: 'hsl(var(--text))' }}>
                {label}
              </div>
              <div className="text-[12px] leading-snug mt-0.5" style={{ color: 'hsl(var(--muted))' }}>
                {hint}
              </div>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-6 text-center text-[12px]" style={{ color: 'hsl(var(--muted))' }}>
        Выгрузка в Excel или CSV — грузится в любую CRM или сервис автодозвона.
        Скрипт с зацепкой из отзыва повышает доходимость до разговора с ЛПР.
      </p>
    </SeoSection>
  );
}

// ============================================================================
// /parser-email — «Откуда берём email + валидация»
// ============================================================================

const EMAIL_SOURCES: { Icon: LucideIcon; label: string; hint: string; color: string }[] = [
  { Icon: Globe, label: 'Страницы сайта', hint: 'Краулер обходит /contacts, /about, /team, подвал — там, где компании публикуют почту.', color: '#a855f7' },
  { Icon: MapPin, label: 'Карточки 2GIS / Я.Карт', hint: 'Если email указан в карточке организации — забираем оттуда.', color: '#0891b2' },
  { Icon: FileText, label: 'Страницы контактов и оферты', hint: 'Юр. email часто лежит в реквизитах и договоре-оферте на сайте.', color: '#2563eb' },
];

const EMAIL_VALIDATION: { Icon: LucideIcon; title: string; body: string }[] = [
  { Icon: MailCheck, title: 'Синтаксис и MX', body: 'Проверяем формат адреса и наличие MX-записи у домена — мёртвые ящики отсеиваются до рассылки.' },
  { Icon: Filter, title: 'Дедуп и приоритет', body: 'Убираем дубли, при наличии личного адреса не тащим общий info@ — письмо доходит до человека.' },
  { Icon: Shield, title: 'Blacklist', body: 'Свои домены и конкурентов в чёрный список — не уйдут в рассылку случайно.' },
];

export function EmailParserBlock() {
  return (
    <SeoSection
      bg="surface"
      label="Сбор и чистка email"
      title="Откуда парсим email и как проверяем"
      description="Парсер email в SpinLid — это не только «вытащить адрес со страницы». Это три источника плюс валидация: адрес проверяется на живость до того, как по нему уйдёт письмо."
    >
      <div className="grid gap-4 md:grid-cols-3 mb-8">
        {EMAIL_SOURCES.map(({ Icon, label, hint, color }) => (
          <div
            key={label}
            className="rounded-2xl border p-5"
            style={{ background: 'hsl(var(--bg))', borderColor: 'hsl(var(--border))' }}
          >
            <div
              className="inline-flex items-center justify-center w-11 h-11 rounded-xl mb-3"
              style={{ background: `${color}1f`, border: `1px solid ${color}55` }}
            >
              <Icon size={22} color={color} />
            </div>
            <div className="font-display font-semibold text-sm mb-1" style={{ color: 'hsl(var(--text))' }}>
              {label}
            </div>
            <div className="text-[12.5px] leading-snug" style={{ color: 'hsl(var(--muted))' }}>
              {hint}
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {EMAIL_VALIDATION.map(({ Icon, title, body }) => (
          <div
            key={title}
            className="rounded-xl border p-4"
            style={{ background: 'hsl(var(--surface))', borderColor: 'hsl(var(--border))' }}
          >
            <div className="flex items-center gap-2 mb-1.5">
              <Icon size={16} color="#0d9488" />
              <div className="font-display font-semibold text-sm" style={{ color: 'hsl(var(--text))' }}>
                {title}
              </div>
            </div>
            <div className="text-[12px] leading-snug" style={{ color: 'hsl(var(--muted))' }}>
              {body}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-6 text-center text-[12px]" style={{ color: 'hsl(var(--muted))' }}>
        Email привязан к компании вместе с телефоном, сайтом и болями клиентов —
        не «голый список адресов», а контакт с контекстом для письма.
      </p>
    </SeoSection>
  );
}

// ============================================================================
// /parser-google-maps — «Google Maps как третий источник»
// ============================================================================

const GMAPS_ADDS: { Icon: LucideIcon; title: string; body: string }[] = [
  { Icon: Star, title: 'Отзывы и рейтинг Google', body: 'Отдельный пласт отзывов, которого нет в 2GIS и Я.Картах — больше сырья для анализа болей.' },
  { Icon: Building2, title: 'Сети и франшизы', body: 'Крупные сети и международные бренды часто полнее представлены именно в Google Maps.' },
  { Icon: Globe, title: 'Сайт и телефон', body: 'Тот же набор контактов: сайт, телефон, адрес, категория — в едином формате с другими источниками.' },
  { Icon: Sparkles, title: 'Склейка дублей', body: 'Одна компания из Google, 2GIS и Я.Карт схлопывается в одну строку по домену, телефону и адресу.' },
];

export function GoogleMapsBlock() {
  return (
    <SeoSection
      bg="surface"
      label="Третий источник данных"
      title="Что добавляет Google Maps к 2GIS и Яндекс.Картам"
      description="Google Maps — третий источник в SpinLid. Он не заменяет 2GIS и Яндекс.Карты, а дополняет: свой пласт отзывов, полнее по сетям и брендам. Дубли между источниками склеиваются автоматически."
    >
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {GMAPS_ADDS.map(({ Icon, title, body }) => (
          <div
            key={title}
            className="rounded-2xl border p-5"
            style={{ background: 'hsl(var(--bg))', borderColor: 'hsl(var(--border))' }}
          >
            <div
              className="inline-flex items-center justify-center w-11 h-11 rounded-xl mb-3"
              style={{ background: 'rgba(66,133,244,0.12)', border: '1px solid rgba(66,133,244,0.35)' }}
            >
              <Icon size={22} color="#4285f4" />
            </div>
            <div className="font-display font-semibold text-sm mb-1.5" style={{ color: 'hsl(var(--text))' }}>
              {title}
            </div>
            <div className="text-[12.5px] leading-relaxed" style={{ color: 'hsl(var(--muted))' }}>
              {body}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-6 text-center text-[12px]" style={{ color: 'hsl(var(--muted))' }}>
        Можно включить любой набор источников: только Google Maps, только карты
        РФ или все три сразу. Одна компания — одна строка в выгрузке.
      </p>
    </SeoSection>
  );
}

// ============================================================================
// /parser-telegram — «Что даёт Telegram-источник»
// ============================================================================

const TELEGRAM_FIELDS: { Icon: LucideIcon; label: string; hint: string }[] = [
  { Icon: MessageSquare, label: 'Канал и чат компании', hint: 'Публичные каналы и чаты организации — актуальный способ связи, часто быстрее почты.' },
  { Icon: User, label: 'Контакт ЛПР', hint: 'Публичный username представителя или менеджера, если он указан в контактах.' },
  { Icon: Hash, label: 'Ссылки t.me', hint: 'Прямые ссылки на канал/бота компании из карточек и сайтов — в одном месте.' },
  { Icon: Users, label: 'Активность', hint: 'Есть ли живой канал — сигнал, что компания на связи именно в Telegram.' },
];

export function TelegramParserBlock() {
  return (
    <SeoSection
      bg="surface"
      label="Telegram как канал связи"
      title="Что достаём из Telegram"
      description="Всё больше компаний в РФ отвечают быстрее в Telegram, чем на почте. SpinLid при поиске ЛПР подтягивает публичные Telegram-контакты компании — как ещё один канал для касания."
    >
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        {TELEGRAM_FIELDS.map(({ Icon, label, hint }) => (
          <div
            key={label}
            className="rounded-xl border p-4"
            style={{ background: 'hsl(var(--bg))', borderColor: 'hsl(var(--border))' }}
          >
            <div className="flex items-center gap-2 mb-1.5">
              <Icon size={16} color="#229ed9" />
              <div className="font-display font-semibold text-sm" style={{ color: 'hsl(var(--text))' }}>
                {label}
              </div>
            </div>
            <div className="text-[12px] leading-snug" style={{ color: 'hsl(var(--muted))' }}>
              {hint}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-6 text-center text-[12px]" style={{ color: 'hsl(var(--muted))' }}>
        Работаем только с публичными данными: открытые каналы, контакты,
        указанные компанией. Никакого доступа к личной переписке.
      </p>
    </SeoSection>
  );
}

// ============================================================================
// /baza-znaniy — глоссарий терминов лидогенерации
// ============================================================================

const GLOSSARY_TERMS: { term: string; anchor: string; body: string; link?: { href: string; label: string } }[] = [
  {
    term: 'Лидогенерация',
    anchor: 'lidogeneraciya',
    body: 'Процесс привлечения потенциальных клиентов (лидов) и доведения их до контакта. В B2B — это воронка: собрать компании, отсеять нецелевые, персонализировать обращение и коснуться (письмо, звонок).',
    link: { href: '/lidogeneraciya', label: 'Как устроена лидогенерация' },
  },
  {
    term: 'Лид',
    anchor: 'lid',
    body: 'Компания или человек, который потенциально может стать клиентом. «Холодный» лид ещё не знает о вас, «тёплый» уже проявил интерес. Квалификация делит лиды на целевые и нецелевые.',
  },
  {
    term: 'База клиентов',
    anchor: 'baza-klientov',
    body: 'Структурированный список компаний с контактами и данными для продаж. Качественная база — это не «название + телефон», а нормализованные контакты, ЛПР, юр.данные и повод для обращения.',
    link: { href: '/baza-klientov', label: 'База клиентов под нишу' },
  },
  {
    term: 'Холодная база',
    anchor: 'holodnaya-baza',
    body: 'Список компаний, которые ещё не контактировали с вами. В отличие от тёплой базы (лиды с сайта, входящие заявки), по холодной базе идёт исходящая рассылка или обзвон.',
    link: { href: '/kupit-bazu-klientov', label: 'Свежая база вместо купленной' },
  },
  {
    term: 'Холодная рассылка',
    anchor: 'holodnaya-rassylka',
    body: 'Email- или мессенджер-рассылка по компаниям, которые вас не ждут. Работает, когда письмо персонализировано под боль конкретной компании, а не отправлено всем одинаковым шаблоном.',
    link: { href: '/holodnaya-rassylka', label: 'Как делать холодную рассылку' },
  },
  {
    term: 'ЛПР',
    anchor: 'lpr',
    body: 'Лицо, принимающее решение — человек, который реально утверждает покупку (директор, собственник, руководитель отдела). Письмо секретарю почти всегда упирается в «пришлите на info@».',
  },
  {
    term: 'Парсинг',
    anchor: 'parsing',
    body: 'Автоматический сбор данных из открытых источников — карточек 2GIS, Яндекс.Карт, Google Maps, сайтов. Заменяет ручное копирование названий, телефонов и сайтов в таблицу.',
    link: { href: '/parser-2gis', label: 'Парсер 2GIS' },
  },
  {
    term: 'Боли клиентов (pain-теги)',
    anchor: 'pain-tags',
    body: 'Повторяющиеся жалобы клиентов из отзывов, сгруппированные AI: «долгое ожидание», «непрозрачные цены». Дают конкретный повод для письма вместо абстрактного «предлагаем услуги».',
    link: { href: '/parsing-otzyvov', label: 'AI-анализ отзывов' },
  },
  {
    term: 'Обогащение данных',
    anchor: 'enrichment',
    body: 'Дополнение базовой записи о компании данными из других источников: ИНН и ОГРН по названию, ФИО директора из ЕГРЮЛ, email с сайта. Превращает «строку из карты» в полноценную карточку лида.',
    link: { href: '/sbor-kontaktov', label: 'Сбор контактов' },
  },
  {
    term: 'CAC',
    anchor: 'cac',
    body: 'Customer Acquisition Cost — стоимость привлечения одного клиента: все затраты на маркетинг и продажи, делённые на число новых клиентов. Холодный outreach снижает CAC за счёт отсутствия платы за клики.',
  },
];

export function GlossaryBlock() {
  return (
    <SeoSection
      label="Термины простыми словами"
      title="Словарь лидогенерации"
      description="Короткие определения ключевых понятий B2B-лидогенерации: лид, база клиентов, ЛПР, парсинг, боли клиентов. Без воды — и со ссылками на страницы, где показано, как это работает в SpinLid."
    >
      <div className="grid gap-4 md:grid-cols-2">
        {GLOSSARY_TERMS.map(({ term, anchor, body, link }) => (
          <div
            key={anchor}
            id={anchor}
            className="scroll-mt-24 rounded-2xl border p-5"
            style={{ background: 'hsl(var(--surface))', borderColor: 'hsl(var(--border))' }}
          >
            <div className="flex items-center gap-2 mb-2">
              <BookOpen size={16} color="#0891b2" />
              <h3 className="font-display font-semibold text-base" style={{ color: 'hsl(var(--text))' }}>
                {term}
              </h3>
            </div>
            <p className="text-[13.5px] leading-relaxed" style={{ color: 'hsl(var(--muted))' }}>
              {body}
            </p>
            {link && (
              <Link
                href={link.href}
                className="inline-flex items-center gap-1 mt-3 text-[12.5px] font-semibold"
                style={{ color: '#0891b2' }}
              >
                {link.label} →
              </Link>
            )}
          </div>
        ))}
      </div>
    </SeoSection>
  );
}
