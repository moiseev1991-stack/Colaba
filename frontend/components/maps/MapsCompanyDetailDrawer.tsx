'use client';

/**
 * Подробный диалог компании: метрики, сайт/телефон, отзывы.
 *
 * Drawer фильтрации отзывов:
 *  - вкладки sentiment (все / негатив / позитив)
 *  - текстовый поиск (text_contains)
 *  - фильтр «только с ответом владельца»
 *
 * Карточки отзывов:
 *  - звёздный рейтинг
 *  - цветная боковая полоска по sentiment (красная/зелёная/серая)
 *  - бейджи sentiment и ответа владельца
 *  - подсветка совпадений с поисковой подстрокой
 */

import { useCallback, useEffect, useState } from 'react';
import {
  Globe,
  Mail,
  MessageCircle,
  Phone,
  Search as SearchIcon,
  Send,
  Star,
  X,
} from 'lucide-react';

import { CompanyDigestBlock } from '@/components/maps/CompanyDigestBlock';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  getCompanyDetail,
  getCompanyReviews,
  type CompanyDetailOut,
  type ReviewOut,
} from '@/src/services/api/maps';

type Tab = 'all' | 'negative' | 'positive';

interface Props {
  companyId: number | null;
  onClose: () => void;
}

export function MapsCompanyDetailDrawer({ companyId, onClose }: Props) {
  const [detail, setDetail] = useState<CompanyDetailOut | null>(null);
  const [tab, setTab] = useState<Tab>('all');
  const [reviews, setReviews] = useState<ReviewOut[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // drawer-level фильтры (применяются к /maps/companies/{id}/reviews)
  const [textQuery, setTextQuery] = useState('');
  const [onlyWithOwnerReply, setOnlyWithOwnerReply] = useState(false);

  // debounce для текстового поиска (300мс)
  const [debouncedText, setDebouncedText] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedText(textQuery.trim()), 300);
    return () => clearTimeout(t);
  }, [textQuery]);

  const loadReviews = useCallback(async () => {
    if (companyId == null || !detail) return;
    setIsLoading(true);
    try {
      const data = await getCompanyReviews(
        companyId,
        {
          ...(tab === 'all' ? {} : { sentiment: tab }),
          ...(debouncedText ? { text_contains: debouncedText } : {}),
          ...(onlyWithOwnerReply ? { has_owner_reply: true } : {}),
        },
        50,
        0,
      );
      setReviews(data.items);
    } finally {
      setIsLoading(false);
    }
  }, [companyId, detail, tab, debouncedText, onlyWithOwnerReply]);

  // Сбрасываем состояние при смене компании
  useEffect(() => {
    if (companyId == null) {
      setDetail(null);
      setReviews([]);
      setTab('all');
      setTextQuery('');
      setDebouncedText('');
      setOnlyWithOwnerReply(false);
      return;
    }
    setIsLoading(true);
    void (async () => {
      try {
        const d = await getCompanyDetail(companyId);
        setDetail(d);
        setReviews(d.recent_reviews);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [companyId]);

  // Любая смена фильтра — повторный fetch
  useEffect(() => {
    if (companyId == null || !detail) return;
    // Дефолт «Все» без фильтров — используем уже загруженный recent_reviews,
    // не делаем лишний запрос.
    if (tab === 'all' && !debouncedText && !onlyWithOwnerReply) {
      setReviews(detail.recent_reviews);
      return;
    }
    void loadReviews();
  }, [tab, debouncedText, onlyWithOwnerReply, companyId, detail, loadReviews]);

  const open = companyId != null;
  const hasActiveFilters = tab !== 'all' || debouncedText.length > 0 || onlyWithOwnerReply;

  return (
    <Dialog open={open} onClose={onClose} title={detail?.name ?? 'Загрузка…'}>
      {!detail ? (
        <div className="py-6 text-sm text-slate-500">Загружаем карточку…</div>
      ) : (
        <div className="space-y-4">
          {/* === Шапка компании === */}
          <div className="text-sm text-slate-600">
            {formatAddressWithCity(detail.address, detail.city) || '—'}
          </div>

          <ContactsBlock detail={detail} />

          <div className="flex flex-wrap gap-3 text-xs">
            <Metric label="Рейтинг" value={detail.rating?.toFixed(1) ?? '—'} />
            <Metric label="Отзывов" value={String(detail.reviews_count)} />
            <Metric label="Негатив" value={String(detail.reviews_negative_count)} red />
            <Metric label="Позитив" value={String(detail.reviews_positive_count)} green />
            <Metric
              label="Ответы владельца"
              value={detail.has_owner_replies ? `да (${detail.owner_replies_count})` : 'нет'}
            />
          </div>

          {/* Дайджест за 30 дней — лента метрик + топ-боли с цитатами */}
          <CompanyDigestBlock companyId={detail.id} days={30} />

          {Array.isArray(detail.pain_tags) && detail.pain_tags.length > 0 && (
            <div>
              <div className="mb-1 text-xs font-medium text-slate-500">Боли клиентов:</div>
              <div className="flex flex-wrap gap-1">
                {detail.pain_tags.map((t) => (
                  <span
                    key={t.id}
                    className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700"
                  >
                    {t.label}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* === Tabs sentiment === */}
          <div>
            <div className="mb-2 flex gap-2 border-b border-slate-200">
              {(['all', 'negative', 'positive'] as Tab[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={cn(
                    'border-b-2 px-2 py-1 text-xs font-medium transition-colors',
                    tab === t
                      ? 'border-slate-900 text-slate-900'
                      : 'border-transparent text-slate-500 hover:text-slate-700'
                  )}
                >
                  {t === 'all'
                    ? `Все${detail.reviews_count > 0 ? ` (${detail.reviews_count})` : ''}`
                    : t === 'negative'
                      ? `Негатив${detail.reviews_negative_count > 0 ? ` (${detail.reviews_negative_count})` : ''}`
                      : `Позитив${detail.reviews_positive_count > 0 ? ` (${detail.reviews_positive_count})` : ''}`}
                </button>
              ))}
            </div>

            {/* === Drawer filter row: text search + has_owner_reply === */}
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[200px]">
                <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <Input
                  type="text"
                  placeholder="Поиск в тексте отзыва…"
                  value={textQuery}
                  onChange={(e) => setTextQuery(e.target.value)}
                  className="h-8 text-[13px] pl-8 pr-7"
                />
                {textQuery && (
                  <button
                    type="button"
                    onClick={() => setTextQuery('')}
                    aria-label="Очистить поиск"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <label className="inline-flex cursor-pointer items-center gap-1.5 text-[12px] text-slate-600">
                <input
                  type="checkbox"
                  checked={onlyWithOwnerReply}
                  onChange={(e) => setOnlyWithOwnerReply(e.target.checked)}
                  className="h-3.5 w-3.5"
                />
                только с ответом владельца
              </label>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={() => {
                    setTab('all');
                    setTextQuery('');
                    setOnlyWithOwnerReply(false);
                  }}
                  className="text-[12px] text-slate-500 underline hover:text-slate-800"
                >
                  сбросить
                </button>
              )}
            </div>

            {isLoading && reviews.length === 0 ? (
              <div className="text-sm text-slate-500">Загружаем отзывы…</div>
            ) : reviews.length === 0 ? (
              <div className="text-sm text-slate-500">
                {hasActiveFilters
                  ? 'Отзывов под текущие фильтры не найдено.'
                  : 'Отзывов нет.'}
              </div>
            ) : (
              <>
                {hasActiveFilters && !isLoading && (
                  <div className="mb-2 text-[11px] uppercase tracking-wider text-slate-400">
                    показано {reviews.length}
                    {textQuery ? ` · по запросу «${debouncedText}»` : ''}
                  </div>
                )}
                <ul className="space-y-2">
                  {reviews.map((r) => (
                    <ReviewCard key={r.id} review={r} highlight={debouncedText} />
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      )}
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// ContactsBlock — телефоны / email / соцсети / сайт.
//
// Источники:
//   - detail.phone — основной телефон от 2GIS
//   - detail.website — сайт от 2GIS
//   - detail.emails — список email от enrich_company_contacts (краулер сайта)
//   - detail.contacts_extra — { phones[], telegrams[], vks[], whatsapps[] }
//     тоже от краулера. fetched_url/error — служебные, не показываем.
//
// Дубли телефона из 2GIS и из contacts_extra.phones схлопываем.
// Если ни одного контакта нет — показываем подсказку, что обогащение
// контактов работает только когда у компании есть website.
// ---------------------------------------------------------------------------

interface ContactsExtra {
  phones?: string[];
  telegrams?: string[];
  vks?: string[];
  whatsapps?: string[];
  // прочие ключи (fetched_url, error) — игнорим
}

function normalizePhone(p: string): string {
  // Для дедупа: оставляем только цифры. +7 (495) 123-45-67 → 74951234567
  return p.replace(/\D+/g, '');
}

function ContactsBlock({ detail }: { detail: CompanyDetailOut }) {
  const extra: ContactsExtra = (detail.contacts_extra ?? {}) as ContactsExtra;
  const emails: string[] = Array.isArray(detail.emails) ? detail.emails : [];

  // Телефоны: основной + extra.phones, без дублей по нормализованной форме.
  const phoneSet = new Map<string, string>();
  if (detail.phone) phoneSet.set(normalizePhone(detail.phone), detail.phone);
  for (const p of extra.phones ?? []) {
    const key = normalizePhone(p);
    if (key && !phoneSet.has(key)) phoneSet.set(key, p);
  }
  const phones = Array.from(phoneSet.values());

  const telegrams = (extra.telegrams ?? []).filter(Boolean);
  const vks = (extra.vks ?? []).filter(Boolean);
  const whatsapps = (extra.whatsapps ?? []).filter(Boolean);

  const hasAny =
    phones.length > 0 ||
    emails.length > 0 ||
    telegrams.length > 0 ||
    vks.length > 0 ||
    whatsapps.length > 0 ||
    !!detail.website;

  if (!hasAny) {
    return (
      <div className="rounded-md border border-dashed border-slate-300 px-3 py-2 text-[12px] text-slate-500">
        Контактов пока нет. Email-ы и соцсети подтягиваются с сайта компании —
        у этой компании сайт не указан в 2GIS.
      </div>
    );
  }

  return (
    <div className="rounded-md border border-slate-200 bg-slate-50/50 p-3">
      <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-slate-500">
        Контакты
      </div>
      <div className="flex flex-col gap-1.5 text-[13px]">
        {phones.map((p) => (
          <ContactRow key={`tel-${p}`} icon={<Phone className="h-3.5 w-3.5" />} href={`tel:${normalizePhone(p)}`}>
            {p}
          </ContactRow>
        ))}
        {emails.map((e) => (
          <ContactRow key={`mail-${e}`} icon={<Mail className="h-3.5 w-3.5" />} href={`mailto:${e}`}>
            {e}
          </ContactRow>
        ))}
        {detail.website && (
          <ContactRow
            icon={<Globe className="h-3.5 w-3.5" />}
            href={detail.website}
            external
          >
            {prettifyUrl(detail.website)}
          </ContactRow>
        )}
        {telegrams.map((t) => {
          const handle = t.startsWith('@') ? t.slice(1) : t;
          return (
            <ContactRow
              key={`tg-${t}`}
              icon={<Send className="h-3.5 w-3.5" />}
              href={`https://t.me/${handle}`}
              external
              label="Telegram"
            >
              @{handle}
            </ContactRow>
          );
        })}
        {vks.map((v) => (
          <ContactRow
            key={`vk-${v}`}
            icon={<MessageCircle className="h-3.5 w-3.5" />}
            href={v.startsWith('http') ? v : `https://vk.com/${v.replace(/^@/, '')}`}
            external
            label="ВКонтакте"
          >
            {prettifyUrl(v)}
          </ContactRow>
        ))}
        {whatsapps.map((w) => {
          // w может быть номером или wa.me ссылкой
          const digits = normalizePhone(w);
          const href = w.startsWith('http') ? w : `https://wa.me/${digits}`;
          return (
            <ContactRow
              key={`wa-${w}`}
              icon={<MessageCircle className="h-3.5 w-3.5" />}
              href={href}
              external
              label="WhatsApp"
            >
              {digits ? `+${digits}` : w}
            </ContactRow>
          );
        })}
      </div>
    </div>
  );
}

function ContactRow({
  icon,
  href,
  external,
  label,
  children,
}: {
  icon: React.ReactNode;
  href: string;
  external?: boolean;
  label?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-slate-400" aria-hidden>
        {icon}
      </span>
      <a
        href={href}
        target={external ? '_blank' : undefined}
        rel={external ? 'noopener noreferrer' : undefined}
        className="text-slate-700 underline hover:text-slate-900"
      >
        {children}
      </a>
      {label && (
        <span className="text-[10px] uppercase tracking-wide text-slate-400">
          {label}
        </span>
      )}
    </div>
  );
}

function prettifyUrl(u: string): string {
  return u.replace(/^https?:\/\//, '').replace(/\/$/, '');
}

function Metric({
  label,
  value,
  red,
  green,
}: {
  label: string;
  value: string;
  red?: boolean;
  green?: boolean;
}) {
  return (
    <div className="rounded-md border border-slate-200 px-2 py-1">
      <div className="text-[10px] uppercase tracking-wide text-slate-400">{label}</div>
      <div
        className={cn(
          'text-sm font-medium',
          red ? 'text-red-700' : green ? 'text-emerald-700' : 'text-slate-900'
        )}
      >
        {value}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ReviewCard
// ---------------------------------------------------------------------------

function ReviewCard({ review, highlight }: { review: ReviewOut; highlight: string }) {
  const sentiment = review.sentiment as 'positive' | 'negative' | 'neutral' | null;
  const accent =
    sentiment === 'negative'
      ? 'border-l-red-400 bg-red-50/40'
      : sentiment === 'positive'
        ? 'border-l-emerald-400 bg-emerald-50/30'
        : 'border-l-slate-300 bg-white';

  return (
    <li className={cn('rounded-md border border-slate-200 border-l-4 p-3', accent)}>
      <div className="mb-1.5 flex items-center gap-2 text-xs text-slate-500 flex-wrap">
        <span className="font-medium text-slate-700">
          {review.author_masked || 'Аноним'}
        </span>
        {review.rating != null && <StarRating value={review.rating} />}
        {review.posted_at && (
          <span>{new Date(review.posted_at).toLocaleDateString('ru-RU')}</span>
        )}
        {sentiment && <SentimentBadge sentiment={sentiment} />}
        {review.has_owner_reply && (
          <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[11px] font-medium text-emerald-800">
            ответ владельца
          </span>
        )}
      </div>
      {review.raw_text == null ? (
        <div className="text-sm text-slate-400">
          Текст удалён по политике хранения.{' '}
          {review.source_url && (
            <a
              className="underline"
              href={review.source_url}
              target="_blank"
              rel="noopener noreferrer"
            >
              Открыть оригинал
            </a>
          )}
        </div>
      ) : (
        <div className="whitespace-pre-wrap text-sm text-slate-700">
          {highlight ? <HighlightedText text={review.raw_text} needle={highlight} /> : review.raw_text}
        </div>
      )}
      {Array.isArray(review.pain_tags) && review.pain_tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {review.pain_tags.map((t) => (
            <span
              key={t.id}
              className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700"
            >
              {t.label}
            </span>
          ))}
        </div>
      )}
    </li>
  );
}

function StarRating({ value }: { value: number }) {
  // value 1..5; красим первые value звёзд жёлтым, остальные серым
  const stars = [1, 2, 3, 4, 5].map((i) => {
    const filled = i <= value;
    return (
      <Star
        key={i}
        className={cn(
          'h-3 w-3',
          filled ? 'fill-amber-400 text-amber-400' : 'text-slate-300'
        )}
      />
    );
  });
  return <span className="inline-flex items-center gap-0.5">{stars}</span>;
}

function SentimentBadge({ sentiment }: { sentiment: 'positive' | 'negative' | 'neutral' }) {
  const cfg = {
    positive: { label: 'позитив', cls: 'bg-emerald-100 text-emerald-800' },
    negative: { label: 'негатив', cls: 'bg-red-100 text-red-800' },
    neutral: { label: 'нейтр.', cls: 'bg-slate-100 text-slate-700' },
  }[sentiment];
  return (
    <span className={cn('rounded px-1.5 py-0.5 text-[11px] font-medium', cfg.cls)}>
      {cfg.label}
    </span>
  );
}

function formatAddressWithCity(
  address: string | null | undefined,
  city: string | null | undefined
): string | null {
  const a = (address ?? '').trim();
  const c = (city ?? '').trim();
  if (!a && !c) return null;
  if (!a) return c;
  if (!c) return a;
  if (a.toLowerCase().includes(c.toLowerCase())) return a;
  return `${c}, ${a}`;
}

function HighlightedText({ text, needle }: { text: string; needle: string }) {
  if (!needle) return <>{text}</>;
  // Регистронезависимое разбиение по needle. Не делаем regex-escape — пользователь
  // вводит обычные слова, спецсимволы (скобки и т.п.) сломают сплит, поэтому
  // экранируем minimally.
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === needle.toLowerCase() ? (
          <mark key={i} className="rounded bg-amber-200/70 px-0.5 text-slate-900">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}
