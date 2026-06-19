'use client';

/**
 * Страница массового просмотра/правки КП после bulk-генерации
 * (2026-06-20). Юзер из выдачи выбрал N компаний → нажал «Сформировать КП»
 * → BulkKpModal крутил прогресс → по завершении ведёт сюда.
 *
 * На странице — все КП этого job'а карточками: компания+город+OPF-пилл,
 * тема, превью тела. Клик на карточку → разворачивается inline-редактор
 * (textarea subject + textarea body), кнопка «Сохранить» делает
 * PATCH /outreach/kp/drafts/{id}.
 *
 * URL: /app/leads/kp-jobs/{job_id}
 * Якорь: #draft-{draft_id} — BulkKpModal.«Просмотреть →» сюда скроллит.
 */

import { use, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Loader2,
  Pencil,
  Sparkles,
  X,
} from 'lucide-react';

import { ButtonV2 } from '@/components/ui/ButtonV2';
import { CardV2 } from '@/components/ui/CardV2';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/utils';
import {
  getKpJobDrafts,
  updateKpDraft,
  type KpBulkJob,
  type KpJobDraftDetail,
} from '@/src/services/api/outreach-kp';

const TEMPLATE_LABELS: Record<string, string> = {
  webstudio: 'Веб-студия',
  seo: 'SEO',
  marketing: 'Маркетинг',
  custom: 'Свой шаблон',
};

