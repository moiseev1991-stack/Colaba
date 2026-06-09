import { MessageSquareQuote, Star } from 'lucide-react';

/**
 * SignalsTableDemo — статичная демо-таблица «выдача компаний с диагнозом
 * из отзывов». Главное доказательство идеи SpinLid: каждая компания
 * в выдаче имеет свой набор pain-тегов и цитат, а не плоский контакт.
 *
 * Делаем самодостаточным компонентом со светлой плашкой, чтобы он
 * нормально ложился и на тёмный hero главной страницы (app/page.tsx),
 * и на светлую SEO-обёртку (SeoLandingShell).
 *
 * Mobile: на узких экранах таблица превращается в стек карточек —
 * 5 колонок на телефоне выглядели бы нечитаемо.
 */

type PainTag = { label: string; count: number };

type SignalsRow = {
  name: string;
  niche: string; // подпись под названием для контекста
  rating: number;
  reviews: number;
  pains: PainTag[];
  quote: string | null;
  phone: string;
  cleanLabel?: string; // если задано — вместо pain-тегов показываем зелёный «без негатива»
};

const ROWS: SignalsRow[] = [
  {
    name: 'Стоматология «Улыбка+»',
    niche: 'Стоматология · Москва',
    rating: 3.8,
    reviews: 142,
    pains: [
      { label: 'Долгое ожидание', count: 12 },
      { label: 'Грубят на ресепшене', count: 5 },
      { label: 'Не перезванивают', count: 3 },
    ],
    quote: 'Записала ребёнка на 10, приняли в 11:20…',
    phone: '+7 (495) 123-45-…',
  },
  {
    name: 'Клиника «Здоровье»',
    niche: 'Медицинский центр · Балашиха',
    rating: 4.1,
    reviews: 89,
    pains: [
      { label: 'Дорого / непрозрачные цены', count: 8 },
      { label: 'Долгая запись', count: 4 },
    ],
    quote: 'На сайте от 1500, по факту чек 4800…',
    phone: '+7 (495) 555-12-…',
  },
  {
    name: 'Автосервис «Кардан»',
    niche: 'Автосервис · Мытищи',
    rating: 3.6,
    reviews: 67,
    pains: [
      { label: 'Затянули сроки', count: 9 },
      { label: 'Доп. работы без согласия', count: 6 },
    ],
    quote: 'Сказали 2 дня, делали 9. Когда ругаешься — хамят…',
    phone: '+7 (903) 444-66-…',
  },
  {
    name: 'Детская клиника «Радуга»',
    niche: 'Педиатрия · Москва',
    rating: 4.3,
    reviews: 156,
    pains: [{ label: 'Очереди несмотря на запись', count: 7 }],
    quote: 'Записаны на 14:00, провели в кабинет в 15:30…',
    phone: '+7 (495) 200-30-…',
  },
  {
    name: 'Стоматология «Дентал»',
    niche: 'Стоматология · Подольск',
    rating: 4.5,
    reviews: 203,
    pains: [],
    quote: null,
    phone: '+7 (495) 678-90-…',
    cleanLabel: 'без негатива',
  },
];

const HEADER_CELL: React.CSSProperties = {
  padding: '14px 16px',
  fontSize: '11px',
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: '#64748b',
  textAlign: 'left',
  verticalAlign: 'middle',
};

const BODY_CELL: React.CSSProperties = {
  padding: '16px 16px',
  verticalAlign: 'middle',
  fontSize: '13px',
  color: '#0f172a',
};

