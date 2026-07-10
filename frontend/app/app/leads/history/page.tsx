'use client';

/**
 * §4.3 ТЗ редизайна 2026-06-03 — История поисков лидов.
 *
 * 2026-06-17: разнесли по табам — «По картам», «По сайтам», «КП». До этого
 * секции висели одна под другой и юзер искал страницу с КП глазами. Теперь
 * Bulk-генерация КП из выдачи кладёт письма в БД, а здесь — единая точка
 * посмотреть все накопленные КП с поиском по компании/теме.
 */

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Download,
  Eye,
  Loader2,
  Mail,
  Map,
  MessageCircle,
  MoreVertical,
  Send,
  Sparkles,
  Trash2,
} from 'lucide-react';

import { ButtonV2 } from '@/components/ui/ButtonV2';
import { CardV2 } from '@/components/ui/CardV2';
import { SignalPill } from '@/components/ui/SignalPill';
import { Skeleton } from '@/components/ui/Skeleton';
import { listMyMapSearches, type MapSearchOut } from '@/src/services/api/maps';
import {
  deleteSearch,
  listSearches,
  type SearchResponse,
} from '@/src/services/api/search';
import {
  listKpDrafts,
  listKpJobs,
  listKpSends,
  type KpDraftListItem,
  type KpJobListItem,
  type KpSendChannel,
  type KpSendListItem,
  type KpSendStatus,
} from '@/src/services/api/outreach-kp';
import { cn } from '@/lib/utils';

type Tab = 'maps' | 'sites' | 'kp' | 'kp-jobs' | 'sends';

const TABS: { value: Tab; label: string }[] = [
  { value: 'maps', label: 'По картам' },
  { value: 'sites', label: 'По сайтам' },
  { value: 'kp', label: 'КП' },
  { value: 'kp-jobs', label: 'Партии КП' },
  { value: 'sends', label: 'Отправки' },
];

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function statusLabel(s: string): string {
  if (s === 'completed') return 'OK';
  if (s === 'failed') return 'Ошибка';
  if (s === 'processing' || s === 'running') return 'В работе';
  return 'Ожидание';
}

function statusTone(s: string): 'good' | 'hot' | 'warm' | 'muted' {
  if (s === 'completed') return 'good';
  if (s === 'failed') return 'hot';
  if (s === 'processing' || s === 'running' || s === 'pending') return 'warm';
  return 'muted';
}

const TEMPLATE_LABELS: Record<string, string> = {
  webstudio: 'Веб-студия',
  seo: 'SEO',
  marketing: 'Маркетинг',
  custom: 'Свой',
};

function templateLabel(key: string): string {
  return TEMPLATE_LABELS[key] || key;
}

export default function LeadsHistoryPage() {
  // useSearchParams требует Suspense-границу при статической генерации,
  // иначе Next.js падает на prerender. Оборачиваем внутренний компонент.
  return (
    <Suspense fallback={null}>
      <LeadsHistoryInner />
    </Suspense>
  );
}

function LeadsHistoryInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = useMemo<Tab>(() => {
    const raw = searchParams?.get('tab');
    if (
      raw === 'sites' ||
      raw === 'kp' ||
      raw === 'kp-jobs' ||
      raw === 'sends' ||
      raw === 'maps'
    )
      return raw;
    return 'maps';
  }, [searchParams]);
  const [tab, setTab] = useState<Tab>(initialTab);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1
          className="font-display font-semibold tracking-tight"
          style={{ fontSize: 'clamp(1.5rem, 3vw, 2rem)', color: 'hsl(var(--text))' }}
        >
          История поисков лидов
        </h1>
      </div>

      <div
        className="mb-4 flex flex-wrap gap-1 border-b"
        style={{ borderColor: 'hsl(var(--border))' }}
      >
        {TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setTab(t.value)}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 text-[13px] font-medium transition-colors',
              tab === t.value
                ? 'border-[hsl(var(--accent))] text-[hsl(var(--accent))]'
                : 'border-transparent text-[hsl(var(--muted))] hover:text-[hsl(var(--text))]',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'maps' && <MapsHistoryTab router={router} />}
      {tab === 'sites' && <SitesHistoryTab router={router} />}
      {tab === 'kp' && <KpHistoryTab router={router} />}
      {tab === 'kp-jobs' && <KpJobsHistoryTab router={router} />}
      {tab === 'sends' && <KpSendsHistoryTab router={router} />}
    </div>
  );
}