function templateLabel(key: string): string {
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

function statusLabel(status: KpBulkJob['status']): string {
  switch (status) {
    case 'queued':
      return 'В очереди';
    case 'running':
      return 'Генерируется';
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

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function KpJobPage({ params }: PageProps) {
  // Next.js 15: params как Promise — разворачиваем через use().
  const { id } = use(params);
  const jobId = Number(id);
  const router = useRouter();

  const [job, setJob] = useState<KpBulkJob | null>(null);
  const [drafts, setDrafts] = useState<KpJobDraftDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!Number.isFinite(jobId) || jobId <= 0) {
      setError('Неверный идентификатор задачи.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const r = await getKpJobDrafts(jobId);
      setJob(r.job);
      setDrafts(r.drafts);
    } catch (e: any) {
      const status = e?.response?.status;
      if (status === 404) {
        setError('Задача не найдена или принадлежит другому пользователю.');
      } else {
        setError(e?.message || 'Не удалось загрузить КП этой задачи.');
      }
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Если job ещё running — поллим раз в 3 сек, чтобы новые КП подтягивались
  // без перезагрузки страницы. Останавливаемся как только job в терминале.
  useEffect(() => {
    if (!job) return;
    if (job.status === 'done' || job.status === 'cancelled' || job.status === 'failed') {
      return;
    }
    const t = setTimeout(() => {
      void load();
    }, 3000);
    return () => clearTimeout(t);
  }, [job, load]);

  // Скролл к #draft-{id} после загрузки (когда юзер пришёл с BulkKpModal'а).
  useEffect(() => {
    if (loading || drafts.length === 0) return;
    if (typeof window === 'undefined') return;
    const hash = window.location.hash;
    if (!hash.startsWith('#draft-')) return;
    const el = document.querySelector(hash);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [loading, drafts.length]);

  function handleDraftUpdated(updated: KpJobDraftDetail) {
    setDrafts((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
  }

  const headerSubtitle = useMemo(() => {
    if (!job) return '';
    const parts = [
      `Шаблон: ${templateLabel(job.template_key)}`,
      `Тон: ${job.tone === 'bold' ? 'уверенный' : 'нейтральный'}`,
      `Создано: ${formatDateTime(job.created_at)}`,
    ];
    return parts.join(' · ');
  }, [job]);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex items-center gap-1 text-[13px] text-[hsl(var(--muted))] hover:text-[hsl(var(--text))]"
        >
          <ArrowLeft className="h-4 w-4" />
          Назад
        </button>
        <div className="ml-auto flex items-center gap-2 text-[12px] text-[hsl(var(--muted))]">
          {job && (
            <>
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 font-medium',
                  job.status === 'done' && 'bg-emerald-100 text-emerald-700',
                  job.status === 'running' && 'bg-violet-100 text-violet-700',
                  job.status === 'cancelled' && 'bg-amber-100 text-amber-700',
                  job.status === 'failed' && 'bg-rose-100 text-rose-700',
                  job.status === 'queued' && 'bg-slate-100 text-slate-700',
                )}
              >
                {statusLabel(job.status)}
              </span>
              <span>
                {job.generated}/{job.total}
                {job.failed > 0 && (
                  <span className="ml-1 text-rose-600">
                    · ошибок: {job.failed}
                  </span>
                )}
              </span>
            </>
          )}
        </div>
      </div>

      <div className="mb-5">
        <h1 className="font-display text-[22px] font-semibold tracking-tight text-[hsl(var(--text))]">
          <Sparkles className="mr-1.5 inline h-5 w-5 -translate-y-0.5 text-violet-600" />
          КП по выгрузке
          {job ? ` #${job.id}` : ''}
        </h1>
        {job && (
          <p className="mt-1 text-[12px] text-[hsl(var(--muted))]">
            {headerSubtitle}
          </p>
        )}
      </div>

      {/* Failed banner */}
      {job?.status === 'failed' && job?.error_message && (
        <CardV2 className="mb-4 border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-700">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <div className="font-medium">Задача завершилась с ошибкой</div>
              <div className="mt-0.5">{job.error_message}</div>
              <div className="mt-0.5 text-[12px] text-rose-600">
                Часть КП могла успеть сохраниться — они ниже.
              </div>
            </div>
          </div>
        </CardV2>
      )}

      {/* Loading / Empty / Error */}
      {loading && (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-[88px]" rounded="lg" />
          ))}
        </div>
      )}

      {!loading && error && (
        <CardV2 className="px-6 py-10 text-center text-sm text-rose-700">
          {error}
        </CardV2>
      )}

      {!loading && !error && drafts.length === 0 && (
        <CardV2 className="px-6 py-10 text-center text-sm text-[hsl(var(--muted))]">
          {job?.status === 'queued' || job?.status === 'running'
            ? 'Генерация только началась — КП появятся через несколько секунд. Страница сама обновится.'
            : 'У этой задачи нет ни одного сгенерированного КП.'}
        </CardV2>
      )}

      {/* Drafts */}
      {!loading && !error && drafts.length > 0 && (
        <ul className="space-y-3">
          {drafts.map((d) => (
            <li key={d.id} id={`draft-${d.id}`}>
              <DraftCard draft={d} onUpdated={handleDraftUpdated} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// --- Карточка одной КП -------------------------------------------------------

function DraftCard({
  draft,
  onUpdated,
}: {
  draft: KpJobDraftDetail;
  onUpdated: (d: KpJobDraftDetail) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [subject, setSubject] = useState(draft.subject);
  const [body, setBody] = useState(draft.body);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [copyFlash, setCopyFlash] = useState<'subject' | 'body' | null>(null);

  // Когда родитель обновляет draft (после save) — синхронизируем локальные стейты.
  useEffect(() => {
    setSubject(draft.subject);
    setBody(draft.body);
  }, [draft.subject, draft.body]);

  const dirty = subject !== draft.subject || body !== draft.body;

  async function handleSave() {
    if (!dirty || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const updated = await updateKpDraft(draft.id, {
        subject: subject !== draft.subject ? subject.trim() : undefined,
        body: body !== draft.body ? body : undefined,
      });
      onUpdated({
        ...draft,
        subject: updated.subject,
        body: updated.body,
      });
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

  function handleCancelEdit() {
    setSubject(draft.subject);
    setBody(draft.body);
    setEditing(false);
    setSaveError(null);
  }

  async function copyToClipboard(text: string, what: 'subject' | 'body') {
    try {
      await navigator.clipboard.writeText(text);
      setCopyFlash(what);
      setTimeout(() => setCopyFlash(null), 1200);
    } catch {
      // ignore — браузер без clipboard API
    }
  }

  const companyTitle =
    draft.company_name ||
    (draft.site_lead_id ? `Сайт-лид #${draft.site_lead_id}` : 'Без названия');

  return (
    <CardV2 className="overflow-hidden">
      <div className="px-4 py-3 sm:px-5">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              {draft.company_legal_short && (
                <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  {draft.company_legal_short}
                </span>
              )}
              <span
                className="truncate font-display text-[14px] font-semibold text-[hsl(var(--text))]"
                title={companyTitle}
              >
                {companyTitle}
              </span>
              {draft.company_city && (
                <span className="text-[12px] text-[hsl(var(--muted))]">
                  · {draft.company_city}
                </span>
              )}
            </div>
            <div className="mt-1 text-[11px] uppercase tracking-wider text-[hsl(var(--muted))]">
              {templateLabel(draft.template_key)} · {formatDateTime(draft.created_at)}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="shrink-0 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            aria-label={expanded ? 'Свернуть' : 'Развернуть'}
          >
            {expanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>
        </div>

        {/* Тема — всегда видна */}
        <div className="mt-2">
          {editing ? (
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={500}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-[14px] font-medium text-slate-900 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          ) : (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="block w-full truncate text-left text-[14px] font-medium text-slate-800 dark:text-slate-100"
              title={subject}
            >
              {subject}
            </button>
          )}
        </div>

        {/* Развёрнутое тело + действия */}
        {expanded && (
          <div className="mt-3 space-y-3">
            {editing ? (
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={Math.max(6, Math.min(20, body.split('\n').length + 1))}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-[13px] leading-relaxed text-slate-800 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            ) : (
              <div className="whitespace-pre-wrap rounded-md border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-[13px] leading-relaxed text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                {body || (
                  <span className="italic text-slate-400">
                    Тело письма пустое.
                  </span>
                )}
              </div>
            )}

            {saveError && (
              <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700">
                {saveError}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-end gap-2">
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
                  <ButtonV2
                    variant="secondary"
                    size="sm"
                    iconLeft={<Pencil />}
                    onClick={() => setEditing(true)}
                  >
                    Редактировать
                  </ButtonV2>
                </>
              )}
              {editing && (
                <>
                  <ButtonV2
                    variant="ghost"
                    size="sm"
                    iconLeft={<X />}
                    onClick={handleCancelEdit}
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
          </div>
        )}
      </div>
    </CardV2>
  );
}
