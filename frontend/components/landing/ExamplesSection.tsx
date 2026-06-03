'use client';

// ТЗ лендинг-рефакта 2026-06-03 §6+§8: на главном лендинге демонстрируем
// то, что продаёт SpinLid — компании с диагнозом и кампании КП. Вкладки
// «SEO» и «Госзакупки» убраны (модули есть в кабинете, но не продают суть).
// Все таблицы помечены «ПРИМЕР» — без претензии на реальных клиентов (§3).

import { useState } from 'react';
import { Loader2, Download, Copy, MessageSquareQuote } from 'lucide-react';

const TABS = [
  { id: 'diagnosis', label: 'Компании с диагнозом' },
  { id: 'campaigns', label: 'Кампании КП' },
];

type Pain = { label: string; count: number };

const MOCK_DIAGNOSIS: {
  company: string;
  rating: number;
  reviews: number;
  pains: Pain[];
  quote: string;
  phone: string;
}[] = [
  {
    company: 'Стоматология «Улыбка+»',
    rating: 3.8,
    reviews: 142,
    pains: [
      { label: 'Долгое ожидание', count: 12 },
      { label: 'Грубят на ресепшене', count: 5 },
      { label: 'Не перезванивают', count: 3 },
    ],
    quote: 'Записала ребёнка на 10, приняли в 11:20…',
    phone: '+7 (495) 123-45…',
  },
  {
    company: 'Клиника «Здоровье»',
    rating: 4.1,
    reviews: 89,
    pains: [
      { label: 'Дорого / непрозрачные цены', count: 8 },
      { label: 'Долгая запись', count: 4 },
    ],
    quote: 'На сайте от 1500, по факту чек 4800…',
    phone: '+7 (495) 555-12…',
  },
  {
    company: 'Автосервис «Кардан»',
    rating: 3.6,
    reviews: 67,
    pains: [
      { label: 'Затянули сроки', count: 9 },
      { label: 'Доп. работы без согласия', count: 6 },
    ],
    quote: 'Сказали 2 дня, делали 9. Когда ругаешься — хамят…',
    phone: '+7 (903) 444-66…',
  },
  {
    company: 'Детская клиника «Радуга»',
    rating: 4.3,
    reviews: 156,
    pains: [
      { label: 'Очереди несмотря на запись', count: 7 },
    ],
    quote: 'Записаны на 14:00, провели в кабинет в 15:30…',
    phone: '+7 (495) 200-30…',
  },
  {
    company: 'Стоматология «Дентал»',
    rating: 4.5,
    reviews: 203,
    pains: [],
    quote: '',
    phone: '+7 (495) 678-90…',
  },
];

const MOCK_CAMPAIGNS = [
  { name: 'Стоматологии Москвы — холодное письмо', recipients: 247, sent: 247, opened: 89, errors: 12, date: '02.06.2026', status: 'OK' },
  { name: 'Автосервисы СПб — повторное касание', recipients: 180, sent: 96, opened: 28, errors: 4, date: '01.06.2026', status: 'processing' },
  { name: 'Клиники Воронежа — приглашение на demo', recipients: 64, sent: 64, opened: 22, errors: 1, date: '30.05.2026', status: 'OK' },
];

function StatusBadge({ status }: { status: string }) {
  if (status === 'processing') {
    return (
      <span
        className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs"
        style={{ backgroundColor: 'rgba(245,158,11,0.15)', color: 'var(--landing-warning)' }}
      >
        <Loader2 className="h-3 w-3 animate-spin" /> В работе
      </span>
    );
  }
  return (
    <span
      className="rounded px-2 py-0.5 text-xs"
      style={{ backgroundColor: 'rgba(14,169,122,0.15)', color: 'var(--landing-accent)' }}
    >
      OK
    </span>
  );
}

function PainPill({ pain }: { pain: Pain }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: '2px 8px',
        marginRight: '4px',
        marginBottom: '2px',
        borderRadius: '999px',
        fontSize: '11px',
        fontWeight: 500,
        background: 'rgba(245, 158, 11, 0.15)',
        color: '#92400e',
        border: '1px solid rgba(245, 158, 11, 0.3)',
      }}
    >
      {pain.label}
      <span style={{ fontSize: '10px', opacity: 0.75 }}>×{pain.count}</span>
    </span>
  );
}

