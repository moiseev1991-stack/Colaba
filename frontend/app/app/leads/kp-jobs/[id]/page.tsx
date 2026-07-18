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

import { useCallback, useEffect, useMemo, useState, type MouseEvent } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  AtSign,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  Loader2,
  Mail,
  MailX,
  MessageCircle,
  Pencil,
  Phone,
  PhoneCall,
  Send,
  Sparkles,
  X,
} from 'lucide-react';

import { ButtonV2 } from '@/components/ui/ButtonV2';
import { CardV2 } from '@/components/ui/CardV2';
import { CompanyAvatar } from '@/components/CompanyAvatar';
import { SignalPill, type SignalTone } from '@/components/ui/SignalPill';
import { Skeleton } from '@/components/ui/Skeleton';
import {
  buildTelLink,
  buildWhatsappLink,
  formatPhoneForDisplay,
  isRussianMobile,
  normalizePhoneForWa,
} from '@/lib/phone';
import { cn } from '@/lib/utils';
import { apiClient } from '@/client';
import {
  downloadKpJobCallList,
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
  queued: { label: 'В очереди', tone: 'muted' },
  running: { label: 'Генерируется', tone: 'cool', pulse: true },
  done: { label: 'Готово', tone: 'good' },
  failed: { label: 'Ошибка', tone: 'hot' },
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
        ? (items.find((it) => it.company_id === drawerCompanyId) ?? null)
        : null,
    [drawerCompanyId, items],
  );

  // Per-row send: локальный статус по draft_id ('sending' | 'sent' | error-msg).
  // После reload страницы стирается — это OK, факт отправки виден в SendBar
  // (общий счётчик) и в /history → «Отправки». Локальный state нужен только
  // чтобы внутри одной сессии кнопка не звала send дважды и показывала «✓».
  const [singleSend, setSingleSend] = useState<
    Record<number, 'sending' | 'sent' | { error: string }>
  >({});
  // Bump-token, на который SendBar триггерит refetch — чтобы общий счётчик
  // «Отправлено: N» обновился сразу после per-row отправки, не дожидаясь
  // следующего тика поллинга.
  const [sendBump, setSendBump] = useState(0);

  const handleSendOne = useCallback(
    async (draftId: number) => {
      setSingleSend((prev) => ({ ...prev, [draftId]: 'sending' }));
      try {
        await sendKpJob(jobId, ['email'], [draftId]);
        setSingleSend((prev) => ({ ...prev, [draftId]: 'sent' }));
        setSendBump((n) => n + 1);
      } catch (e: any) {
        const detail = e?.response?.data?.detail;
        const message = typeof detail === 'string' ? detail : e?.message || 'Не удалось отправить.';
        setSingleSend((prev) => ({ ...prev, [draftId]: { error: message } }));
      }
    },
    [jobId],
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
    if (job.status === 'done' || job.status === 'cancelled' || job.status === 'failed') {
      return;
    }
    const t = setTimeout(() => {
      void load();
    }, 2500);
    return () => clearTimeout(t);
  }, [job, load]);

  function handleItemPatched(companyId: number, updates: Partial<KpJobItem>) {
    setItems((prev) =>
      prev.map((it) => (it.company_id === companyId ? { ...it, ...updates } : it)),
    );
  }

  const progressPct =
    job && job.total > 0
      ? Math.min(100, Math.round(((job.generated + job.failed) / job.total) * 100))
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
            {job.tone === 'bold' ? 'уверенный' : 'нейтральный'} · {formatDateTime(job.created_at)}
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
            {job.failed > 0 && <span className="text-rose-600">с ошибкой: {job.failed}</span>}
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

      {job?.status === 'failed' && (
        <CardV2 className="mb-4 border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-700">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <div className="font-medium">Задача завершилась с ошибкой</div>
              <div className="mt-0.5">
                {job.error_message ||
                  'Не удалось сгенерировать КП. Попробуй запустить заново — если ошибка повторится, напиши в поддержку.'}
              </div>
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
        <CardV2 className="px-6 py-10 text-center text-sm text-rose-700">{error}</CardV2>
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
                  <col className="w-44" />
                  <col className="w-36" />
                  <col className="w-24" />
                </colgroup>
                <thead className="sticky top-0 z-10">
                  <tr className="border-b border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] text-left text-[11px] uppercase tracking-wider text-[hsl(var(--muted))]">
                    <th className="px-3 py-2 font-medium">#</th>
                    <th className="px-3 py-2 font-medium">Компания</th>
                    <th className="px-3 py-2 font-medium">Город</th>
                    <th className="px-3 py-2 font-medium">Статус</th>
                    <th className="px-3 py-2 font-medium">Тема КП</th>
                    <th className="px-3 py-2 font-medium">Email</th>
                    <th className="px-3 py-2 font-medium">Телефон</th>
                    <th className="px-3 py-2 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, idx) => {
                    const meta = ROW_STATUS_META[it.status];
                    const clickable = it.status === 'done' || it.draft_id !== null;
                    const hasRecipient = !!it.recipient_email;
                    // Телефон обрабатываем независимо от email: даже если КП
                    // уйдёт по email, юзеру полезно видеть номер компании в
                    // отдельной колонке «Телефон» (быстрый звонок/WA).
                    const hasMobile = isRussianMobile(it.company_phone);
                    const waLink = hasMobile
                      ? buildWhatsappLink(
                          it.company_phone,
                          it.body ? `${it.subject ? `${it.subject}\n\n` : ''}${it.body}` : null,
                        )
                      : null;
                    const telLink = !hasMobile ? buildTelLink(it.company_phone) : null;
                    const phoneDisplay = it.company_phone
                      ? formatPhoneForDisplay(it.company_phone)
                      : '';
                    return (
                      <tr
                        key={`${it.company_id}-${idx}`}
                        className={cn(
                          'border-b border-[hsl(var(--border))] last:border-b-0 transition-colors',
                          clickable ? 'cursor-pointer hover:bg-[hsl(var(--surface-2))]' : '',
                          idx % 2 === 1 && 'bg-[hsl(var(--surface-2))]/40',
                          drawerCompanyId === it.company_id &&
                            'bg-violet-50/60 dark:bg-violet-950/30',
                        )}
                        onClick={clickable ? () => setDrawerCompanyId(it.company_id) : undefined}
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
                          <span className="truncate" title={it.company_city || ''}>
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
                            <span className="block truncate" title={it.subject}>
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
                              <span className="truncate">{it.recipient_email}</span>
                            </span>
                          ) : (
                            <span
                              className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700 dark:border-amber-700/40 dark:bg-amber-900/30 dark:text-amber-200"
                              title="У компании не найден email — КП по почте не уйдёт"
                            >
                              <MailX className="h-3 w-3 shrink-0" />
                              нет email
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          {waLink ? (
                            // Мобильный номер РФ → wa.me с pre-filled телом КП.
                            // Открывается в новой вкладке, юзер докручивает
                            // руками (bulk-канала WhatsApp пока нет).
                            <a
                              href={waLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-800 transition-colors hover:border-emerald-400 hover:bg-emerald-100 dark:border-emerald-700/50 dark:bg-emerald-900/30 dark:text-emerald-200 dark:hover:bg-emerald-900/60"
                              title={`Открыть WhatsApp: ${phoneDisplay}`}
                            >
                              <Phone className="h-3 w-3 shrink-0" />
                              <span className="truncate">{phoneDisplay}</span>
                            </a>
                          ) : telLink ? (
                            // Городской номер (8-495 и т.п.) — в WhatsApp его
                            // нет, открываем звонилку tel:. На desktop без
                            // SIP-клиента — просто покажет диалог.
                            <a
                              href={telLink}
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-slate-50 px-1.5 py-0.5 text-[11px] font-medium text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                              title={`Позвонить: ${phoneDisplay}`}
                            >
                              <Phone className="h-3 w-3 shrink-0" />
                              <span className="truncate">{phoneDisplay}</span>
                            </a>
                          ) : (
                            <span className="text-[11px] text-[hsl(var(--muted))]">—</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {it.draft_id !== null &&
                              hasRecipient &&
                              (() => {
                                const eff = computeRowSendState(
                                  singleSend[it.draft_id],
                                  it.email_send_status,
                                );
                                return (
                                  <RowSendButton
                                    state={eff}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (eff === 'sending' || eff === 'sent') return;
                                      void handleSendOne(it.draft_id!);
                                    }}
                                  />
                                );
                              })()}
                            {clickable && (
                              <span className="text-[12px] font-medium text-violet-700 underline-offset-2 hover:underline">
                                Открыть
                              </span>
                            )}
                          </div>
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
              const clickable = it.status === 'done' || it.draft_id !== null;
              const hasRecipient = !!it.recipient_email;
              const hasMobile = isRussianMobile(it.company_phone);
              const waLink = hasMobile
                ? buildWhatsappLink(
                    it.company_phone,
                    it.body ? `${it.subject ? `${it.subject}\n\n` : ''}${it.body}` : null,
                  )
                : null;
              const telLink = !hasMobile ? buildTelLink(it.company_phone) : null;
              const phoneDisplay = it.company_phone ? formatPhoneForDisplay(it.company_phone) : '';
              return (
                <CardV2
                  key={`m-${it.company_id}-${idx}`}
                  interactive={clickable}
                  onClick={clickable ? () => setDrawerCompanyId(it.company_id) : undefined}
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
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
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
                        нет email
                      </span>
                    )}
                    {waLink ? (
                      <a
                        href={waLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-800 hover:border-emerald-400 hover:bg-emerald-100 dark:border-emerald-700/50 dark:bg-emerald-900/30 dark:text-emerald-200"
                      >
                        <Phone className="h-3 w-3" />
                        {phoneDisplay}
                      </a>
                    ) : telLink ? (
                      <a
                        href={telLink}
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-slate-50 px-1.5 py-0.5 text-[11px] font-medium text-slate-700 hover:border-slate-400 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
                      >
                        <Phone className="h-3 w-3" />
                        {phoneDisplay}
                      </a>
                    ) : null}
                    <div className="ml-auto flex shrink-0 items-center gap-2">
                      {it.draft_id !== null &&
                        hasRecipient &&
                        (() => {
                          const eff = computeRowSendState(
                            singleSend[it.draft_id],
                            it.email_send_status,
                          );
                          return (
                            <RowSendButton
                              state={eff}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (eff === 'sending' || eff === 'sent') return;
                                void handleSendOne(it.draft_id!);
                              }}
                            />
                          );
                        })()}
                      {clickable && (
                        <span className="text-[12px] font-medium text-violet-700">Открыть →</span>
                      )}
                    </div>
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
        <SendBar jobId={jobId} items={items} refetchToken={sendBump} />
      )}

      {/* Drawer */}
      {drawerItem && (
        <DraftDrawer
          item={drawerItem}
          onClose={() => setDrawerCompanyId(null)}
          onPatched={(updates) =>
            drawerItem.company_id !== null && handleItemPatched(drawerItem.company_id, updates)
          }
          singleSendState={computeRowSendState(
            drawerItem.draft_id !== null ? singleSend[drawerItem.draft_id] : undefined,
            drawerItem.email_send_status,
          )}
          onSendOne={
            drawerItem.draft_id !== null && drawerItem.recipient_email
              ? () => handleSendOne(drawerItem.draft_id!)
              : undefined
          }
        />
      )}
    </div>
  );
}