// --- Tab: По картам --------------------------------------------------------

function MapsHistoryTab({ router }: { router: ReturnType<typeof useRouter> }) {
  const [items, setItems] = useState<MapSearchOut[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listMyMapSearches(50, 0)
      .then((rows) => {
        if (!cancelled) setItems(rows);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-[72px]" rounded="lg" />
        ))}
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <CardV2 className="px-6 py-12 text-center text-sm text-[hsl(var(--muted))] bg-mesh-brand">
        Карт-поисков ещё нет — запусти первый поиск по нише и городу.
      </CardV2>
    );
  }

  return (
    <ul className="reveal-stack space-y-2">
      {items.map((m) => (
        <li key={`maps-${m.id}`}>
          <CardV2
            interactive
            role="button"
            tabIndex={0}
            onClick={() => router.push(`/app/leads?map_search_id=${m.id}`)}
            onKeyDown={(e: React.KeyboardEvent) => {
              if (e.key === 'Enter')
                router.push(`/app/leads?map_search_id=${m.id}`);
            }}
            className="flex items-center gap-3 px-4 py-3 sm:gap-4 sm:px-5"
          >
            <Map className="h-4 w-4 shrink-0 text-[hsl(var(--accent))]" />
            <div className="min-w-0 flex-1">
              <div
                className="truncate font-display text-[14px] font-semibold text-[hsl(var(--text))]"
                title={`${m.niche} ${m.city}`}
              >
                {m.niche} · {m.city}
              </div>
              <div className="mt-0.5 text-[11px] uppercase tracking-wider text-[hsl(var(--muted))]">
                {formatDateTime(m.created_at)} · {m.sources} ·{' '}
                {m.companies_found ?? 0}{' '}
                {(m.companies_found ?? 0) === 1 ? 'компания' : 'компаний'}
              </div>
            </div>
            <SignalPill tone={statusTone(m.status)} size="sm">
              {statusLabel(m.status)}
            </SignalPill>
            <a
              href={`/api/v1/maps/website-leads/export?search_id=${m.id}&only_website_leads=false`}
              onClick={(e) => e.stopPropagation()}
              title="Скачать Excel (все компании)"
              className="grid h-9 w-9 place-items-center rounded-v2-sm text-[hsl(var(--muted))] hover:bg-[hsl(var(--surface-2))] hover:text-[hsl(var(--text))]"
            >
              <Download className="h-4 w-4" />
            </a>
          </CardV2>
        </li>
      ))}
    </ul>
  );
}

// --- Tab: По сайтам --------------------------------------------------------

