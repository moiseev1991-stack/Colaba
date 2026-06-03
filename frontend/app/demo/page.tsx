/**
 * /demo — публичная read-only страница демонстрации.
 *
 * B2B-клиент в РФ 2026 не зарегистрируется, пока не увидит, что получит.
 * Здесь — пример выдачи по нише «Стоматологии Москвы»: компании со списком
 * болей клиентов из отзывов, цитатами, контактами и кнопками — но всё
 * статично и не требует логина.
 *
 * Данные — захардкоженный fixture (не дёргает /api), потому что:
 *  - страница должна работать с холодной БД
 *  - на демо мы выбираем самые иллюстративные карточки руками
 *  - кнопки [В список]/[Письмо] на демо — не активны, чтобы не вести в auth
 */

import { ArrowRight, Mail, MessageSquareQuote, Phone, Globe } from 'lucide-react';
import Link from 'next/link';

const COMPANIES = [
  {
    id: 1,
    name: 'Стоматология «Улыбка+»',
    address: 'Москва, ул. Ленина, 12',
    rating: 3.8,
    reviewsCount: 142,
    reviewsNegative: 31,
    phone: '+7 (495) 123-45-67',
    website: 'ulybka-plus.ru',
    emails: ['info@ulybka-plus.ru'],
    topPains: [
      {
        label: 'Долгое ожидание',
        mentionCount: 12,
        quote: 'Записался на 14:00, приняли только в 14:55. Сидеть в коридоре с больным зубом — отдельный квест.',
      },
      {
        label: 'Грубое отношение администраторов',
        mentionCount: 8,
        quote: 'Девушка на ресепшене разговаривала так, будто я ей должен. Не первый раз слышу подобное от знакомых.',
      },
    ],
  },
  {
    id: 2,
    name: 'Дентал-Сервис «Премиум»',
    address: 'Москва, Цветной бульвар, 4',
    rating: 4.1,
    reviewsCount: 87,
    reviewsNegative: 14,
    phone: '+7 (495) 234-56-78',
    website: 'dental-premium.com',
    emails: ['hello@dental-premium.com', 'reception@dental-premium.com'],
    topPains: [
      {
        label: 'Завышенные счёта по сравнению с озвученной ценой',
        mentionCount: 6,
        quote: 'По телефону назвали 8 тысяч, на месте после осмотра — уже 22. Никаких "может быть дороже" заранее не предупредили.',
      },
    ],
  },
  {
    id: 3,
    name: 'СтомЦентр 24',
    address: 'Москва, Профсоюзная, 78',
    rating: 3.4,
    reviewsCount: 198,
    reviewsNegative: 52,
    phone: '+7 (495) 345-67-89',
    website: 'stom24.ru',
    emails: ['contact@stom24.ru'],
    topPains: [
      {
        label: 'Низкое качество пломб',
        mentionCount: 18,
        quote: 'Пломба выпала через две недели. Пришёл с претензией — сказали "это естественный износ".',
      },
      {
        label: 'Навязывание дополнительных услуг',
        mentionCount: 11,
        quote: 'Пришла лечить один зуб — насчитали санацию полости рта на 60 тысяч. Никаких острых проблем у меня не было.',
      },
    ],
  },
];