// --- Sticky bottom send bar -------------------------------------------------

// Конфиг каналов отправки.
//
// `working` — реально доставляет (backend имеет коннектор):
//   - email через Hyvor/SMTP (всегда работает на проде)
//   - whatsapp через GreenAPI (если GREENAPI_INSTANCE_ID/TOKEN в env)
// `priority` — порядок в режиме «один лучший канал на компанию»:
//   на компанию с email уходит email; без email но с мобильным РФ — WhatsApp.
// `eligible(item)` — есть ли у компании контакт для этого канала.
//
// Чекбоксы каналов в UI юзер может снять, чтобы временно отключить
// конкретный канал (например, GreenAPI-инстанс отвалился). Снятый канал
// убирает соответствующие компании из счётчика «Отправить всем».
type ChannelDef = {
  key: KpSendChannel;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  working: boolean;
  priority: number; // 1 = высший, для one-per-company-режима
  eligible: (item: KpJobItem) => boolean;
  emptyHint: string; // подсказка под счётчиком, если 0 eligible
};

const CHANNEL_DEFS: ChannelDef[] = [
  {
    key: 'email',
    label: 'Email',
    Icon: Mail,
    working: true,
    priority: 1,
    eligible: (it) => !!it.recipient_email,
    emptyHint: 'Ни у одной готовой компании не нашли email.',
  },
  {
    key: 'whatsapp',
    label: 'WhatsApp',
    Icon: MessageCircle,
    working: true,
    priority: 2,
    eligible: (it) => isRussianMobile(it.company_phone),
    emptyHint: 'Нет компаний с мобильным РФ-номером (WhatsApp требует мобильный).',
  },
  {
    key: 'telegram',
    label: 'Telegram',
    Icon: Send,
    working: true,
    priority: 3,
    eligible: (it: KpJobItem) => !!it.recipient_telegram,
    emptyHint: 'Лид должен нажать /start в нашем Telegram-боте.',
  },
  {
    key: 'sms',
    label: 'SMS',
    Icon: MessageCircle,
    working: true,
    priority: 4,
    eligible: (it) => isRussianMobile(it.company_phone),
    emptyHint: 'Нет компаний с мобильным РФ-номером (SMS.ru не принимает городские).',
  },
  {
    key: 'max',
    label: 'MAX',
    Icon: MessageCircle,
    working: false,
    priority: 5,
    eligible: () => false,
    emptyHint: 'Публичного API у MAX пока нет — ждём.',
  },
];

const CHANNEL_BY_KEY: Record<KpSendChannel, ChannelDef> = Object.fromEntries(
  CHANNEL_DEFS.map((c) => [c.key, c]),
) as Record<KpSendChannel, ChannelDef>;

/**
 * Группирует готовые драфты по тому, в какой канал они уйдут в режиме
 * «один лучший канал на компанию». Проходим компании, для каждой
 * выбираем первый enabled+working+eligible канал по priority.
 *
 * Возвращает Map<channel, draftIds[]> + список компаний, которым ни
 * один канал не подошёл (они попадут в «на обзвон» / «без контактов»).
 */