function SitesHistoryTab({ router }: { router: ReturnType<typeof useRouter> }) {
  const [runs, setRuns] = useState<SearchResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const PAGE_SIZE = 20;

  const load = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const data = await listSearches({
        limit: PAGE_SIZE,
        offset: p * PAGE_SIZE,
      });
      setRuns(data);
    } catch {
      setRuns([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(page);
  }, [load, page]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleDelete = async (id: number) => {
    if (!confirm('Удалить этот запуск и все его результаты?')) return;
    setDeletingId(id);
    try {
      await deleteSearch(id);
      await load(page);
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-[72px]" rounded="lg" />
        ))}
      </div>
    );
  }
  if (runs.length === 0) {
    return (
      <CardV2 className="px-6 py-12 text-center text-sm text-[hsl(var(--muted))] bg-mesh-brand">
        Поисков по сайтам ещё нет — запусти первый через провайдер.
      </CardV2>
    );
  }

  return (
    <>
      <ul className="reveal-stack space-y-2" ref={menuRef}>
        {runs.map((r, idx) => (
          <li key={r.id}>
            <CardV2
              interactive
              reveal
              role="button"
              tabIndex={0}
              onClick={() => router.push(`/runs/${r.id}`)}
              onKeyDown={(e: React.KeyboardEvent) => {
                if (e.key === 'Enter') router.push(`/runs/${r.id}`);
              }}
              className="flex items-center gap-3 px-4 py-3 sm:gap-4 sm:px-5"
            >
              <span className="hidden w-10 shrink-0 text-center text-[11px] font-medium uppercase tracking-wider text-[hsl(var(--muted))] sm:inline">
                #{String(page * PAGE_SIZE + idx + 1).padStart(2, '0')}
              </span>
              <div className="min-w-0 flex-1">
                <div
                  className="truncate font-display text-[14px] font-semibold text-[hsl(var(--text))]"
                  title={r.query}
                >
                  {r.query}
                </div>
                <div className="mt-0.5 text-[11px] uppercase tracking-wider text-[hsl(var(--muted))]">
                  {formatDateTime(r.created_at)} · {r.search_provider} ·{' '}
                  {r.result_count ?? 0}{' '}
                  {(r.result_count ?? 0) === 1 ? 'лид' : 'лидов'}
                </div>
              </div>
              <SignalPill tone={statusTone(r.status)} size="sm">
                {statusLabel(r.status)}
              </SignalPill>
              <div
                className="flex items-center gap-1.5"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={() => router.push(`/runs/${r.id}`)}
                  className="hidden min-h-9 items-center gap-1 px-2 text-[13px] font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400 sm:inline-flex"
                >
                  <Eye className="h-4 w-4" />
                  Открыть
                </button>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() =>
                      setOpenMenuId(openMenuId === r.id ? null : r.id)
                    }
                    className="grid h-9 w-9 place-items-center rounded-v2-sm text-[hsl(var(--muted))] hover:bg-[hsl(var(--surface-2))] hover:text-[hsl(var(--text))]"
                    aria-label="Меню"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </button>
                  {openMenuId === r.id && (
                    <div
                      className="absolute right-0 top-full z-20 mt-1 min-w-[180px] rounded-v2 border bg-[hsl(var(--surface))] py-1 shadow-v2"
                      style={{ borderColor: 'hsl(var(--border))' }}
                    >
                      {r.status === 'completed' && (
                        <a
                          href={`/api/v1/searches/${r.id}/results/export/csv`}
                          download
                          onClick={() => setOpenMenuId(null)}
                          className="flex items-center gap-2 px-3 py-2 text-sm text-[hsl(var(--text))] hover:bg-[hsl(var(--surface-2))]"
                        >
                          <Download className="h-4 w-4" /> Скачать CSV
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setOpenMenuId(null);
                          handleDelete(r.id);
                        }}
                        disabled={deletingId === r.id}
                        className="flex w-full items-center gap-2 px-3 py-2 text-sm text-[color:var(--signal-hot)] hover:bg-[var(--signal-hot-bg)] disabled:opacity-40"
                      >
                        {deletingId === r.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                        Удалить
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </CardV2>
          </li>
        ))}
      </ul>
      <CardV2 className="mt-4 flex items-center justify-between px-4 py-3 text-sm text-[hsl(var(--muted))]">
        <span>Страница {page + 1}</span>
        <div className="flex gap-2">
          <ButtonV2
            variant="secondary"
            size="sm"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
          >
            ← Назад
          </ButtonV2>
          <ButtonV2
            variant="secondary"
            size="sm"
            onClick={() => setPage((p) => p + 1)}
            disabled={runs.length < PAGE_SIZE}
          >
            Вперёд →
          </ButtonV2>
        </div>
      </CardV2>
    </>
  );
}

// --- Tab: КП ---------------------------------------------------------------

const KP_PAGE_SIZE = 30;

function KpHistoryTab({ router }: { router: ReturnType<typeof useRouter> }) {
  const [items, setItems] = useState<KpDraftListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [openId, setOpenId] = useState<number | null>(null);

  const load = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const r = await listKpDrafts({
        limit: KP_PAGE_SIZE,
        offset: p * KP_PAGE_SIZE,
      });
      setItems(r.items);
      setTotal(r.total);
    } catch {
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(page);
  }, [load, page]);

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-[72px]" rounded="lg" />
        ))}
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <CardV2 className="px-6 py-12 text-center text-sm text-[hsl(var(--muted))] bg-mesh-brand">
        Сгенерированных КП пока нет. Выбери компании в выдаче поиска и нажми
        «Сформировать КП» — все письма появятся здесь.
      </CardV2>
    );
  }

  return (
    <>
      <div className="mb-3 text-[12px] text-[hsl(var(--muted))]">
        Всего КП: {total}
      </div>
      <ul className="reveal-stack space-y-2">
        {items.map((d) => (
          <li key={d.id}>
            <CardV2 className="px-4 py-3 sm:px-5">
              <button
                type="button"
                onClick={() => setOpenId(openId === d.id ? null : d.id)}
                className="flex w-full items-start gap-3 text-left"
              >
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-violet-600" />
                <div className="min-w-0 flex-1">
                  <div
                    className="truncate font-display text-[14px] font-semibold text-[hsl(var(--text))]"
                    title={d.subject}
                  >
                    {d.subject}
                  </div>
                  <div className="mt-0.5 text-[11px] uppercase tracking-wider text-[hsl(var(--muted))]">
                    {formatDateTime(d.created_at)} · {templateLabel(d.template_key)}
                    {d.company_name ? ` · ${d.company_name}` : ''}
                    {d.company_city ? ` · ${d.company_city}` : ''}
                  </div>
                </div>
                {d.company_id && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      router.push(`/app/leads?open_company_id=${d.company_id}`);
                    }}
                    className="hidden min-h-9 items-center gap-1 px-2 text-[13px] font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400 sm:inline-flex"
                    title="Открыть карточку компании"
                  >
                    <Eye className="h-4 w-4" />
                    Компания
                  </button>
                )}
              </button>
              {openId === d.id && (
                <div className="mt-3 whitespace-pre-wrap rounded-v2-sm border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-[13px] leading-relaxed text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                  {d.body_preview}
                  {d.body_preview.length >= 240 && '…'}
                </div>
              )}
            </CardV2>
          </li>
        ))}
      </ul>

      <CardV2 className="mt-4 flex items-center justify-between px-4 py-3 text-sm text-[hsl(var(--muted))]">
        <span>
          Показано {page * KP_PAGE_SIZE + 1}–
          {Math.min((page + 1) * KP_PAGE_SIZE, total)} из {total}
        </span>
        <div className="flex gap-2">
          <ButtonV2
            variant="secondary"
            size="sm"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
          >
            ← Назад
          </ButtonV2>
          <ButtonV2
            variant="secondary"
            size="sm"
            onClick={() => setPage((p) => p + 1)}
            disabled={(page + 1) * KP_PAGE_SIZE >= total}
          >
            Вперёд →
          </ButtonV2>
        </div>
      </CardV2>
    </>
  );
}

