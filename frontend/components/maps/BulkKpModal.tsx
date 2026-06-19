'use client';

/**
 * BulkKpModal — массовая генерация КП по выделению (миграция 036).
 *
 * Юзер из выдачи отметил N компаний чекбоксами и нажал «Сформировать КП
 * для выбранных». Модалка спрашивает шаблон + тон + (для custom) текст,
 * запускает /outreach/kp/bulk-generate и поллит /outreach/kp/jobs/{id}
 * каждые 1500 мс. Видно: прогресс-бар, счётчики, последние 5 КП,
 * кнопка «Отменить».
 *
 * Закрытие модалки во время running НЕ отменяет job — она продолжит
 * крутиться в фоне. Готовые КП появятся во вкладке «КП» истории.
 */

import { ArrowRight, Loader2, Sparkles, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

import { cn } from '@/lib/utils';
import {
  cancelBulkKpJob,
  getBulkKpJob,
  listKpTemplates,
  startBulkKpGeneration,
  type KpBulkJob,
  type KpTemplate,
  type KpTone,
} from '@/src/services/api/outreach-kp';
import { getStoredKpTemplateKey } from '@/lib/onboarding-storage';

interface Props {
  open: boolean;
  companyIds: number[];
  onClose: () => void;
}

const TONE_OPTIONS: { value: KpTone; label: string }[] = [
  { value: 'neutral', label: 'Нейтральный' },
  { value: 'bold', label: 'Уверенный' },
];

const POLL_INTERVAL_MS = 1500;

const TERMINAL_STATUSES: KpBulkJob['status'][] = ['done', 'cancelled', 'failed'];

function statusLabel(status: KpBulkJob['status']) {
  switch (status) {
    case 'queued':
      return 'В очереди…';
    case 'running':
      return 'Генерирую…';
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

export function BulkKpModal({ open, companyIds, onClose }: Props) {
  const router = useRouter();
  // --- 1. Шаблоны: подгружаем один раз при первом открытии.
  const [templates, setTemplates] = useState<KpTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templatesError, setTemplatesError] = useState<string | null>(null);

  // --- 2. Setup-фаза: выбор шаблона + тон + (для custom) sender_profile.
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [tone, setTone] = useState<KpTone>('neutral');
  const [customSenderProfile, setCustomSenderProfile] = useState('');

  // --- 3. Run-фаза: job + ошибки старта.
  const [job, setJob] = useState<KpBulkJob | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const isCustom = selectedKey === 'custom';
  const selectedTemplate = useMemo(
    () => templates.find((t) => t.key === selectedKey) ?? null,
    [templates, selectedKey],
  );

  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // На открытии — тянем список шаблонов один раз.
  useEffect(() => {
    if (!open || templates.length > 0) return;
    let cancelled = false;
    setTemplatesLoading(true);
    setTemplatesError(null);
    listKpTemplates()
      .then((list) => {
        if (cancelled) return;
        setTemplates(list);
        const fromOnboarding = getStoredKpTemplateKey();
        const def =
          (fromOnboarding && list.find((t) => t.key === fromOnboarding)) ||
          list[0] ||
          null;
        setSelectedKey(def?.key ?? null);
      })
      .catch((e: any) => {
        if (!cancelled)
          setTemplatesError(e?.message || 'Не удалось загрузить шаблоны КП');
      })
      .finally(() => {
        if (!cancelled) setTemplatesLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // На закрытии — сбрасываем job-state (но шаблоны кэшируем).
  useEffect(() => {
    if (!open) {
      setJob(null);
      setStartError(null);
      setStarting(false);
      setCancelling(false);
      if (pollTimer.current) {
        clearTimeout(pollTimer.current);
        pollTimer.current = null;
      }
    }
  }, [open]);

  // Полинг статуса job'а. Запускается после успешного startBulkKpGeneration.
  // Останавливается на терминальном статусе или при закрытии модалки.
  useEffect(() => {
    if (!open) return;
    if (!job) return;
    if (TERMINAL_STATUSES.includes(job.status)) {
      if (pollTimer.current) {
        clearTimeout(pollTimer.current);
        pollTimer.current = null;
      }
      return;
    }

    let cancelled = false;
    pollTimer.current = setTimeout(async () => {
      try {
        const fresh = await getBulkKpJob(job.id);
        if (!cancelled) setJob(fresh);
      } catch (e: any) {
        if (!cancelled) {
          // Тихий ретрай — сетевой блип не должен ронять UI. Через
          // POLL_INTERVAL_MS зайдём заново.
          setJob((prev) => prev);
        }
      }
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (pollTimer.current) {
        clearTimeout(pollTimer.current);
        pollTimer.current = null;
      }
    };
  }, [open, job]);

  async function handleStart() {
    if (!selectedKey || starting || companyIds.length === 0) return;
    if (isCustom && !customSenderProfile.trim()) {
      setStartError(
        'Для шаблона «Свой вариант» опиши, кто ты — 1-2 предложения.',
      );
      return;
    }
    setStarting(true);
    setStartError(null);
    try {
      const created = await startBulkKpGeneration({
        company_ids: companyIds,
        template_key: selectedKey,
        tone,
        custom_sender_profile: isCustom ? customSenderProfile.trim() : null,
      });
      setJob(created);
    } catch (e: any) {
      const respData = e?.response?.data;
      const detail =
        typeof respData?.detail === 'string'
          ? respData.detail
          : Array.isArray(respData?.detail)
            ? respData.detail.map((d: any) => d?.msg).filter(Boolean).join('; ')
            : e?.message || 'Не удалось запустить генерацию.';
      setStartError(detail);
    } finally {
      setStarting(false);
    }
  }

  async function handleCancel() {
    if (!job || cancelling) return;
    setCancelling(true);
    try {
      const updated = await cancelBulkKpJob(job.id);
      setJob(updated);
    } catch (e: any) {
      // eslint-disable-next-line no-console
      console.error('[BulkKpModal] cancel failed', e);
    } finally {
      setCancelling(false);
    }
  }

  if (!open) return null;

  const inSetup = job === null;
  const inProgress = job != null && !TERMINAL_STATUSES.includes(job.status);
  const isTerminal = job != null && TERMINAL_STATUSES.includes(job.status);
  const progressPct =
    job && job.total > 0
      ? Math.min(
          100,
          Math.round(((job.generated + job.failed) / job.total) * 100),
        )
      : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4 py-8">
      <div className="flex max-h-full w-full max-w-2xl flex-col overflow-hidden rounded-lg bg-white shadow-xl dark:bg-slate-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3 dark:border-slate-700">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
              <Sparkles className="mr-1.5 inline h-4 w-4 -translate-y-0.5 text-violet-600" />
              {inSetup
                ? `Сформировать КП для ${companyIds.length} ${companyIds.length === 1 ? 'компании' : 'компаний'}`
                : `КП для ${job?.total ?? companyIds.length} компаний`}
            </h3>
            <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
              {inSetup
                ? 'Письма генерируются по одному ~3-5 сек на каждое. Можно закрыть окно — продолжит в фоне.'
                : statusLabel(job!.status)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            aria-label="Закрыть"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {inSetup && (
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Шаблон отправителя
                </label>
                {templatesLoading ? (
                  <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
                    Загружаю шаблоны…
                  </div>
                ) : templatesError ? (
                  <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                    {templatesError}
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {templates.map((t) => {
                      const active = t.key === selectedKey;
                      return (
                        <button
                          key={t.key}
                          type="button"
                          onClick={() => setSelectedKey(t.key)}
                          className={cn(
                            'rounded-md border px-2.5 py-1 text-[12.5px] font-medium transition-colors',
                            active
                              ? 'border-violet-600 bg-violet-600 text-white shadow-sm'
                              : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200',
                          )}
                          title={t.sender_profile || undefined}
                        >
                          {t.title}
                        </button>
                      );
                    })}
                  </div>
                )}
                {selectedTemplate && !isCustom && selectedTemplate.sender_profile && (
                  <p className="mt-1 text-[11px] italic text-slate-500 dark:text-slate-400">
                    Пишешь от лица: {selectedTemplate.sender_profile}
                  </p>
                )}
              </div>

              {isCustom && (
                <div>
                  <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Кто ты — 1-2 предложения
                  </label>
                  <textarea
                    value={customSenderProfile}
                    onChange={(e) => setCustomSenderProfile(e.target.value)}
                    rows={2}
                    maxLength={600}
                    placeholder="Например: маркетолог-фрилансер, делаю настройку Яндекс.Директа и веду рекламные кампании."
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                </div>
              )}

              <div>
                <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Тон письма
                </label>
                <div className="flex gap-1.5">
                  {TONE_OPTIONS.map((opt) => {
                    const active = tone === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setTone(opt.value)}
                        className={cn(
                          'rounded-md border px-2.5 py-1 text-[12.5px] font-medium transition-colors',
                          active
                            ? 'border-violet-600 bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-200'
                            : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200',
                        )}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {startError && (
                <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {startError}
                </div>
              )}
            </div>
          )}

          {(inProgress || isTerminal) && job && (
            <div className="space-y-4">
              {/* Прогресс-бар */}
              <div>
                <div className="mb-1 flex items-center justify-between text-[12px] text-slate-600 dark:text-slate-300">
                  <span>
                    Сделано {job.generated + job.failed} из {job.total}
                    {job.failed > 0 && (
                      <span className="ml-2 text-rose-600">
                        не получилось: {job.failed}
                      </span>
                    )}
                  </span>
                  <span className="font-medium">{progressPct}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div
                    className={cn(
                      'h-full transition-all',
                      job.status === 'failed'
                        ? 'bg-rose-500'
                        : job.status === 'cancelled'
                          ? 'bg-amber-500'
                          : 'bg-violet-600',
                    )}
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              </div>

              {/* Финальная плашка */}
              {isTerminal && (
                <div
                  className={cn(
                    'rounded-md border px-3 py-3 text-sm',
                    job.status === 'done' &&
                      'border-emerald-200 bg-emerald-50 text-emerald-800',
                    job.status === 'cancelled' &&
                      'border-amber-200 bg-amber-50 text-amber-800',
                    job.status === 'failed' &&
                      'border-rose-200 bg-rose-50 text-rose-800',
                  )}
                >
                  {job.status === 'done' && (
                    <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
                      <span>
                        Готово. Сгенерировано {job.generated} КП
                        {job.failed > 0 && `, ${job.failed} пропущено`}.
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          router.push(`/app/leads/kp-jobs/${job.id}`);
                        }}
                        className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-emerald-700"
                      >
                        Открыть все КП
                        <ArrowRight className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                  {job.status === 'cancelled' && (
                    <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
                      <span>
                        Отменено. Успели сгенерировать {job.generated} КП
                        {job.failed > 0 && `, ${job.failed} пропущено`}.
                      </span>
                      {job.generated > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            router.push(`/app/leads/kp-jobs/${job.id}`);
                          }}
                          className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md border border-amber-300 bg-white px-3 py-1.5 text-[13px] font-medium text-amber-700 hover:bg-amber-50"
                        >
                          Открыть готовые
                          <ArrowRight className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  )}
                  {job.status === 'failed' && (
                    <>
                      Ошибка: {job.error_message || 'неизвестная ошибка'}.
                      {job.generated > 0 && (
                        <>
                          {' '}
                          Часть КП успела сохраниться —{' '}
                          <Link
                            href={`/app/leads/kp-jobs/${job.id}`}
                            className="font-medium underline"
                          >
                            открыть готовые
                          </Link>
                          .
                        </>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Live-превью последних 5 */}
              {job.recent_drafts.length > 0 && (
                <div>
                  <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Последние сгенерированные
                  </div>
                  <ul className="divide-y divide-slate-100 rounded-md border border-slate-200 bg-white text-sm dark:divide-slate-800 dark:border-slate-700 dark:bg-slate-900">
                    {job.recent_drafts.map((d) => (
                      <li
                        key={d.id}
                        className="flex items-center gap-3 px-3 py-2 text-slate-700 dark:text-slate-200"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium">{d.subject}</div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">
                            {new Date(d.created_at).toLocaleTimeString('ru-RU', {
                              hour: '2-digit',
                              minute: '2-digit',
                              second: '2-digit',
                            })}
                          </div>
                        </div>
                        {/* 2026-06-20: активна — ведёт на страницу job'а
                            с якорем #draft-{id}, страница скроллит к этой КП
                            и сразу даёт inline-редактировать subject/body. */}
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            router.push(`/app/leads/kp-jobs/${job.id}#draft-${d.id}`);
                          }}
                          title="Открыть карточку КП с темой/телом для правки"
                          className="shrink-0 rounded-md border border-violet-200 bg-white px-2 py-1 text-[11px] font-medium text-violet-700 hover:bg-violet-50 dark:border-violet-700 dark:bg-slate-900 dark:text-violet-300 dark:hover:bg-slate-800"
                        >
                          Просмотреть →
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-3 dark:border-slate-700">
          {inSetup && (
            <>
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                Отмена
              </button>
              <button
                type="button"
                disabled={starting || !selectedKey || templatesLoading}
                onClick={handleStart}
                className="inline-flex items-center gap-1.5 rounded-md bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {starting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Сгенерировать ({companyIds.length})
              </button>
            </>
          )}
          {inProgress && job && (
            <>
              <button
                type="button"
                disabled={cancelling || job.cancel_requested}
                onClick={handleCancel}
                className="rounded-md border border-rose-300 bg-white px-3 py-1.5 text-sm text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-rose-700 dark:bg-slate-800 dark:text-rose-300 dark:hover:bg-slate-700"
              >
                {job.cancel_requested
                  ? 'Останавливаю…'
                  : cancelling
                    ? 'Отменяю…'
                    : 'Отменить'}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                title="Закрыть окно — генерация продолжится в фоне"
              >
                Свернуть
              </button>
            </>
          )}
          {isTerminal && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-md bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-700"
            >
              Закрыть
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