export default function DemoPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="mx-auto max-w-[1100px] flex items-center justify-between px-6 py-3">
          <Link href="/" className="text-lg font-semibold text-slate-900">
            Colaba
          </Link>
          <Link
            href="/auth/register"
            className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
          >
            Попробовать на своих данных
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-[1100px] px-6 py-8 space-y-6">
        <section>
          <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
            Демо-выдача
          </div>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">
            Стоматологии Москвы — с болями клиентов
          </h1>
          <p className="mt-2 text-sm text-slate-600 max-w-[680px]">
            Вот что увидит зарегистрированный пользователь после запуска поиска по нише
            «стоматология» в Москве. Компании из 2GIS, рядом — конкретные жалобы клиентов из
            отзывов и контакты для холодного письма с упоминанием боли.
          </p>
        </section>

        <ul className="divide-y divide-slate-200 rounded-md border border-slate-200 bg-white">
          {COMPANIES.map((c) => (
            <li key={c.id} className="px-4 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] font-semibold text-slate-900">{c.name}</div>
                  <div className="mt-0.5 text-xs text-slate-500">{c.address}</div>
                </div>
                <span
                  className={`shrink-0 rounded-v2-sm px-2 py-1 text-[12px] font-semibold ${
                    c.rating >= 4 ? 'bg-[var(--signal-good-bg)] text-[color:var(--signal-good)]' :
                    c.rating <= 3.5 ? 'bg-[var(--signal-hot-bg)] text-[color:var(--signal-hot)]' :
                    'bg-[var(--signal-warm-bg)] text-[color:var(--signal-warm)]'
                  }`}
                >
                  ★ {c.rating.toFixed(1)}
                </span>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px]">
                <span className="rounded-md bg-slate-100 px-2 py-0.5 text-slate-700">
                  {c.reviewsCount} отзывов
                </span>
                <span className="rounded-v2-sm bg-[var(--signal-hot-bg)] px-2 py-0.5 text-[color:var(--signal-hot)] ring-1 ring-inset ring-[color:var(--signal-hot)]/30">
                  негатив {c.reviewsNegative}
                </span>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-3 text-[12px] text-slate-600">
                <span className="inline-flex items-center gap-1">
                  <Phone className="h-3 w-3 text-slate-400" />
                  {c.phone}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Globe className="h-3 w-3 text-slate-400" />
                  {c.website}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Mail className="h-3 w-3 text-emerald-500" />
                  <span className="text-emerald-700">{c.emails[0]}</span>
                  {c.emails.length > 1 && (
                    <span className="text-[11px] text-slate-400">+{c.emails.length - 1}</span>
                  )}
                </span>
              </div>

              <div className="mt-3 space-y-1.5">
                {c.topPains.map((p, i) => (
                  <div key={i} className="rounded-v2-sm border border-[color:var(--signal-warm)]/30 bg-[var(--signal-warm-bg)] px-2 py-1.5">
                    <div className="flex items-center gap-2">
                      <span className="rounded-pill bg-[var(--signal-warm)]/20 px-2 py-0.5 text-[11px] font-medium text-[color:var(--signal-warm)]">
                        {p.label}
                      </span>
                      <span className="text-[11px] text-[color:var(--signal-warm)]/80">× {p.mentionCount}</span>
                    </div>
                    <div className="mt-1 flex items-start gap-1.5 text-[12px] text-slate-700">
                      <MessageSquareQuote className="mt-0.5 h-3 w-3 shrink-0 text-[color:var(--signal-warm)]" />
                      <span className="italic">«{p.quote}»</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-[12px] font-medium text-slate-400">
                  В список
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-md bg-slate-300 px-2.5 py-1 text-[12px] font-medium text-slate-500">
                  <Mail className="h-3.5 w-3.5" />
                  Письмо (доступно после регистрации)
                </span>
              </div>
            </li>
          ))}
        </ul>

        <section className="rounded-md border border-slate-200 bg-white p-5">
          <h2 className="text-base font-semibold text-slate-900">Что внутри после регистрации</h2>
          <ul className="mt-3 space-y-2 text-sm text-slate-700">
            <li>· Поиск по любой нише и городу через 2GIS / Яндекс.Карты.</li>
            <li>· Автоматический разбор отзывов клиентов LLM-ом — выделение болей и цитат.</li>
            <li>
              · Один клик — драфт холодного письма с упоминанием конкретной боли и реальной
              цитаты клиента.
            </li>
            <li>· Лист лидов с массовой подстановкой переменных в email-кампанию.</li>
          </ul>
          <Link
            href="/auth/register"
            className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Создать аккаунт за 30 секунд
            <ArrowRight className="h-4 w-4" />
          </Link>
        </section>
      </main>
    </div>
  );
}