// --- Tab: Партии КП -------------------------------------------------------

function jobStatusBadge(status: KpJobListItem['status']): {
  label: string;
  cls: string;
} {
  switch (status) {
    case 'queued':
      return { label: 'В очереди', cls: 'bg-slate-100 text-slate-700' };
    case 'running':
      return { label: 'Идёт генерация', cls: 'bg-violet-100 text-violet-700' };
    case 'done':
      return { label: 'Готово', cls: 'bg-emerald-100 text-emerald-700' };
    case 'cancelled':
      return { label: 'Отменено', cls: 'bg-amber-100 text-amber-700' };
    case 'failed':
      return { label: 'Ошибка', cls: 'bg-rose-100 text-rose-700' };
    default:
      return { label: status, cls: 'bg-slate-100 text-slate-700' };
  }
}

function KpJobsHistoryTab({
  router,
}: {
  router: ReturnType<typeof useRouter>;
}) {
  const [items, setItems] = useState<KpJobListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await listKpJobs(50);
      setItems(r.items);
    } catch (e: any) {
      setError(e?.message || 'Не удалось загрузить партии.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-[64px]" rounded="lg" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <CardV2 className="px-6 py-10 text-center text-sm text-rose-700">
        {error}
      </CardV2>
    );
  }

  if (items.length === 0) {
    return (
      <CardV2 className="px-6 py-12 text-center text-sm text-[hsl(var(--muted))] bg-mesh-brand">
        Партий КП пока нет. Выбери компании в выдаче поиска и нажми
        «Сформировать КП» — каждая партия попадёт сюда отдельной строкой.
      </CardV2>
    );
  }

  return (
    <ul className="space-y-2">
      {items.map((j) => {
        const badge = jobStatusBadge(j.status);
        const total = j.total || 0;
        const progressPct =
          total > 0
            ? Math.min(
                100,
                Math.round(((j.generated + j.failed) / total) * 100),
              )
            : 0;
        return (
          <li key={j.id}>
            <CardV2 className="overflow-hidden">
              <button
                type="button"
                onClick={() => router.push(`/app/leads/kp-jobs/${j.id}`)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[hsl(var(--surface-2))]"
              >
                <Sparkles className="h-4 w-4 shrink-0 text-violet-600" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-display text-[14px] font-semibold text-[hsl(var(--text))]">
                      Партия #{j.id}
                    </span>
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-[11px] font-medium',
                        badge.cls,
                      )}
                    >
                      {badge.label}
                    </span>
                    <span className="text-[12px] text-[hsl(var(--muted))]">
                      {templateLabel(j.template_key)}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[11px] uppercase tracking-wider text-[hsl(var(--muted))]">
                    {formatDateTime(j.created_at)} ·{' '}
                    {j.generated + j.failed}/{total}
                    {j.failed > 0 && (
                      <span className="ml-1 text-rose-600">
                        · ошибок {j.failed}
                      </span>
                    )}
                  </div>
                  {(j.status === 'queued' || j.status === 'running') && (
                    <div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div
                        className="h-full bg-violet-600 transition-all"
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                  )}
                </div>
                <span className="shrink-0 text-[12px] font-medium text-violet-700">
                  Открыть →
                </span>
              </button>
            </CardV2>
          </li>
        );
      })}
    </ul>
  );
}