export function SignalsTableDemo() {
  return (
    <div
      style={{
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '14px',
        overflow: 'hidden',
        boxShadow: '0 8px 28px rgba(15, 23, 42, 0.08)',
        color: '#0f172a',
      }}
    >
      {/* Desktop table */}
      <div className="hidden md:block" style={{ overflowX: 'auto' }}>
        <table
          style={{
            width: '100%',
            minWidth: '880px',
            borderCollapse: 'collapse',
            tableLayout: 'fixed',
          }}
        >
          <colgroup>
            <col style={{ width: '21%' }} />
            <col style={{ width: '12%' }} />
            <col style={{ width: '28%' }} />
            <col style={{ width: '25%' }} />
            <col style={{ width: '14%' }} />
          </colgroup>
          <thead style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
            <tr>
              <th style={HEADER_CELL}>Компания</th>
              <th style={HEADER_CELL}>Рейтинг</th>
              <th style={HEADER_CELL}>Pain-теги</th>
              <th style={HEADER_CELL}>Цитата клиента</th>
              <th style={HEADER_CELL}>Контакт</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row, i) => (
              <tr
                key={row.name}
                style={{
                  borderTop: i === 0 ? 'none' : '1px solid #f1f5f9',
                }}
              >
                <td style={BODY_CELL}>
                  <div style={{ fontWeight: 600 }}>{row.name}</div>
                  <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                    {row.niche}
                  </div>
                </td>
                <td style={BODY_CELL}>
                  <RatingCell rating={row.rating} reviews={row.reviews} />
                </td>
                <td style={BODY_CELL}>
                  {row.cleanLabel ? (
                    <CleanBadge label={row.cleanLabel} />
                  ) : (
                    <PainList pains={row.pains} />
                  )}
                </td>
                <td style={BODY_CELL}>
                  {row.quote ? (
                    <QuoteCell text={row.quote} />
                  ) : (
                    <span style={{ color: '#cbd5e1' }}>—</span>
                  )}
                </td>
                <td style={{ ...BODY_CELL, fontVariantNumeric: 'tabular-nums' }}>
                  {row.phone}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile: вертикальные карточки */}
      <div className="block md:hidden">
        {ROWS.map((row, i) => (
          <div
            key={row.name}
            style={{
              padding: '14px 16px',
              borderTop: i === 0 ? 'none' : '1px solid #f1f5f9',
            }}
          >
            <div style={{ fontWeight: 600, fontSize: '14px', color: '#0f172a' }}>
              {row.name}
            </div>
            <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
              {row.niche}
            </div>
            <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <RatingCell rating={row.rating} reviews={row.reviews} />
              <span style={{ fontSize: '12px', color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>
                {row.phone}
              </span>
            </div>
            <div style={{ marginTop: '10px' }}>
              {row.cleanLabel ? (
                <CleanBadge label={row.cleanLabel} />
              ) : (
                <PainList pains={row.pains} />
              )}
            </div>
            {row.quote && (
              <div style={{ marginTop: '8px' }}>
                <QuoteCell text={row.quote} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function RatingCell({ rating, reviews }: { rating: number; reviews: number }) {
  // Цветовая шкала, согласована с маpps UX-PR: 4.5+ зелёный, 4.0+ жёлтый, иначе оранжевый/красный
  const color =
    rating >= 4.5 ? '#16a34a' : rating >= 4.0 ? '#ca8a04' : rating >= 3.5 ? '#ea580c' : '#dc2626';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}>
      <Star size={13} fill={color} stroke={color} />
      <span style={{ fontWeight: 600, color }}>{rating.toFixed(1)}</span>
      <span style={{ color: '#94a3b8' }}>· {reviews}</span>
    </div>
  );
}

function PainList({ pains }: { pains: PainTag[] }) {
  if (pains.length === 0) return <span style={{ color: '#cbd5e1' }}>—</span>;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
      {pains.map((p) => (
        <span
          key={p.label}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '12px',
            fontWeight: 500,
            padding: '3px 9px',
            borderRadius: '999px',
            background: '#fef3c7',
            color: '#92400e',
            border: '1px solid #fde68a',
            lineHeight: 1.3,
          }}
        >
          {p.label}
          <span style={{ color: '#b45309', fontWeight: 600 }}>×{p.count}</span>
        </span>
      ))}
    </div>
  );
}

function CleanBadge({ label }: { label: string }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        fontSize: '12px',
        fontWeight: 500,
        padding: '3px 10px',
        borderRadius: '999px',
        background: '#d1fae5',
        color: '#065f46',
        border: '1px solid #a7f3d0',
        lineHeight: 1.3,
      }}
    >
      {label}
    </span>
  );
}

function QuoteCell({ text }: { text: string }) {
  return (
    <div
      style={{
        display: 'flex',
        gap: '6px',
        alignItems: 'flex-start',
        fontSize: '12.5px',
        color: '#334155',
        fontStyle: 'italic',
        lineHeight: 1.45,
      }}
    >
      <MessageSquareQuote
        size={12}
        style={{ color: '#d97706', flexShrink: 0, marginTop: '3px' }}
      />
      <span>«{text}»</span>
    </div>
  );
}