export function ExamplesSection() {
  const [tab, setTab] = useState('diagnosis');

  return (
    <section id="examples" className="landing-section l-examples">
      <div className="container">
        <div className="section-label reveal">Примеры в кабинете</div>
        <h2 className="section-title reveal">
          Как выглядит <span style={{ color: 'var(--landing-accent)' }}>в кабинете</span>
        </h2>

        {/* Tabs */}
        <div className="l-examples__tabs reveal">
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`l-examples__tab${tab === id ? ' active' : ''}`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* «ПРИМЕР»-плашка (§3) */}
        <div
          className="reveal"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '16px',
            padding: '6px 12px',
            borderRadius: '8px',
            background: 'rgba(245, 158, 11, 0.12)',
            border: '1px solid rgba(245, 158, 11, 0.3)',
            fontSize: '11px',
            fontWeight: 700,
            letterSpacing: '0.5px',
            textTransform: 'uppercase',
            color: '#92400e',
          }}
        >
          Пример · демо-данные, не реальные клиенты
        </div>

        {/* Actions */}
        <div className="reveal" style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
          <button
            className="l-btn l-btn--outline"
            style={{ padding: '8px 16px', fontSize: '13px', gap: '6px' }}
          >
            <Download size={14} />
            Скачать CSV
          </button>
          <button
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 16px',
              fontSize: '13px',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--landing-muted)',
              fontFamily: 'Inter, sans-serif',
            }}
          >
            <Copy size={14} />
            Копировать
          </button>
        </div>

        {/* Table */}
        <div className="l-examples__table-wrap reveal" style={{ overflowX: 'auto' }}>
          {tab === 'diagnosis' && (
            <table className="l-examples__table" style={{ minWidth: '720px' }}>
              <thead>
                <tr>
                  {['Компания', 'Рейтинг', 'Pain-теги', 'Цитата клиента', 'Контакт'].map(h => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {MOCK_DIAGNOSIS.map((r, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 600 }}>{r.company}</td>
                    <td>
                      ★ {r.rating} <span style={{ color: 'var(--landing-muted)', fontSize: '11px' }}>· {r.reviews}</span>
                    </td>
                    <td>
                      {r.pains.length === 0 ? (
                        <span
                          style={{
                            fontSize: '11px',
                            color: 'var(--landing-accent)',
                            background: 'var(--landing-accent-soft)',
                            padding: '2px 8px',
                            borderRadius: '6px',
                          }}
                        >
                          без негатива
                        </span>
                      ) : (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px' }}>
                          {r.pains.map((p) => (
                            <PainPill key={p.label} pain={p} />
                          ))}
                        </div>
                      )}
                    </td>
                    <td style={{ maxWidth: '260px' }}>
                      {r.quote ? (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'flex-start',
                            gap: '6px',
                            fontSize: '12px',
                            fontStyle: 'italic',
                            color: 'var(--landing-text-body)',
                            lineHeight: 1.4,
                          }}
                        >
                          <MessageSquareQuote size={11} style={{ color: '#d97706', flexShrink: 0, marginTop: '3px' }} />
                          «{r.quote}»
                        </span>
                      ) : (
                        <span style={{ color: 'var(--landing-muted)', fontSize: '12px' }}>—</span>
                      )}
                    </td>
                    <td style={{ whiteSpace: 'nowrap', fontSize: '12px' }}>{r.phone}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {tab === 'campaigns' && (
            <table className="l-examples__table" style={{ minWidth: '680px' }}>
              <thead>
                <tr>
                  {['Кампания', 'Получателей', 'Отправлено', 'Открыто', 'Ошибки', 'Дата', 'Статус'].map(h => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {MOCK_CAMPAIGNS.map((r, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 600 }}>{r.name}</td>
                    <td>{r.recipients}</td>
                    <td>{r.sent}</td>
                    <td>{r.opened}</td>
                    <td style={{ color: r.errors ? 'var(--landing-danger)' : undefined }}>{r.errors}</td>
                    <td>{r.date}</td>
                    <td><StatusBadge status={r.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </section>
  );
}