function planOnePerCompany(
  items: KpJobItem[],
  enabled: Set<KpSendChannel>,
): { byChannel: Map<KpSendChannel, number[]>; uncovered: KpJobItem[] } {
  const sortedChannels = CHANNEL_DEFS.filter((c) => c.working && enabled.has(c.key)).sort(
    (a, b) => a.priority - b.priority,
  );
  const byChannel = new Map<KpSendChannel, number[]>();
  const uncovered: KpJobItem[] = [];
  for (const it of items) {
    if (it.status !== 'done' || it.draft_id === null) continue;
    const pick = sortedChannels.find((c) => c.eligible(it));
    if (!pick) {
      uncovered.push(it);
      continue;
    }
    const list = byChannel.get(pick.key) ?? [];
    list.push(it.draft_id);
    byChannel.set(pick.key, list);
  }
  return { byChannel, uncovered };
}

/**
 * Какой канал пойдёт компании в режиме «один лучший канал». Возвращает:
 *   - key канала, который реально получит ('email' | 'whatsapp')
 *   - 'callable' — нет email/WA, но есть телефон → попадёт в xlsx «обзвон»
 *   - 'none'     — ни одного контакта вообще.
 *
 * Используется в раскрывающемся списке «Кто получит КП» внутри SendBar.
 */
function getOneChannelForItem(
  item: KpJobItem,
  enabled: Set<KpSendChannel>,
): KpSendChannel | 'callable' | 'none' {
  const sorted = CHANNEL_DEFS.filter((c) => c.working && enabled.has(c.key)).sort(
    (a, b) => a.priority - b.priority,
  );
  for (const c of sorted) {
    if (c.eligible(item)) return c.key;
  }
  const digits = normalizePhoneForWa(item.company_phone);
  if (digits) return 'callable';
  return 'none';
}

/**
 * Группирует драфты по «во все каналы»: компания получит сообщение
 * по КАЖДОМУ enabled+working каналу, для которого у неё есть адрес.
 * Может быть несколько отправок на одну компанию.
 */
function planAllChannels(
  items: KpJobItem[],
  enabled: Set<KpSendChannel>,
): { byChannel: Map<KpSendChannel, number[]>; uncovered: KpJobItem[] } {
  const activeChannels = CHANNEL_DEFS.filter((c) => c.working && enabled.has(c.key));
  const byChannel = new Map<KpSendChannel, number[]>();
  const uncovered: KpJobItem[] = [];
  for (const it of items) {
    if (it.status !== 'done' || it.draft_id === null) continue;
    let anyHit = false;
    for (const c of activeChannels) {
      if (!c.eligible(it)) continue;
      anyHit = true;
      const list = byChannel.get(c.key) ?? [];
      list.push(it.draft_id);
      byChannel.set(c.key, list);
    }
    if (!anyHit) uncovered.push(it);
  }
  return { byChannel, uncovered };
}