// --- Tab: Отправки ---------------------------------------------------------

const SEND_PAGE_SIZE = 50;

const CHANNEL_META: Record<
  KpSendChannel,
  { label: string; Icon: React.ComponentType<{ className?: string }> }
> = {
  email: { label: 'Email', Icon: Mail },
  telegram: { label: 'Telegram', Icon: Send },
  whatsapp: { label: 'WhatsApp', Icon: MessageCircle },
  sms: { label: 'SMS', Icon: MessageCircle },
  max: { label: 'MAX', Icon: MessageCircle },
};

const SEND_STATUS_META: Record<
  KpSendStatus,
  { label: string; tone: 'good' | 'hot' | 'warm' | 'muted' }
> = {
  queued: { label: 'В очереди', tone: 'muted' },
  sending: { label: 'Идёт отправка', tone: 'warm' },
  sent: { label: 'Отправлено', tone: 'good' },
  failed: { label: 'Ошибка', tone: 'hot' },
  skipped: { label: 'Пропущено', tone: 'muted' },
};

function KpSendsHistoryTab({
  router,
}: {
  router: ReturnType<typeof useRouter>;
}) {
  const [items, setItems] = useState<KpSendListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (p: number) => {
    setLoading(true);
    setError(null);
    try {
      const r = await listKpSends({
        limit: SEND_PAGE_SIZE,
        offset: p * SEND_PAGE_SIZE,
      });
      setItems(r.items);
      setTotal(r.total);
    } catch (e: any) {
      setError(e?.message || 'Не удалось загрузить отправки.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(page);
  }, [load, page]);

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-[64px]" rounded="lg" />
        ))}
      </div>
    );
  }
  if (error) {
    return (
      <CardV2 className="px-6 py-10 text-center text-sm text-rose-700">
        {error}
      </CardV2>
    );
  }
  if (items.length === 0) {
    return (
      <CardV2 className="px-6 py-12 text-center text-sm text-[hsl(var(--muted))] bg-mesh-brand">
        Отправок пока нет. Открой партию КП в «Партиях КП», выбери каналы и
        нажми «Отправить» — попытки появятся здесь.
      </CardV2>
    );
  }

  return (
    <>
      <div className="mb-3 text-[12px] text-[hsl(var(--muted))]">
        Всего отправок: {total}
      </div>
      <ul className="space-y-2">
        {items.map((s) => {
          const ch = CHANNEL_META[s.channel];
          const st = SEND_STATUS_META[s.status];
          return (
            <li key={s.id}>
              <CardV2 className="px-4 py-3 sm:px-5">
                <div className="flex flex-wrap items-start gap-3">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-200">
                    <ch.Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className="truncate font-display text-[14px] font-semibold text-[hsl(var(--text))]"
                        title={s.subject || ''}
                      >
                        {s.subject || `КП #${s.draft_id}`}
                      </span>
                      <SignalPill tone={st.tone} size="sm">
                        {st.label}
                      </SignalPill>
                    </div>
                    <div className="mt-0.5 text-[11px] uppercase tracking-wider text-[hsl(var(--muted))]">
                      {formatDateTime(s.created_at)} · {ch.label}
                      {s.recipient ? ` → ${s.recipient}` : ''}
                      {s.company_name ? ` · ${s.company_name}` : ''}
                      {s.company_city ? ` · ${s.company_city}` : ''}
                    </div>
                    {s.error_message && (
                      <div
                        className="mt-1 truncate text-[12px] text-rose-700"
                        title={s.error_message}
                      >
                        {s.error_message}
                      </div>
                    )}
                  </div>
                  {s.job_id && (
                    <button
                      type="button"
                      onClick={() =>
                        router.push(`/app/leads/kp-jobs/${s.job_id}`)
                      }
                      className="shrink-0 text-[12px] font-medium text-violet-700 underline-offset-2 hover:underline"
                    >
                      Партия #{s.job_id} →
                    </button>
                  )}
                </div>
              </CardV2>
            </li>
          );
        })}
      </ul>

      <CardV2 className="mt-4 flex items-center justify-between px-4 py-3 text-sm text-[hsl(var(--muted))]">
        <span>
          Показано {page * SEND_PAGE_SIZE + 1}–
          {Math.min((page + 1) * SEND_PAGE_SIZE, total)} из {total}
        </span>
        <div className="flex gap-2">
          <ButtonV2
            variant="secondary"
            size="sm"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
          >
            ← Назад
          </ButtonV2>
          <ButtonV2
            variant="secondary"
            size="sm"
            onClick={() => setPage((p) => p + 1)}
            disabled={(page + 1) * SEND_PAGE_SIZE >= total}
          >
            Вперёд →
          </ButtonV2>
        </div>
      </CardV2>
    </>
  );
}
