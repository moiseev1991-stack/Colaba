'use client';

/**
 * Страница bulk-партии КП (2026-06-20, переработка после фидбэка).
 *
 * Открывается в новой вкладке после setup-страницы или из вкладки
 * «Партии КП» в /history. Persistent URL — можно открыть позже.
 *
 * Содержимое:
 *   - Шапка: статус job'а, прогресс-бар «N/M», тон, шаблон, дата.
 *   - Таблица всех компаний партии с per-row статусом
 *     (в очереди / генерируется / готово / ошибка). Подгружается
 *     поллингом каждые 2.5 сек пока job в running/queued.
 *   - Клик по строке со статусом 'done' → правый Drawer с темой/телом
 *     и кнопкой «Сохранить» (PATCH /outreach/kp/drafts/{id}).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  AtSign,
  Check,
  Copy,
  Loader2,
  Mail,
  MailX,
  MessageCircle,
  Pencil,
  Send,
  Sparkles,
  X,
} from 'lucide-react';

import { ButtonV2 } from '@/components/ui/ButtonV2';
import { CardV2 } from '@/components/ui/CardV2';
import { CompanyAvatar } from '@/components/CompanyAvatar';
import { SignalPill, type SignalTone } from '@/components/ui/SignalPill';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/utils';
import {
  getKpJobItems,
  getKpJobSendStatus,
  sendKpJob,
  updateKpDraft,
  type KpBulkJob,
  type KpJobItem,
  type KpJobItemStatus,
  type KpJobSendStatus,
  type KpSendChannel,
} from '@/src/services/api/outreach-kp';

const TEMPLATE_LABELS: Record<string, string> = {
  webstudio: 'Веб-студия',
  seo: 'SEO',
  marketing: 'Маркетинг',
  custom: 'Свой шаблон',
};

function templateLabel(key: string | null | undefined): string {
  if (!key) return '—';
  return TEMPLATE_LABELS[key] || key;
}

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

function jobStatusLabel(status: KpBulkJob['status']): string {
  switch (status) {
    case 'queued':
      return 'В очереди';
    case 'running':
      return 'Идёт генерация';
    case 'done':
      return 'Готово';
    case 'cancelled':
      return 'Отменено';
    case 'failed':
      return 'Ошибка';
    default:
      return status;
  }
}

const ROW_STATUS_META: Record<
  KpJobItemStatus,
  { label: string; tone: SignalTone; pulse?: boolean }
> = {
  queued:  { label: 'В очереди',    tone: 'muted' },
  running: { label: 'Генерируется', tone: 'cool', pulse: true },
  done:    { label: 'Готово',       tone: 'good' },
  failed:  { label: 'Ошибка',       tone: 'hot' },
};

interface PageProps {
  // Next.js 14: params — обычный объект, без Promise. В Next 15 пришлось бы
  // оборачивать в use(params) — но проект на 14.2.20, и use(non-Promise)
  // бросает throw → AppErrorBoundary показывает «Что-то пошло не так».
  params: { id: string };
}

export default function KpJobPage({ params }: PageProps) {
  const jobId = Number(params.id);

  const [job, setJob] = useState<KpBulkJob | null>(null);
  const [items, setItems] = useState<KpJobItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [drawerCompanyId, setDrawerCompanyId] = useState<number | null>(null);
  const drawerItem = useMemo(
    () =>
      drawerCompanyId !== null
        ? items.find((it) => it.company_id === drawerCompanyId) ?? null
        : null,
    [drawerCompanyId, items],
  );

  const load = useCallback(async () => {
    if (!Number.isFinite(jobId) || jobId <= 0) {
      setError('Неверный идентификатор партии.');
      setLoading(false);
      return;
    }
    try {
      const r = await getKpJobItems(jobId);
      setJob(r.job);
      setItems(r.items);
      setError(null);
    } catch (e: any) {
      const status = e?.response?.status;
      if (status === 404) {
        setError('Партия не найдена или принадлежит другому пользователю.');
      } else {
        setError(e?.message || 'Не удалось загрузить партию.');
      }
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Polling пока job не в терминале. 2.5 сек — баланс между «видно
  // обновление прогресса» и нагрузкой на бэк.
  useEffect(() => {
    if (!job) return;
    if (
      job.status === 'done' ||
      job.status === 'cancelled' ||
      job.status === 'failed'
    ) {
      return;
    }
    const t = setTimeout(() => {
      void load();
    }, 2500);
    return () => clearTimeout(t);
  }, [job, load]);

  function handleItemPatched(companyId: number, updates: Partial<KpJobItem>) {
    setItems((prev) =>
      prev.map((it) =>
        it.company_id === companyId ? { ...it, ...updates } : it,
      ),
    );
  }

  const progressPct =
    job && job.total > 0
      ? Math.min(
          100,
          Math.round(((job.generated + job.failed) / job.total) * 100),
        )
      : 0;

  // --- Render
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-4">
        <h1 className="font-display text-[22px] font-semibold tracking-tight text-[hsl(var(--text))]">
          <Sparkles className="mr-1.5 inline h-5 w-5 -translate-y-0.5 text-violet-600" />
          Партия КП{job ? ` #${job.id}` : ''}
        </h1>
        {job && (
          <p className="mt-1 text-[12px] text-[hsl(var(--muted))]">
            {templateLabel(job.template_key)} · тон:{' '}
            {job.tone === 'bold' ? 'уверенный' : 'нейтральный'} ·{' '}
            {formatDateTime(job.created_at)}
          </p>
        )}
      </div>

      {/* Progress */}
      {job && (
        <CardV2 className="mb-5 px-4 py-3">
          <div className="mb-2 flex flex-wrap items-center gap-3 text-[13px]">
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-[11px] font-medium',
                job.status === 'done' && 'bg-emerald-100 text-emerald-700',
                job.status === 'running' && 'bg-violet-100 text-violet-700',
                job.status === 'cancelled' && 'bg-amber-100 text-amber-700',
                job.status === 'failed' && 'bg-rose-100 text-rose-700',
                job.status === 'queued' && 'bg-slate-100 text-slate-700',
              )}
            >
              {jobStatusLabel(job.status)}
            </span>
            <span className="text-[hsl(var(--text))]">
              {job.generated + job.failed} / {job.total}
            </span>
            {job.failed > 0 && (
              <span className="text-rose-600">с ошибкой: {job.failed}</span>
            )}
            <span className="ml-auto font-medium tabular-nums text-[hsl(var(--text))]">
              {progressPct}%
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div
              className={cn(
                'h-full transition-all duration-500',
                job.status === 'failed'
                  ? 'bg-rose-500'
                  : job.status === 'cancelled'
                    ? 'bg-amber-500'
                    : 'bg-brand-gradient',
              )}
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </CardV2>
      )}

      {job?.status === 'failed' && job?.error_message && (
        <CardV2 className="mb-4 border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-700">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <div className="font-medium">Задача завершилась с ошибкой</div>
              <div className="mt-0.5">{job.error_message}</div>
            </div>
          </div>
        </CardV2>
      )}

      {/* Table */}
      {loading && (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-[52px]" rounded="md" />
          ))}
        </div>
      )}

      {!loading && error && (
        <CardV2 className="px-6 py-10 text-center text-sm text-rose-700">
          {error}
        </CardV2>
      )}

      {!loading && !error && items.length === 0 && (
        <CardV2 className="px-6 py-10 text-center text-sm text-[hsl(var(--muted))]">
          В этой партии нет компаний.
        </CardV2>
      )}

      {!loading && !error && items.length > 0 && (
        <>
          {/* Desktop / tablet — табличный вид. На <sm уходит на мобильные
              карточки ниже (table prerender'ится, но скрыт). */}
          <CardV2 className="hidden overflow-hidden p-0 sm:block">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[13px]">
                <colgroup>
                  <col className="w-10" />
                  <col />
                  <col className="w-28" />
                  <col className="w-32" />
                  <col />
                  <col className="w-52" />
                  <col className="w-24" />
                </colgroup>
                <thead className="sticky top-0 z-10">
                  <tr className="border-b border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] text-left text-[11px] uppercase tracking-wider text-[hsl(var(--muted))]">
                    <th className="px-3 py-2 font-medium">#</th>
                    <th className="px-3 py-2 font-medium">Компания</th>
                    <th className="px-3 py-2 font-medium">Город</th>
                    <th className="px-3 py-2 font-medium">Статус</th>
                    <th className="px-3 py-2 font-medium">Тема КП</th>
                    <th className="px-3 py-2 font-medium">Кому</th>
                    <th className="px-3 py-2 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, idx) => {
                    const meta = ROW_STATUS_META[it.status];
                    const clickable =
                      it.status === 'done' || it.draft_id !== null;
                    const hasRecipient = !!it.recipient_email;
                    return (
                      <tr
                        key={`${it.company_id}-${idx}`}
                        className={cn(
                          'border-b border-[hsl(var(--border))] last:border-b-0 transition-colors',
                          clickable
                            ? 'cursor-pointer hover:bg-[hsl(var(--surface-2))]'
                            : '',
                          idx % 2 === 1 && 'bg-[hsl(var(--surface-2))]/40',
                          drawerCompanyId === it.company_id &&
                            'bg-violet-50/60 dark:bg-violet-950/30',
                        )}
                        onClick={
                          clickable
                            ? () => setDrawerCompanyId(it.company_id)
                            : undefined
                        }
                      >
                        <td className="px-3 py-2.5 text-[11px] tabular-nums text-[hsl(var(--muted))]">
                          {idx + 1}
                        </td>
                        <td className="max-w-0 px-3 py-2.5">
                          <div className="flex min-w-0 items-center gap-2">
                            <CompanyAvatar
                              name={it.company_name}
                              logoUrl={it.company_logo_url}
                              size={28}
                            />
                            <div className="flex min-w-0 items-center gap-1.5">
                              {it.company_legal_short && (
                                <span
                                  className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                                  title={it.company_legal_short}
                                >
                                  {it.company_legal_short}
                                </span>
                              )}
                              <span
                                className="truncate font-medium text-[hsl(var(--text))]"
                                title={it.company_name || undefined}
                              >
                                {it.company_name || `Компания #${it.company_id}`}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-[hsl(var(--muted))]">
                          <span
                            className="truncate"
                            title={it.company_city || ''}
                          >
                            {it.company_city || '—'}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5">
                          <SignalPill
                            tone={meta.tone}
                            size="sm"
                            className={meta.pulse ? 'animate-pulse' : ''}
                          >
                            {meta.label}
                          </SignalPill>
                        </td>
                        <td className="max-w-0 px-3 py-2.5 text-[hsl(var(--text))]">
                          {it.subject ? (
                            <span
                              className="block truncate"
                              title={it.subject}
                            >
                              {it.subject}
                            </span>
                          ) : (
                            <span className="text-[hsl(var(--muted))]">—</span>
                          )}
                        </td>
                        <td className="max-w-0 px-3 py-2.5">
                          {hasRecipient ? (
                            <span
                              className="inline-flex max-w-full items-center gap-1 truncate rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                              title={it.recipient_email!}
                            >
                              <AtSign className="h-3 w-3 shrink-0 text-slate-400" />
                              <span className="truncate">
                                {it.recipient_email}
                              </span>
                            </span>
                          ) : (
                            <span
                              className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700 dark:border-amber-700/40 dark:bg-amber-900/30 dark:text-amber-200"
                              title="У компании не найден email — это КП пока не уйдёт"
                            >
                              <MailX className="h-3 w-3 shrink-0" />
                              нет контакта
                            </span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right">
                          {clickable && (
                            <span className="text-[12px] font-medium text-violet-700 underline-offset-2 hover:underline">
                              Открыть
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardV2>

          {/* Mobile — карточки вместо таблицы (горизонтальный скролл уродует). */}
          <div className="space-y-2 sm:hidden">
            {items.map((it, idx) => {
              const meta = ROW_STATUS_META[it.status];
              const clickable =
                it.status === 'done' || it.draft_id !== null;
              const hasRecipient = !!it.recipient_email;
              return (
                <CardV2
                  key={`m-${it.company_id}-${idx}`}
                  interactive={clickable}
                  onClick={
                    clickable
                      ? () => setDrawerCompanyId(it.company_id)
                      : undefined
                  }
                  className={cn(
                    'p-3',
                    drawerCompanyId === it.company_id &&
                      'border-violet-300 bg-violet-50/60 dark:bg-violet-950/30',
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 flex-1 items-start gap-2">
                      <CompanyAvatar
                        name={it.company_name}
                        logoUrl={it.company_logo_url}
                        size={32}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] tabular-nums text-[hsl(var(--muted))]">
                            #{idx + 1}
                          </span>
                          {it.company_legal_short && (
                            <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                              {it.company_legal_short}
                            </span>
                          )}
                          <span
                            className="truncate font-medium text-[hsl(var(--text))]"
                            title={it.company_name || undefined}
                          >
                            {it.company_name || `Компания #${it.company_id}`}
                          </span>
                        </div>
                        {it.company_city && (
                          <div className="mt-0.5 text-[11px] text-[hsl(var(--muted))]">
                            {it.company_city}
                          </div>
                        )}
                      </div>
                    </div>
                    <SignalPill
                      tone={meta.tone}
                      size="sm"
                      className={meta.pulse ? 'animate-pulse' : ''}
                    >
                      {meta.label}
                    </SignalPill>
                  </div>
                  {it.subject && (
                    <div className="mt-2 line-clamp-2 text-[12.5px] text-[hsl(var(--text))]">
                      {it.subject}
                    </div>
                  )}
                  <div className="mt-2 flex items-center justify-between gap-2">
                    {hasRecipient ? (
                      <span
                        className="inline-flex min-w-0 items-center gap-1 truncate rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                        title={it.recipient_email!}
                      >
                        <AtSign className="h-3 w-3 shrink-0 text-slate-400" />
                        <span className="truncate">{it.recipient_email}</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700 dark:border-amber-700/40 dark:bg-amber-900/30 dark:text-amber-200">
                        <MailX className="h-3 w-3" />
                        нет контакта
                      </span>
                    )}
                    {clickable && (
                      <span className="shrink-0 text-[12px] font-medium text-violet-700">
                        Открыть →
                      </span>
                    )}
                  </div>
                </CardV2>
              );
            })}
          </div>
        </>
      )}

      {/* Sticky bottom bar. Появляется при job.status === 'done' — всегда
          в зоне видимости даже на длинных таблицах. Email включён реально
          через EmailService; остальные каналы (TG/WA/MAX) создают строки
          'skipped' до коннекторов — UI помечает их как «в работе».
          withRecipientCount: сколько готовых КП с валидным email — кнопка
          «Отправить» дизейблится если ноль. */}
      {!loading && !error && job?.status === 'done' && items.length > 0 && (
        <SendBar
          jobId={jobId}
          doneCount={items.filter((it) => it.status === 'done').length}
          withRecipientCount={
            items.filter(
              (it) => it.status === 'done' && !!it.recipient_email,
            ).length
          }
          missingRecipientCount={
            items.filter(
              (it) => it.status === 'done' && !it.recipient_email,
            ).length
          }
        />
      )}

      {/* Drawer */}
      {drawerItem && (
        <DraftDrawer
          item={drawerItem}
          onClose={() => setDrawerCompanyId(null)}
          onPatched={(updates) =>
            drawerItem.company_id !== null &&
            handleItemPatched(drawerItem.company_id, updates)
          }
        />
      )}
    </div>
  );
}

// --- Sticky bottom send bar -------------------------------------------------

// Каналы, которые реально шлют. Остальные показываем «в работе» — backend
// создаст для них skipped-строки с error_code='channel_unavailable'.
const WORKING_CHANNELS: KpSendChannel[] = ['email'];

const CHANNELS: {
  key: KpSendChannel;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
}[] = [
  { key: 'email', label: 'Email', Icon: Mail },
  { key: 'telegram', label: 'Telegram', Icon: Send },
  { key: 'whatsapp', label: 'WhatsApp', Icon: MessageCircle },
  { key: 'max', label: 'MAX', Icon: MessageCircle },
];

function SendBar({
  jobId,
  doneCount,
  withRecipientCount,
  missingRecipientCount,
}: {
  jobId: number;
  /** Сколько КП реально готово (status='done'). */
  doneCount: number;
  /** Из готовых — сколько с валидным email. По 0 «Отправить» дизейблится. */
  withRecipientCount: number;
  /** Из готовых — сколько без email (попадут как 'skipped' в kp_sends). */
  missingRecipientCount: number;
}) {
  // Локальный toggle каналов. По умолчанию выбран Email — единственный
  // реально подключенный, остальные после клика стартуют как 'skipped'
  // на бэке (UI помечает их как «коннектор скоро»).
  const [channels, setChannels] = useState<Set<KpSendChannel>>(
    () => new Set(['email']),
  );

  // Состояние реальной отправки.
  const [status, setStatus] = useState<KpJobSendStatus | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(key: KpSendChannel) {
    // Защита от того, чтобы случайно «выбрать» канал, по которому мы
    // не шлём — дублирует disabled-кнопку, но безопаснее иметь и тут.
    if (!WORKING_CHANNELS.includes(key)) return;
    setChannels((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // Первичная загрузка статуса — если страница открыта после
  // предыдущей отправки, сразу показываем «N из M отправлено».
  useEffect(() => {
    let cancelled = false;
    getKpJobSendStatus(jobId)
      .then((s) => {
        if (!cancelled) setStatus(s);
      })
      .catch(() => {
        // 404 / network — игнор, юзер увидит «Отправок ещё не было».
      });
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  // Поллинг пока есть активные отправки. 2.5 сек — баланс между «видно
  // прогресс» и нагрузкой на бэк (тот же темп, что у генерации).
  useEffect(() => {
    if (!status?.is_active) return;
    const t = setTimeout(() => {
      getKpJobSendStatus(jobId)
        .then(setStatus)
        .catch(() => undefined);
    }, 2500);
    return () => clearTimeout(t);
  }, [jobId, status]);

  async function handleSend() {
    if (channels.size === 0 || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const fresh = await sendKpJob(jobId, Array.from(channels));
      setStatus(fresh);
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      setError(
        typeof detail === 'string'
          ? detail
          : e?.message || 'Не удалось поставить отправку в очередь.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  const sentCount = (status?.sent ?? 0) + (status?.failed ?? 0);
  const inFlight = (status?.queued ?? 0) + (status?.sending ?? 0);
  const isActive = !!status?.is_active;
  const hasAnySend = (status?.total ?? 0) > 0;
  // Защита от отправки «в пустоту»: блокируем кнопку если ни у одной
  // готовой компании нет email-а. До этого юзер мог нажать «Отправить»
  // и получить партию из 100% skipped — теперь видит причину сразу.
  const noRecipients = withRecipientCount === 0;
  const buttonDisabled =
    submitting || channels.size === 0 || isActive || noRecipients;

  return (
    // sticky bottom-0 внутри потока страницы (не fixed) — bar прилипает
    // к низу viewport'а пока таблица длиннее экрана и плавно «отпускается»
    // на сайт-футер. pb-safe — учитываем нижнюю safe-area iPhone'а под
    // home-indicator, иначе на мобильном bar частично уходит под полосу.
    <div className="sticky bottom-3 z-30 mt-5 pb-[env(safe-area-inset-bottom)]">
      <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-4 py-3 shadow-[0_8px_24px_-8px_rgba(15,23,42,0.18)] sm:px-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-2">
            <div className="text-[13px] font-semibold text-[hsl(var(--text))]">
              {isActive
                ? `Отправляем: ${status!.sent} из ${status!.total}…`
                : hasAnySend
                  ? `Отправлено: ${status!.sent} · с ошибкой: ${status!.failed}${
                      status!.skipped > 0 ? ` · пропущено: ${status!.skipped}` : ''
                    }`
                  : noRecipients
                    ? `Готово ${doneCount} КП, но ни у одной компании не найден email — отправка пока невозможна`
                    : `Готово ${doneCount} КП · с контактом ${withRecipientCount}${
                        missingRecipientCount > 0
                          ? ` · без email-а: ${missingRecipientCount}`
                          : ''
                      }`}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {CHANNELS.map(({ key, label, Icon }) => {
                const working = WORKING_CHANNELS.includes(key);
                const active = working && channels.has(key);
                // TG/WA/MAX полностью disabled — кликнуть нельзя ни в каком
                // состоянии, чтобы юзер случайно не «выбрал» канал, на
                // который мы пока не шлём. Email остаётся toggle'абельным.
                const lockedSoon = !working;
                const buttonDisabled =
                  lockedSoon || submitting || isActive;
                return (
                  <button
                    key={key}
                    type="button"
                    role="checkbox"
                    aria-checked={active}
                    aria-disabled={lockedSoon || undefined}
                    onClick={lockedSoon ? undefined : () => toggle(key)}
                    disabled={buttonDisabled}
                    title={
                      working
                        ? 'Отправка по email — через настроенный Hyvor/SMTP.'
                        : 'Коннектор скоро: пока шлём только по email.'
                    }
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[12px] font-medium transition-colors',
                      lockedSoon
                        ? 'cursor-not-allowed border-dashed border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-500'
                        : 'disabled:cursor-not-allowed disabled:opacity-60',
                      !lockedSoon && active
                        ? 'border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-700 dark:bg-violet-950/40 dark:text-violet-200'
                        : '',
                      !lockedSoon && !active
                        ? 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400'
                        : '',
                    )}
                  >
                    <span
                      className={cn(
                        'grid h-3.5 w-3.5 place-items-center rounded-sm border',
                        lockedSoon
                          ? 'border-slate-300 bg-slate-100 dark:border-slate-700 dark:bg-slate-800'
                          : active
                            ? 'border-violet-500 bg-violet-500 text-white'
                            : 'border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-900',
                      )}
                    >
                      {active && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
                    </span>
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                    {lockedSoon && (
                      <span className="ml-0.5 rounded bg-slate-200 px-1 text-[10px] font-medium uppercase tracking-wider text-slate-500 dark:bg-slate-700 dark:text-slate-300">
                        скоро
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            {error && (
              <div className="text-[12px] text-rose-700">{error}</div>
            )}
            {status?.last_error && !error && (
              <div
                className="truncate text-[12px] text-rose-700"
                title={status.last_error}
              >
                Последняя ошибка: {status.last_error}
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 lg:shrink-0">
            <ButtonV2
              variant="secondary"
              size="md"
              disabled
              title="Скоро: выгрузка партии в .xlsx со всеми темами и телами писем."
            >
              Скачать .xlsx
            </ButtonV2>
            <ButtonV2
              variant="primary"
              size="md"
              onClick={handleSend}
              disabled={buttonDisabled}
              iconLeft={
                submitting || isActive ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Send />
                )
              }
              title={
                isActive
                  ? 'Сейчас идёт рассылка — дождись окончания.'
                  : noRecipients
                    ? 'Ни у одной готовой КП нет email-а — отправка пока невозможна. Добавь контакты компаниям и попробуй снова.'
                    : 'Шлёт каждое готовое КП по выбранным каналам. История попадает в /history → «Отправки».'
              }
            >
              {isActive
                ? `Отправляется… ${sentCount}/${status!.total}`
                : hasAnySend
                  ? `Дослать (${withRecipientCount - (status?.sent ?? 0)})`
                  : `Отправить (${withRecipientCount})`}
            </ButtonV2>
          </div>
        </div>
        {isActive && (
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div
              className="h-full bg-brand-gradient transition-all duration-500"
              style={{
                width:
                  status!.total > 0
                    ? `${Math.min(100, Math.round((sentCount / status!.total) * 100))}%`
                    : '0%',
              }}
            />
          </div>
        )}
        {!isActive && hasAnySend && inFlight === 0 && (
          <div className="mt-2 text-[11px] text-[hsl(var(--muted))]">
            Полный лог — в <a className="underline" href="/app/leads/history?tab=sends">«Отправки»</a> на странице истории.
          </div>
        )}
      </div>
    </div>
  );
}

// --- Drawer одной КП ---------------------------------------------------------

function DraftDrawer({
  item,
  onClose,
  onPatched,
}: {
  item: KpJobItem;
  onClose: () => void;
  onPatched: (updates: Partial<KpJobItem>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [subject, setSubject] = useState(item.subject ?? '');
  const [body, setBody] = useState(item.body ?? '');
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [copyFlash, setCopyFlash] = useState<'subject' | 'body' | null>(null);

  // Когда юзер кликает на другую КП в таблице — реинициализируем стейты.
  useEffect(() => {
    setSubject(item.subject ?? '');
    setBody(item.body ?? '');
    setEditing(false);
    setSaveError(null);
  }, [item.draft_id, item.subject, item.body]);

  // Закрытие на Esc.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const dirty = subject !== (item.subject ?? '') || body !== (item.body ?? '');

  async function handleSave() {
    if (!item.draft_id || !dirty || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const updated = await updateKpDraft(item.draft_id, {
        subject: subject !== (item.subject ?? '') ? subject.trim() : undefined,
        body: body !== (item.body ?? '') ? body : undefined,
      });
      onPatched({ subject: updated.subject, body: updated.body });
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1500);
      setEditing(false);
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      setSaveError(
        typeof detail === 'string'
          ? detail
          : e?.message || 'Не удалось сохранить.',
      );
    } finally {
      setSaving(false);
    }
  }

  async function copyToClipboard(text: string, what: 'subject' | 'body') {
    try {
      await navigator.clipboard.writeText(text);
      setCopyFlash(what);
      setTimeout(() => setCopyFlash(null), 1200);
    } catch {
      // ignore
    }
  }

  const companyTitle =
    item.company_name || (item.company_id ? `Компания #${item.company_id}` : 'КП');

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-slate-900/30"
        onClick={onClose}
        aria-hidden
      />
      {/* Panel */}
      <aside
        role="dialog"
        aria-label={`КП: ${companyTitle}`}
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col bg-white shadow-2xl dark:bg-slate-900"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[hsl(var(--border))] px-5 py-3">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <CompanyAvatar
              name={item.company_name}
              logoUrl={item.company_logo_url}
              size={40}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                {item.company_legal_short && (
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    {item.company_legal_short}
                  </span>
                )}
                <h2 className="truncate font-display text-[15px] font-semibold text-[hsl(var(--text))]">
                  {companyTitle}
                </h2>
              </div>
              <p className="mt-0.5 text-[11px] uppercase tracking-wider text-[hsl(var(--muted))]">
                {templateLabel(item.template_key)}
                {item.company_city ? ` · ${item.company_city}` : ''}
                {item.draft_created_at
                  ? ` · ${formatDateTime(item.draft_created_at)}`
                  : ''}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {item.draft_id !== null && !editing && (
              <button
                type="button"
                onClick={() => setEditing(true)}
                title="Редактировать тему и тело письма"
                className="inline-flex items-center gap-1 rounded-md border border-violet-200 bg-violet-50 px-2 py-1 text-[12px] font-medium text-violet-700 hover:border-violet-300 hover:bg-violet-100 dark:border-violet-700 dark:bg-violet-950/40 dark:text-violet-200 dark:hover:bg-violet-900/60"
              >
                <Pencil className="h-3.5 w-3.5" />
                Редактировать
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
              aria-label="Закрыть"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {/* Кому уходит — критично, юзер должен видеть до клика
              «Отправить», что КП реально дойдёт. Если email не найден,
              показываем явное предупреждение, чтобы не отправить в пустоту. */}
          <div>
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-[hsl(var(--muted))]">
              Кому
            </label>
            {item.recipient_email ? (
              <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[13px] dark:border-emerald-700/50 dark:bg-emerald-900/30">
                <AtSign className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-300" />
                <div className="min-w-0 flex-1 truncate">
                  <span className="font-medium text-emerald-900 dark:text-emerald-100">
                    {item.recipient_email}
                  </span>
                  <span className="ml-1.5 text-[11px] uppercase tracking-wider text-emerald-700/80 dark:text-emerald-300/80">
                    Email
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-[12.5px] dark:border-amber-700/50 dark:bg-amber-900/30">
                <MailX className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-300" />
                <div className="text-amber-800 dark:text-amber-200">
                  У компании не найден email — этот КП не уйдёт. Добавь
                  контакт в карточке компании, чтобы включить отправку.
                </div>
              </div>
            )}
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between gap-2">
              <label className="block text-[11px] font-medium uppercase tracking-wide text-[hsl(var(--muted))]">
                Тема
              </label>
              {!editing && item.draft_id !== null && (
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="text-[11px] font-medium text-violet-700 hover:underline dark:text-violet-300"
                >
                  Изменить
                </button>
              )}
            </div>
            {editing ? (
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                maxLength={500}
                autoFocus
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-[14px] font-medium text-slate-900 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            ) : (
              <button
                type="button"
                onClick={() => item.draft_id !== null && setEditing(true)}
                disabled={item.draft_id === null}
                title={
                  item.draft_id !== null
                    ? 'Клик — отредактировать тему'
                    : undefined
                }
                className="w-full rounded-md border border-dashed border-slate-200 bg-slate-50 px-3 py-1.5 text-left text-[14px] font-medium text-slate-800 transition-colors hover:border-violet-300 hover:bg-violet-50/50 disabled:cursor-not-allowed disabled:hover:border-slate-200 disabled:hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:border-violet-700 dark:hover:bg-violet-950/30"
              >
                {subject || (
                  <span className="italic text-slate-400">Тема пустая.</span>
                )}
              </button>
            )}
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between gap-2">
              <label className="block text-[11px] font-medium uppercase tracking-wide text-[hsl(var(--muted))]">
                Тело письма
              </label>
              {!editing && item.draft_id !== null && (
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="text-[11px] font-medium text-violet-700 hover:underline dark:text-violet-300"
                >
                  Изменить
                </button>
              )}
            </div>
            {editing ? (
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={Math.max(10, Math.min(28, body.split('\n').length + 2))}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-[13px] leading-relaxed text-slate-800 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            ) : (
              <button
                type="button"
                onClick={() => item.draft_id !== null && setEditing(true)}
                disabled={item.draft_id === null}
                title={
                  item.draft_id !== null
                    ? 'Клик — отредактировать тело письма'
                    : undefined
                }
                className="w-full whitespace-pre-wrap rounded-md border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-left text-[13px] leading-relaxed text-slate-700 transition-colors hover:border-violet-300 hover:bg-violet-50/50 disabled:cursor-not-allowed disabled:hover:border-slate-200 disabled:hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-violet-700 dark:hover:bg-violet-950/30"
              >
                {body || (
                  <span className="italic text-slate-400">
                    Тело письма пустое.
                  </span>
                )}
              </button>
            )}
          </div>

          {saveError && (
            <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700">
              {saveError}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[hsl(var(--border))] px-5 py-3">
          {!editing && (
            <>
              <ButtonV2
                variant="ghost"
                size="sm"
                iconLeft={
                  copyFlash === 'subject' ? (
                    <Check className="text-emerald-600" />
                  ) : (
                    <Copy />
                  )
                }
                onClick={() => copyToClipboard(subject, 'subject')}
              >
                {copyFlash === 'subject' ? 'Скопировано' : 'Тема'}
              </ButtonV2>
              <ButtonV2
                variant="ghost"
                size="sm"
                iconLeft={
                  copyFlash === 'body' ? (
                    <Check className="text-emerald-600" />
                  ) : (
                    <Copy />
                  )
                }
                onClick={() => copyToClipboard(body, 'body')}
              >
                {copyFlash === 'body' ? 'Скопировано' : 'Тело'}
              </ButtonV2>
              {item.draft_id !== null && (
                <ButtonV2
                  variant="primary"
                  size="sm"
                  iconLeft={<Pencil />}
                  onClick={() => setEditing(true)}
                >
                  Редактировать
                </ButtonV2>
              )}
            </>
          )}
          {editing && (
            <>
              <ButtonV2
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSubject(item.subject ?? '');
                  setBody(item.body ?? '');
                  setEditing(false);
                  setSaveError(null);
                }}
                disabled={saving}
              >
                Отмена
              </ButtonV2>
              <ButtonV2
                variant="primary"
                size="sm"
                iconLeft={
                  savedFlash ? (
                    <Check />
                  ) : saving ? (
                    <Loader2 className="animate-spin" />
                  ) : undefined
                }
                onClick={handleSave}
                disabled={!dirty || saving}
              >
                {savedFlash ? 'Сохранено' : 'Сохранить'}
              </ButtonV2>
            </>
          )}
        </div>
      </aside>
    </>
  );
}