function SendBar({
  jobId,
  items,
  refetchToken,
}: {
  jobId: number;
  items: KpJobItem[];
  /** Bump-токен: после per-row отправки родитель инкрементит его, чтобы
   *  SendBar немедленно подтянул свежий счётчик (без ожидания следующего
   *  тика 2.5-сек поллинга). 0 на маунте — refetch не триггерим. */
  refetchToken: number;
}) {
  // По умолчанию активны оба работающих канала — режим «максимальный
  // охват из коробки». Юзер может снять чекбокс, если канал сейчас
  // сломан или он не хочет туда слать.
  const [enabled, setEnabled] = useState<Set<KpSendChannel>>(() => new Set(['email', 'whatsapp']));

  // Текущий юзер — нужен для reply_to_email (адрес, на который лиди будут
  // отвечать). Если выбран email-канал, а reply_to_email пуст — отправка
  // блокируется с подсказкой-ссылкой заполнить профиль.
  const [replyToEmail, setReplyToEmail] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    apiClient
      .get<{ reply_to_email: string | null }>('/auth/me')
      .then((res) => {
        if (!cancelled) setReplyToEmail(res.data.reply_to_email ?? null);
      })
      .catch(() => {
        if (!cancelled) setReplyToEmail(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const replyToMissing = enabled.has('email') && !replyToEmail;

  // Исключённые компании (по company_id) — те, которые юзер снял
  // галочкой в раскрывающемся списке «Кто получит КП». По умолчанию
  // ничего не исключено: все done-компании попадают в отправку.
  // Исключённые НЕ попадают ни в один plan и не учитываются в counter'ах.
  const [excludedIds, setExcludedIds] = useState<Set<number>>(() => new Set());

  // Свёрнут ли раскрывающийся список «Кто получит КП». По умолчанию
  // скрыт, чтобы SendBar не разрастался — юзер раскрывает явным кликом.
  const [recipientsExpanded, setRecipientsExpanded] = useState(false);

  // Состояние реальной отправки (общий статус партии — backend агрегирует
  // по всем каналам).
  const [status, setStatus] = useState<KpJobSendStatus | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [callListDownloading, setCallListDownloading] = useState(false);
  const [callListError, setCallListError] = useState<string | null>(null);

  // Готовые драфты + разбор по «куда что пойдёт». Считается из items
  // на клиенте — backend этих счётчиков пока не отдаёт. Если в будущем
  // company_contacts даст больше телефонов чем Company.phone (см.
  // collect_company_phones на бэке), UI-разбор станет занижен, но это
  // не критично: backend всё равно создаст правильные строки.
  const doneItems = useMemo(() => items.filter((it) => it.status === 'done'), [items]);

  // Активные = done минус исключённые. Все счётчики и plan'ы считаются
  // отсюда — снял галочку → counter сразу уменьшился.
  const activeDoneItems = useMemo(
    () => doneItems.filter((it) => it.company_id === null || !excludedIds.has(it.company_id)),
    [doneItems, excludedIds],
  );

  const breakdown = useMemo(() => {
    let emailEligible = 0;
    let waEligible = 0;
    let landlineOnly = 0;
    let noContacts = 0;
    for (const it of activeDoneItems) {
      const hasEmail = CHANNEL_BY_KEY.email.eligible(it);
      const hasWa = CHANNEL_BY_KEY.whatsapp.eligible(it);
      if (hasEmail) emailEligible += 1;
      if (hasWa) waEligible += 1;
      if (!hasEmail && !hasWa) {
        // Не охвачен email/WA — может быть городской (попадёт в xlsx
        // «На обзвон») или вообще без телефона.
        const digits = normalizePhoneForWa(it.company_phone);
        if (digits && !isRussianMobile(it.company_phone)) landlineOnly += 1;
        else if (!digits) noContacts += 1;
        else landlineOnly += 1; // fallback: digits есть но не мобильный РФ
      }
    }
    return {
      emailEligible,
      waEligible,
      landlineOnly,
      noContacts,
    };
  }, [activeDoneItems]);

  // План отправки «один лучший канал на компанию» + «во все каналы».
  // Пересчитывается на каждое изменение enabled-чекбоксов или exclusion'а.
  const planOne = useMemo(
    () => planOnePerCompany(activeDoneItems, enabled),
    [activeDoneItems, enabled],
  );
  const planAll = useMemo(
    () => planAllChannels(activeDoneItems, enabled),
    [activeDoneItems, enabled],
  );

  // Сколько уникальных компаний охватывается в каждом режиме.
  const oneCount = useMemo(
    () => Array.from(planOne.byChannel.values()).reduce((a, b) => a + b.length, 0),
    [planOne],
  );
  // Во all-режиме это число отправок (не компаний), т.к. одна компания
  // может попасть и в email, и в WA одновременно.
  const allSendsCount = useMemo(
    () => Array.from(planAll.byChannel.values()).reduce((a, b) => a + b.length, 0),
    [planAll],
  );

  // Кандидаты на xlsx «На обзвон» — uncovered компании, у которых есть
  // хоть какой-то телефон. Используется только для счётчика на кнопке.
  // Считаем по activeDoneItems — исключённые не идут даже в обзвон.
  const callableCount = useMemo(
    () =>
      activeDoneItems.filter(
        (it) =>
          !CHANNEL_BY_KEY.email.eligible(it) &&
          !CHANNEL_BY_KEY.whatsapp.eligible(it) &&
          normalizePhoneForWa(it.company_phone) !== null,
      ).length,
    [activeDoneItems],
  );

  // Сколько включено / всего done — для шапки collapsible'а.
  const includedCount = activeDoneItems.length;
  const totalDoneCount = doneItems.length;

  function toggleExcluded(companyId: number) {
    setExcludedIds((prev) => {
      const next = new Set(prev);
      if (next.has(companyId)) next.delete(companyId);
      else next.add(companyId);
      return next;
    });
  }

  function includeAll() {
    setExcludedIds(new Set());
  }

  function excludeAll() {
    const ids = new Set<number>();
    for (const it of doneItems) {
      if (it.company_id !== null) ids.add(it.company_id);
    }
    setExcludedIds(ids);
  }

  async function handleDownloadCallList() {
    if (callListDownloading || callableCount === 0) return;
    setCallListDownloading(true);
    setCallListError(null);
    try {
      const { blob, filename } = await downloadKpJobCallList(jobId);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      setCallListError(
        typeof detail === 'string' ? detail : e?.message || 'Не удалось скачать список.',
      );
    } finally {
      setCallListDownloading(false);
    }
  }

  function toggleChannel(key: KpSendChannel) {
    const def = CHANNEL_BY_KEY[key];
    // Не-working каналы (TG/MAX) — disabled, кликом не переключаются.
    if (!def.working) return;
    setEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  useEffect(() => {
    let cancelled = false;
    getKpJobSendStatus(jobId)
      .then((s) => {
        if (!cancelled) setStatus(s);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  useEffect(() => {
    if (!status?.is_active) return;
    const t = setTimeout(() => {
      getKpJobSendStatus(jobId)
        .then(setStatus)
        .catch(() => undefined);
    }, 2500);
    return () => clearTimeout(t);
  }, [jobId, status]);

  useEffect(() => {
    if (refetchToken === 0) return;
    getKpJobSendStatus(jobId)
      .then(setStatus)
      .catch(() => undefined);
  }, [jobId, refetchToken]);

  /**
   * Отправка планом. План — Map<channel, draftIds>. Для каждого канала
   * шлём отдельный sendKpJob-запрос, параллельно. Backend (с draft_ids
   * фильтром) создаст row только под переданные драфты.
   *
   * Возвращает последний полученный статус — UI сразу обновляется без
   * ожидания первого тика polling'а.
   */
  async function dispatchPlan(plan: Map<KpSendChannel, number[]>): Promise<KpJobSendStatus | null> {
    const calls: Promise<KpJobSendStatus>[] = [];
    for (const [channel, draftIds] of plan.entries()) {
      if (draftIds.length === 0) continue;
      calls.push(sendKpJob(jobId, [channel], draftIds));
    }
    if (calls.length === 0) return null;
    const results = await Promise.all(calls);
    // Берём последний результат — он самый свежий (после всех POST'ов
    // backend уже видит все queued-row, не важно какой call вернул).
    return results[results.length - 1] ?? null;
  }

  async function handleSendOnePerCompany() {
    if (submitting || oneCount === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      const fresh = await dispatchPlan(planOne.byChannel);
      if (fresh) setStatus(fresh);
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

  async function handleSendAllChannels() {
    if (submitting || allSendsCount === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      const fresh = await dispatchPlan(planAll.byChannel);
      if (fresh) setStatus(fresh);
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

  // Дублирующие отправки запрещаем во время активной партии.
  const oneDisabled = submitting || oneCount === 0 || isActive || replyToMissing;
  const allDisabled = submitting || allSendsCount === 0 || isActive || replyToMissing;

  return (
    <div className="sticky bottom-3 z-30 mt-5 pb-[env(safe-area-inset-bottom)]">
      <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-4 py-3 shadow-[0_8px_24px_-8px_rgba(15,23,42,0.18)] sm:px-5">
        {/* Шапка: общий статус партии — что вообще готово и сколько уже улетело */}
        <div className="flex flex-col gap-1 border-b border-[hsl(var(--border))] pb-3">
          <div className="text-[13px] font-semibold text-[hsl(var(--text))]">
            {isActive
              ? `Отправляем: ${status!.sent} из ${status!.total}…`
              : hasAnySend
                ? `Отправлено: ${status!.sent} · с ошибкой: ${status!.failed}${
                    status!.skipped > 0 ? ` · пропущено: ${status!.skipped}` : ''
                  }`
                : `Готово ${doneItems.length} КП · по контактам разобрали`}
          </div>
          {/* Разбор «куда уйдёт» — независим от выбранного режима, чтобы
              юзер понимал, какие данные у нас вообще есть. Чекбоксы
              ниже только включают/выключают каналы — числа не меняют. */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-[hsl(var(--muted))]">
            <span className="inline-flex items-center gap-1">
              <Mail className="h-3.5 w-3.5 text-violet-600" /> {breakdown.emailEligible} email
            </span>
            <span className="inline-flex items-center gap-1">
              <MessageCircle className="h-3.5 w-3.5 text-emerald-600" /> {breakdown.waEligible}{' '}
              WhatsApp
            </span>
            {breakdown.landlineOnly > 0 && (
              <span className="inline-flex items-center gap-1">
                📞 {breakdown.landlineOnly} только звонок
              </span>
            )}
            {breakdown.noContacts > 0 && (
              <span className="inline-flex items-center gap-1 text-rose-600">
                ❓ {breakdown.noContacts} без контактов
              </span>
            )}
          </div>
        </div>

        {/* Чекбоксы каналов — снять можно email/WhatsApp, TG/MAX disabled.
            По умолчанию оба working-канала включены, чтобы «Отправить»
            из коробки слал максимум доступного. */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {CHANNEL_DEFS.map(({ key, label, Icon, working }) => {
            const active = working && enabled.has(key);
            const disabledClick = !working || submitting || isActive;
            return (
              <button
                key={key}
                type="button"
                role="checkbox"
                aria-checked={active}
                aria-disabled={!working || undefined}
                onClick={disabledClick ? undefined : () => toggleChannel(key)}
                disabled={disabledClick}
                title={
                  !working
                    ? 'Коннектор в работе — этот канал пока не шлёт.'
                    : active
                      ? 'Снять галочку — компании по этому каналу пойдут в «обзвон руками».'
                      : 'Включить канал — компании с этим контактом снова попадут в отправку.'
                }
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[12px] font-medium transition-colors',
                  !working
                    ? 'cursor-not-allowed border-dashed border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-500'
                    : 'disabled:cursor-not-allowed disabled:opacity-60',
                  working && active
                    ? 'border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-700 dark:bg-violet-950/40 dark:text-violet-200'
                    : '',
                  working && !active
                    ? 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400'
                    : '',
                )}
              >
                <span
                  className={cn(
                    'grid h-3.5 w-3.5 place-items-center rounded-sm border',
                    !working
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
                {!working && (
                  <span className="ml-0.5 rounded bg-slate-200 px-1 text-[10px] font-medium uppercase tracking-wider text-slate-500 dark:bg-slate-700 dark:text-slate-300">
                    скоро
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Ошибки */}
        {error && <div className="mt-2 text-[12px] text-rose-700">{error}</div>}
        {callListError && <div className="mt-2 text-[12px] text-rose-700">{callListError}</div>}
        {status?.last_error && !error && (
          <div className="mt-2 truncate text-[12px] text-rose-700" title={status.last_error}>
            Последняя ошибка: {status.last_error}
          </div>
        )}

        {/* Раскрывающийся список «Кто получит КП». По умолчанию свёрнут —
            юзер сам решает посмотреть. Тут он:
              - видит каждую компанию по полному юр. названию + ИНН + адрес,
              - видит какой канал ей реально пойдёт при «Отправить всем»,
              - может снять галочку у конкретной компании (попадёт
                в exclusion-set, и planOne/planAll её отфильтруют).
            Появляется только когда есть хотя бы одна done-компания. */}
        {totalDoneCount > 0 && (
          <RecipientsPanel
            expanded={recipientsExpanded}
            onToggle={() => setRecipientsExpanded((v) => !v)}
            doneItems={doneItems}
            excludedIds={excludedIds}
            onToggleExcluded={toggleExcluded}
            onIncludeAll={includeAll}
            onExcludeAll={excludeAll}
            includedCount={includedCount}
            totalCount={totalDoneCount}
            enabled={enabled}
            isActive={isActive}
          />
        )}

        {/* Подсказка: не указан email для ответов. Без него лиди не смогут
            ответить на КП (ответ уйдёт на системный From, а не клиенту).
            Показываем только когда выбран email-канал и reply_to пуст. */}
        {replyToMissing && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <div>
              Не указан email для ответов — лиди не смогут вам ответить.{' '}
              <Link
                href="/app/settings/profile"
                className="font-medium underline underline-offset-2 hover:text-amber-700"
              >
                Указать email →
              </Link>
            </div>
          </div>
        )}

        {/* Кнопки: два пресета + xlsx обзвон.
            «Отправить всем» — на компанию один лучший канал (email или WA).
            «Во все каналы» — на компанию все доступные каналы (макс охват). */}
        <div className="mt-3 flex flex-wrap items-stretch gap-2">
          <ButtonV2
            variant="primary"
            size="md"
            onClick={handleSendOnePerCompany}
            disabled={oneDisabled}
            iconLeft={submitting || isActive ? <Loader2 className="animate-spin" /> : <Send />}
            title={
              isActive
                ? 'Сейчас идёт рассылка — дождись окончания.'
                : oneCount === 0
                  ? 'Ни одной компании не достать выбранными каналами. Включи каналы или добавь контакты.'
                  : 'Каждой компании уйдёт ОДНА КП в первый доступный канал (email → WhatsApp). Без дублей.'
            }
          >
            {isActive
              ? `Отправляется… ${sentCount}/${status!.total}`
              : `Отправить всем (${oneCount})`}
          </ButtonV2>

          <ButtonV2
            variant="secondary"
            size="md"
            onClick={handleSendAllChannels}
            disabled={allDisabled}
            iconLeft={submitting && !isActive ? <Loader2 className="animate-spin" /> : <Send />}
            title={
              isActive
                ? 'Сейчас идёт рассылка — дождись окончания.'
                : allSendsCount === 0
                  ? 'Ни одной компании не достать выбранными каналами.'
                  : 'Каждой компании уйдёт КП по ВСЕМ доступным каналам сразу (email + WhatsApp если есть оба). Больше шансов, что увидят, но риск дубль-сообщения.'
            }
          >
            {`Во все каналы (${allSendsCount} ${pluralize(
              allSendsCount,
              'отправка',
              'отправки',
              'отправок',
            )})`}
          </ButtonV2>

          <ButtonV2
            variant="ghost"
            size="md"
            disabled={callListDownloading || callableCount === 0}
            onClick={handleDownloadCallList}
            iconLeft={callListDownloading ? <Loader2 className="animate-spin" /> : <Download />}
            title={
              callableCount === 0
                ? 'Нет компаний без email/WA с валидным телефоном — обзванивать некого.'
                : 'Скачать .xlsx со всеми, кому КП не уйдёт по email/WA, но есть телефон. С болью и темой — для звонка руками.'
            }
          >
            {callListDownloading
              ? 'Готовлю…'
              : `На обзвон${callableCount > 0 ? ` (${callableCount})` : ''}`}
          </ButtonV2>
        </div>

        {/* Прогресс-бар */}
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
            Полный лог — в{' '}
            <a className="underline" href="/app/leads/history?tab=sends">
              «Отправки»
            </a>{' '}
            на странице истории.
          </div>
        )}
      </div>
    </div>
  );
}

// --- RecipientsPanel — раскрываемый список «Кто получит КП» -----------------
//
// Под чекбоксами каналов SendBar'а. По умолчанию свёрнут — только шапка
// «Кто получит КП (X из Y)». Раскрытие → список всех done-компаний с
// галочкой исключения и пиллом «какой канал пойдёт».
//
// Логика:
//   - Галочка включена (по умолчанию) = компания пойдёт в отправку.
//   - Галочка снята = company_id в excludedIds = НЕ попадёт в planOne/planAll.
//   - Канал в пилле — режим one-per-company с учётом enabled-чекбоксов.
//     При активных Email+WA email приоритетнее.
//   - 'callable' (📞) = нет email/WA, но есть валидный телефон → попадёт
//     в xlsx «На обзвон» (если юзер скачает его).
//   - 'none' (❓) = ни одного контакта вообще — компания не дойдёт
//     никому, юзер может снять галочку чтобы убрать из счётчика.
//
// Во время активной отправки (`isActive`) галочки disabled — нельзя
// поменять exclusion, пока bulk-bar шлёт партию.

function RecipientsPanel({
  expanded,
  onToggle,
  doneItems,
  excludedIds,
  onToggleExcluded,
  onIncludeAll,
  onExcludeAll,
  includedCount,
  totalCount,
  enabled,
  isActive,
}: {
  expanded: boolean;
  onToggle: () => void;
  doneItems: KpJobItem[];
  excludedIds: Set<number>;
  onToggleExcluded: (companyId: number) => void;
  onIncludeAll: () => void;
  onExcludeAll: () => void;
  includedCount: number;
  totalCount: number;
  enabled: Set<KpSendChannel>;
  isActive: boolean;
}) {
  const ChevronIcon = expanded ? ChevronUp : ChevronDown;
  return (
    <div className="mt-3 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-2,var(--surface)))]">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-[13px] font-medium text-[hsl(var(--text))] hover:bg-slate-50 dark:hover:bg-slate-900/40"
        aria-expanded={expanded}
      >
        <span className="inline-flex items-center gap-2">
          <ChevronIcon className="h-4 w-4 text-[hsl(var(--muted))]" />
          Кто получит КП ({includedCount}
          {totalCount !== includedCount ? ` из ${totalCount}` : ''})
        </span>
        <span className="text-[11px] font-normal text-[hsl(var(--muted))]">
          {expanded ? 'Скрыть' : 'Показать список'}
        </span>
      </button>

      {expanded && (
        <div className="border-t border-[hsl(var(--border))] px-3 py-2">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[12px]">
            <span className="text-[hsl(var(--muted))]">
              Снимай галочку у тех, кому слать не нужно — counter обновится.
            </span>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={onIncludeAll}
                disabled={isActive || excludedIds.size === 0}
                className="rounded-md border border-slate-200 px-2 py-0.5 text-[11px] text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-900"
              >
                Включить все
              </button>
              <button
                type="button"
                onClick={onExcludeAll}
                disabled={isActive || excludedIds.size === totalCount}
                className="rounded-md border border-slate-200 px-2 py-0.5 text-[11px] text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-900"
              >
                Снять все
              </button>
            </div>
          </div>

          <ul className="max-h-72 space-y-1 overflow-y-auto pr-1">
            {doneItems.map((it) => {
              const isExcluded = it.company_id !== null && excludedIds.has(it.company_id);
              const eff = getOneChannelForItem(it, enabled);
              return (
                <RecipientRow
                  key={
                    it.company_id !== null
                      ? `c${it.company_id}`
                      : `d${it.draft_id ?? Math.random()}`
                  }
                  item={it}
                  excluded={isExcluded}
                  effectiveChannel={eff}
                  onToggle={
                    it.company_id !== null && !isActive
                      ? () => onToggleExcluded(it.company_id as number)
                      : undefined
                  }
                  disabled={isActive}
                />
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function RecipientRow({
  item,
  excluded,
  effectiveChannel,
  onToggle,
  disabled,
}: {
  item: KpJobItem;
  excluded: boolean;
  effectiveChannel: KpSendChannel | 'callable' | 'none';
  onToggle: (() => void) | undefined;
  disabled: boolean;
}) {
  // Полное юр. название имеет приоритет — юзер просил видеть именно его.
  // Если нет (компания не сматчилась с реестром) — fallback на company_name.
  const title = item.company_legal_full || item.company_name || '—';
  const innPart = item.company_inn ? `ИНН ${item.company_inn}` : null;
  const addrPart = item.company_address || null;
  const phonePart = item.company_phone ? formatPhoneForDisplay(item.company_phone) : null;
  // email-получатель показываем когда канал = email; для остальных
  // случаев место отдаём под другие реквизиты, чтобы строка не разбухла.
  const emailPart =
    effectiveChannel === 'email' && item.recipient_email ? item.recipient_email : null;
  const subtitleParts = [innPart, addrPart, phonePart, emailPart].filter(Boolean) as string[];
  const chip = channelChip(effectiveChannel);
  return (
    <li
      className={cn(
        'flex items-start gap-2 rounded-md border border-transparent px-2 py-1.5 text-[12px]',
        excluded ? 'opacity-50' : 'hover:bg-slate-50 dark:hover:bg-slate-900/40',
      )}
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={!excluded}
        aria-label={excluded ? 'Включить компанию в отправку' : 'Исключить из отправки'}
        disabled={disabled || onToggle === undefined}
        onClick={onToggle}
        className={cn(
          'mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-sm border',
          excluded
            ? 'border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-900'
            : 'border-violet-500 bg-violet-500 text-white',
          (disabled || onToggle === undefined) && 'cursor-not-allowed opacity-60',
        )}
      >
        {!excluded && <Check className="h-3 w-3" strokeWidth={3} />}
      </button>
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium text-[hsl(var(--text))]">{title}</div>
        {subtitleParts.length > 0 && (
          <div className="truncate text-[11px] text-[hsl(var(--muted))]">
            {subtitleParts.join(' · ')}
          </div>
        )}
      </div>
      <span
        className={cn(
          'inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-medium',
          chip.cls,
        )}
        title={chip.title}
      >
        <chip.Icon className="h-3 w-3" />
        {chip.label}
      </span>
    </li>
  );
}

function channelChip(eff: KpSendChannel | 'callable' | 'none') {
  switch (eff) {
    case 'email':
      return {
        Icon: Mail,
        label: 'Email',
        cls: 'bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-200',
        title: 'Уйдёт по Email в режиме «Отправить всем».',
      };
    case 'whatsapp':
      return {
        Icon: MessageCircle,
        label: 'WhatsApp',
        cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200',
        title: 'Уйдёт по WhatsApp в режиме «Отправить всем».',
      };
    case 'sms':
      return {
        Icon: MessageCircle,
        label: 'SMS',
        cls: 'bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-200',
        title: 'Короткое уведомление в SMS через SMS.ru (обрезано до ~300 знаков).',
      };
    case 'callable':
      return {
        Icon: PhoneCall,
        label: 'Обзвон',
        cls: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-200',
        title: 'Нет email и мобильного — попадёт в xlsx «На обзвон». КП не уйдёт автоматически.',
      };
    case 'telegram':
    case 'max':
    case 'none':
    default:
      return {
        Icon: AlertCircle,
        label: 'Нет канала',
        cls: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
        title: 'Ни email, ни телефона. КП не дойдёт ни одним каналом — можно снять галочку.',
      };
  }
}

/** Простой РФ-плюрализатор для «1 отправка / 2 отправки / 5 отправок». */
function pluralize(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

// --- Per-row send button (✈) ------------------------------------------------
//
// Компактная иконка-кнопка для отправки ОДНОЙ КП в Email — рисуется в
// последней колонке таблицы / mobile-карточки рядом с «Открыть» только когда
// у строки status='done' и есть recipient_email.
//
// Состояния:
//   idle      → зелёный обводной ✈, hover-fill зелёным.
//   sending   → spinner, disabled.
//   sent      → галочка, disabled. Залипает после reload благодаря
//               persisted-статусу из БД (email_send_status), чтобы
//               юзер случайно не отправил вторую копию.
//   { error } → красная иконка, hover показывает текст ошибки в title.

type RowSendState = 'sending' | 'sent' | { error: string } | undefined;

/**
 * Объединяет локальный per-row state (в рамках сессии) и persisted-статус
 * последней email-отправки из БД. Persisted нужен чтобы после reload
 * кнопка всё ещё показывала «✓ Отправлено» (или «failed»-ошибку) и не
 * давала случайно отправить дубль.
 *
 * Правила:
 *   - local 'sending'                 → 'sending'
 *   - local 'sent' | persisted 'sent' → 'sent' (залипает приоритетно)
 *   - local error                     → error (последняя попытка упала)
 *   - persisted 'failed'              → error «прошлая попытка упала»
 *   - persisted 'sending'|'queued'    → 'sending' (висит в очереди bulk-bar'а)
 *   - persisted 'skipped'             → undefined (по этому каналу мы и не
 *                                       пытались — например, no_recipient)
 *   - иначе                           → undefined (idle, можно отправить)
 */
function computeRowSendState(
  local: RowSendState,
  persisted: KpJobItem['email_send_status'],
): RowSendState {
  if (local === 'sending') return 'sending';
  if (local === 'sent' || persisted === 'sent') return 'sent';
  if (local && typeof local === 'object' && 'error' in local) return local;
  if (persisted === 'failed') {
    return { error: 'Прошлая попытка не дошла — попробуй ещё раз.' };
  }
  if (persisted === 'sending' || persisted === 'queued') return 'sending';
  return undefined;
}

function RowSendButton({
  state,
  onClick,
}: {
  state: RowSendState;
  onClick: (e: MouseEvent<HTMLButtonElement>) => void;
}) {
  const isSending = state === 'sending';
  const isSent = state === 'sent';
  const error = state && typeof state === 'object' && 'error' in state ? state.error : null;
  const disabled = isSending || isSent;
  const title = isSent
    ? 'Отправлено. Чтобы переслать — обнови страницу.'
    : isSending
      ? 'Отправляется…'
      : error
        ? `Не удалось отправить: ${error}`
        : 'Отправить эту КП на email компании';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className={cn(
        'inline-flex h-7 w-7 items-center justify-center rounded-md border transition-colors',
        isSent
          ? 'cursor-default border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700/60 dark:bg-emerald-950/40 dark:text-emerald-300'
          : isSending
            ? 'cursor-wait border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400'
            : error
              ? 'border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100 dark:border-rose-700/60 dark:bg-rose-950/40 dark:text-rose-300'
              : 'border-emerald-300 bg-white text-emerald-700 hover:bg-emerald-50 dark:border-emerald-700/60 dark:bg-slate-900 dark:text-emerald-300 dark:hover:bg-emerald-950/30',
      )}
    >
      {isSending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : isSent ? (
        <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
      ) : (
        <Send className="h-3.5 w-3.5" />
      )}
    </button>
  );
}

// --- Drawer одной КП ---------------------------------------------------------

function DraftDrawer({
  item,
  onClose,
  onPatched,
  singleSendState,
  onSendOne,
}: {
  item: KpJobItem;
  onClose: () => void;
  onPatched: (updates: Partial<KpJobItem>) => void;
  /** Состояние per-row отправки для этого draft_id (см. RowSendButton). */
  singleSendState: RowSendState;
  /** Триггер отправки этой одной КП. undefined → нет draft_id или email,
   *  кнопка в футере не рисуется. */
  onSendOne?: () => void;
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
      setSaveError(typeof detail === 'string' ? detail : e?.message || 'Не удалось сохранить.');
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
      <div className="fixed inset-0 z-40 bg-slate-900/30" onClick={onClose} aria-hidden />
      {/* Panel */}
      <aside
        role="dialog"
        aria-label={`КП: ${companyTitle}`}
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col bg-white shadow-2xl dark:bg-slate-900"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[hsl(var(--border))] px-5 py-3">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <CompanyAvatar name={item.company_name} logoUrl={item.company_logo_url} size={40} />
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
                {item.draft_created_at ? ` · ${formatDateTime(item.draft_created_at)}` : ''}
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
          {/* Email — основной канал. Если есть → зелёный пилл; нет →
              предупреждение «нет email», но это уже не дед-энд — справа
              рядом блок «Телефон» с альтернативными каналами. */}
          <div>
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-[hsl(var(--muted))]">
              Email
            </label>
            {item.recipient_email ? (
              <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[13px] dark:border-emerald-700/50 dark:bg-emerald-900/30">
                <AtSign className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-300" />
                <div className="min-w-0 flex-1 truncate">
                  <span className="font-medium text-emerald-900 dark:text-emerald-100">
                    {item.recipient_email}
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-[12.5px] dark:border-amber-700/50 dark:bg-amber-900/30">
                <MailX className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-300" />
                <div className="text-amber-800 dark:text-amber-200">
                  Email не найден — добавь в карточке компании, чтобы включить отправку.
                </div>
              </div>
            )}
          </div>

          {/* Телефон — независимый блок. Видно всегда (если есть номер),
              даже когда email уже подключён — юзер может параллельно
              позвонить или написать в WhatsApp. Мобильный РФ → wa.me с
              pre-filled КП. Городской → tel:. Битый/нет → блок скрыт. */}
          {(() => {
            const phoneDigits = normalizePhoneForWa(item.company_phone);
            if (!phoneDigits) return null;
            const isMobile = isRussianMobile(item.company_phone);
            const waLink = isMobile
              ? buildWhatsappLink(
                  item.company_phone,
                  body ? `${subject ? `${subject}\n\n` : ''}${body}` : null,
                )
              : null;
            const telLink = !isMobile ? buildTelLink(item.company_phone) : null;
            const phoneDisplay = formatPhoneForDisplay(item.company_phone);
            return (
              <div>
                <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-[hsl(var(--muted))]">
                  Телефон
                </label>
                {waLink ? (
                  <div className="space-y-1.5">
                    <a
                      href={waLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-[13px] transition-colors hover:border-emerald-400 hover:bg-emerald-100 dark:border-emerald-700/50 dark:bg-emerald-900/30 dark:hover:bg-emerald-900/60"
                    >
                      <Phone className="h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-300" />
                      <div className="min-w-0 flex-1 truncate">
                        <span className="font-medium text-emerald-900 dark:text-emerald-100">
                          {phoneDisplay}
                        </span>
                        <span className="ml-1.5 text-[11px] uppercase tracking-wider text-emerald-700/80 dark:text-emerald-300/80">
                          WhatsApp
                        </span>
                      </div>
                    </a>
                    <p className="text-[11px] leading-tight text-[hsl(var(--muted))]">
                      Клик — wa.me с пред-заполненным КП. Шлём руками (bulk-коннектора WA пока нет).
                    </p>
                  </div>
                ) : telLink ? (
                  <a
                    href={telLink}
                    className="flex items-center gap-2 rounded-md border border-slate-300 bg-slate-50 px-3 py-1.5 text-[13px] transition-colors hover:border-slate-400 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:hover:bg-slate-700"
                  >
                    <Phone className="h-4 w-4 shrink-0 text-slate-600 dark:text-slate-300" />
                    <div className="min-w-0 flex-1 truncate">
                      <span className="font-medium text-slate-900 dark:text-slate-100">
                        {phoneDisplay}
                      </span>
                      <span className="ml-1.5 text-[11px] uppercase tracking-wider text-slate-600/80 dark:text-slate-400">
                        Городской · звонок
                      </span>
                    </div>
                  </a>
                ) : null}
              </div>
            );
          })()}

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
                title={item.draft_id !== null ? 'Клик — отредактировать тему' : undefined}
                className="w-full rounded-md border border-dashed border-slate-200 bg-slate-50 px-3 py-1.5 text-left text-[14px] font-medium text-slate-800 transition-colors hover:border-violet-300 hover:bg-violet-50/50 disabled:cursor-not-allowed disabled:hover:border-slate-200 disabled:hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:border-violet-700 dark:hover:bg-violet-950/30"
              >
                {subject || <span className="italic text-slate-400">Тема пустая.</span>}
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
                title={item.draft_id !== null ? 'Клик — отредактировать тело письма' : undefined}
                className="w-full whitespace-pre-wrap rounded-md border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-left text-[13px] leading-relaxed text-slate-700 transition-colors hover:border-violet-300 hover:bg-violet-50/50 disabled:cursor-not-allowed disabled:hover:border-slate-200 disabled:hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-violet-700 dark:hover:bg-violet-950/30"
              >
                {body || <span className="italic text-slate-400">Тело письма пустое.</span>}
              </button>
            )}
          </div>

          {/* Превью по каналам: один body — три рендера. Показываем
              ВСЕГДА (и в edit-режиме): в реальном времени видно, как
              правка ложится в WA/TG — особенно важно для лимита 1024
              у WhatsApp. Раньше скрывали при editing — юзер не понимал
              куда делся блок и думал что это баг. */}
          {item.draft_id !== null && <ChannelPreviewBlock subject={subject} body={body} />}

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
                  copyFlash === 'subject' ? <Check className="text-emerald-600" /> : <Copy />
                }
                onClick={() => copyToClipboard(subject, 'subject')}
              >
                {copyFlash === 'subject' ? 'Скопировано' : 'Тема'}
              </ButtonV2>
              <ButtonV2
                variant="ghost"
                size="sm"
                iconLeft={copyFlash === 'body' ? <Check className="text-emerald-600" /> : <Copy />}
                onClick={() => copyToClipboard(body, 'body')}
              >
                {copyFlash === 'body' ? 'Скопировано' : 'Тело'}
              </ButtonV2>
              {item.draft_id !== null && (
                <ButtonV2
                  variant="ghost"
                  size="sm"
                  iconLeft={<Pencil />}
                  onClick={() => setEditing(true)}
                >
                  Редактировать
                </ButtonV2>
              )}
              {/* Per-row send из drawer'а — самое полезное место для
                  «отправил, посмотрел, поправил, отправил ещё раз» цикла.
                  Не рисуем если у компании нет email-а (родитель не
                  прокинет onSendOne). */}
              {item.draft_id !== null && onSendOne && (
                <ButtonV2
                  variant="primary"
                  size="sm"
                  iconLeft={
                    singleSendState === 'sending' ? (
                      <Loader2 className="animate-spin" />
                    ) : singleSendState === 'sent' ? (
                      <Check />
                    ) : (
                      <Send />
                    )
                  }
                  disabled={singleSendState === 'sending' || singleSendState === 'sent'}
                  onClick={onSendOne}
                  title={
                    singleSendState === 'sent'
                      ? 'Отправлено. Обнови страницу, чтобы переслать.'
                      : 'Отправить эту одну КП на email компании.'
                  }
                >
                  {singleSendState === 'sent'
                    ? 'Отправлено'
                    : singleSendState === 'sending'
                      ? 'Отправляется…'
                      : 'Отправить эту КП'}
                </ButtonV2>
              )}
            </>
          )}
          {!editing &&
            singleSendState &&
            typeof singleSendState === 'object' &&
            'error' in singleSendState && (
              <div className="w-full text-right text-[12px] text-rose-700">
                {singleSendState.error}
              </div>
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
                  savedFlash ? <Check /> : saving ? <Loader2 className="animate-spin" /> : undefined
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

// --- Превью КП по каналам (§3 минимум, 2026-06-21) ---------------------------
//
// Один и тот же body, три варианта рендера + лимит длины канала. Email
// сейчас единственный реально подключённый — но юзер уже сможет на этапе
// генерации увидеть «для Telegram это слишком длинно, надо урезать»,
// потому что когда TG-коннектор подключим (бот через chat_id владельца),
// тексты будут готовы.
//
// Лимиты:
//   - Telegram: 4096 символов в одном sendMessage. Длиннее — Bot API
//     обрезает / возвращает 400.
//   - WhatsApp Business API: ~1024 для template-сообщений, поэтому
//     ставим строгий предел и предупреждаем за ~10% до.
//   - Email: без жёсткого лимита, показываем общий счётчик.

type PreviewChannel = 'email' | 'telegram' | 'whatsapp';

// Контакты отправителя, которые система автоматически добавляет в КОНЕЦ
// каждого КП (в e-mail — подписью в подвале письма, в мессенджерах —
// текстом). Зеркалит DEFAULT_SENDER_SIGNATURE_* из
// backend/app/modules/outreach/kp_html_renderer.py — при смене контактов
// править оба места. Пока зашито под SpinLid.
const SENDER_SIGNATURE_TEXT = '—\nSpinLid · spinlid.ru · support@spinlid.ru';

const CHANNEL_META: Record<
  PreviewChannel,
  { label: string; limit: number | null; warnAt: number | null }
> = {
  email: { label: 'Email', limit: null, warnAt: null },
  telegram: { label: 'Telegram', limit: 4096, warnAt: 3500 },
  whatsapp: { label: 'WhatsApp', limit: 1024, warnAt: 900 },
};

function ChannelPreviewBlock({ subject, body }: { subject: string; body: string }) {
  const [channel, setChannel] = useState<PreviewChannel>('email');
  const meta = CHANNEL_META[channel];

  // TG/WA — обычно plain-text без сабжекта; склеиваем заголовок в первую
  // строку, чтобы получатель видел тему. В Email сабжект отдельный.
  const rendered = useMemo(() => {
    // Подпись-контакты добавляется автоматически в конец КП на бэкенде —
    // показываем её и тут, чтобы юзер видел финальный вид и чтобы счётчик
    // длины (важен для лимита WhatsApp) учитывал подпись.
    const sig = `\n\n${SENDER_SIGNATURE_TEXT}`;
    if (channel === 'email') return body + sig;
    const prefix = subject ? `${subject}\n\n` : '';
    return prefix + body + sig;
  }, [channel, subject, body]);

  const length = rendered.length;
  const overLimit = meta.limit !== null && length > meta.limit;
  const warn = meta.warnAt !== null && length > meta.warnAt && !overLimit;

  return (
    <div>
      <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-[hsl(var(--muted))]">
        Как это будет выглядеть в…
      </label>
      <div className="mb-2 flex flex-wrap gap-1">
        {(Object.keys(CHANNEL_META) as PreviewChannel[]).map((key) => {
          const active = key === channel;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setChannel(key)}
              className={cn(
                'rounded-md border px-2.5 py-1 text-[12px] font-medium transition-colors',
                active
                  ? 'border-violet-600 bg-violet-600 text-white shadow-sm'
                  : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200',
              )}
            >
              {CHANNEL_META[key].label}
            </button>
          );
        })}
      </div>
      <div
        className={cn(
          'rounded-md border px-3 py-2 text-[12.5px] leading-relaxed',
          overLimit
            ? 'border-rose-300 bg-rose-50 dark:border-rose-700/50 dark:bg-rose-950/30'
            : warn
              ? 'border-amber-300 bg-amber-50 dark:border-amber-700/50 dark:bg-amber-950/30'
              : 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900',
        )}
      >
        {channel === 'email' && subject && (
          <div className="mb-1.5 border-b border-slate-200 pb-1.5 text-[12px] dark:border-slate-700">
            <span className="font-medium text-[hsl(var(--muted))]">Тема: </span>
            <span className="text-[hsl(var(--text))]">{subject}</span>
          </div>
        )}
        <pre className="whitespace-pre-wrap font-sans text-[hsl(var(--text))]">
          {rendered || <span className="italic text-slate-400">Тело пустое</span>}
        </pre>
      </div>
      <div className="mt-1 flex items-center justify-between gap-2 text-[11px]">
        <span className="text-[hsl(var(--muted))]">
          {channel === 'email'
            ? 'В письме уйдут шапка с лого и контакты SpinLid (подпись внизу).'
            : 'Канал в работе — пока шлём только Email. Контакты SpinLid добавятся в конец. Превью для проверки длины.'}
        </span>
        <span
          className={cn(
            'font-mono tabular-nums',
            overLimit
              ? 'text-rose-700 dark:text-rose-300'
              : warn
                ? 'text-amber-700 dark:text-amber-300'
                : 'text-[hsl(var(--muted))]',
          )}
        >
          {length.toLocaleString('ru-RU')}
          {meta.limit !== null ? ` / ${meta.limit.toLocaleString('ru-RU')}` : ''}
        </span>
      </div>
      {overLimit && meta.limit !== null && (
        <p className="mt-1 text-[11px] text-rose-700 dark:text-rose-300">
          Превышен лимит {meta.label} на {(length - meta.limit).toLocaleString('ru-RU')} симв. —
          урежь тело перед отправкой через этот канал.
        </p>
      )}
    </div>
  );
}
