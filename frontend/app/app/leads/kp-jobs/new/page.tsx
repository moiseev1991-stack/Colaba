'use client';

/**
 * Setup-страница bulk-генерации КП (2026-06-20).
 *
 * Поток:
 *   1. В выдаче юзер отметил N компаний → жмёт «Сформировать КП».
 *   2. Старый код (MapsSearchResults) кладёт snapshot id'ов в localStorage
 *      под ключом `kp-bulk-pending-{ref}` и делает window.open
 *      на /app/leads/kp-jobs/new?ref={ref} в НОВОЙ вкладке.
 *   3. Эта страница читает ids, спрашивает шаблон/тон/custom,
 *      на «Старт» — POST /outreach/kp/bulk-generate, ловит job_id,
 *      делает router.replace на /app/leads/kp-jobs/{job_id}.
 *
 * Если ref не найден / просрочен — показываем понятную ошибку
 * с кнопкой «Вернуться в выдачу».
 */

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertCircle, ArrowLeft, Sparkles } from 'lucide-react';

import { ButtonV2 } from '@/components/ui/ButtonV2';
import { CardV2 } from '@/components/ui/CardV2';
import { ColdEmailCalculator } from '@/components/ColdEmailCalculator';
import { cn } from '@/lib/utils';
import {
  clearBulkKpPending,
  readBulkKpPending,
} from '@/lib/kp-bulk-pending';
import {
  listKpTemplates,
  startBulkKpGeneration,
  type KpTemplate,
  type KpTone,
} from '@/src/services/api/outreach-kp';
import { getStoredKpTemplateKey } from '@/lib/onboarding-storage';

const TONE_OPTIONS: { value: KpTone; label: string }[] = [
  { value: 'neutral', label: 'Нейтральный' },
  { value: 'bold', label: 'Уверенный' },
];

// 2026-06-19: useSearchParams требует Suspense-границу при статической
// генерации, иначе next build падает с «missing-suspense-with-csr-bailout»
// и ломает GHA build_images. Default-экспорт оборачивает реальный
// компонент в Suspense, аналогично паттерну в /app/leads/history/page.tsx.
export default function KpJobNewPage() {
  return (
    <Suspense fallback={null}>
      <KpJobNewInner />
    </Suspense>
  );
}

function KpJobNewInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // --- 1. Резолвим список company_ids: либо ?ids=1,2,3, либо ?ref=... из localStorage.
  const [companyIds, setCompanyIds] = useState<number[] | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);

  useEffect(() => {
    const idsParam = searchParams.get('ids');
    const ref = searchParams.get('ref');

    if (idsParam) {
      const ids = idsParam
        .split(',')
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n) && n > 0);
      if (ids.length === 0) {
        setResolveError('В ссылке не оказалось ни одного валидного id компании.');
      } else {
        setCompanyIds(ids);
      }
      return;
    }
    if (ref) {
      const ids = readBulkKpPending(ref);
      if (!ids || ids.length === 0) {
        setResolveError(
          'Список компаний пуст или ссылка устарела. Вернись в выдачу и выбери компании заново.',
        );
      } else {
        setCompanyIds(ids);
      }
      return;
    }
    setResolveError(
      'Не передан список компаний. Сюда нужно приходить из выдачи поиска, кнопка «Сформировать КП».',
    );
  }, [searchParams]);

  // --- 2. Шаблоны.
  const [templates, setTemplates] = useState<KpTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [templatesError, setTemplatesError] = useState<string | null>(null);

  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [tone, setTone] = useState<KpTone>('neutral');
  const [customSenderProfile, setCustomSenderProfile] = useState('');

  useEffect(() => {
    let cancelled = false;
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
          setTemplatesError(e?.message || 'Не удалось загрузить шаблоны КП.');
      })
      .finally(() => {
        if (!cancelled) setTemplatesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const isCustom = selectedKey === 'custom';
  const selectedTemplate = useMemo(
    () => templates.find((t) => t.key === selectedKey) ?? null,
    [templates, selectedKey],
  );

  // --- 3. Запуск.
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  async function handleStart() {
    if (!companyIds || companyIds.length === 0) return;
    if (!selectedKey || starting) return;
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
      // Очищаем pending в localStorage — больше не нужен.
      const ref = searchParams.get('ref');
      if (ref) clearBulkKpPending(ref);
      router.replace(`/app/leads/kp-jobs/${created.id}`);
    } catch (e: any) {
      const respData = e?.response?.data;
      const detail =
        typeof respData?.detail === 'string'
          ? respData.detail
          : Array.isArray(respData?.detail)
            ? respData.detail
                .map((d: any) => d?.msg)
                .filter(Boolean)
                .join('; ')
            : e?.message || 'Не удалось запустить генерацию.';
      setStartError(detail);
      setStarting(false);
    }
  }

  // --- Render
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6">
      <div className="mb-5">
        <button
          type="button"
          onClick={() => window.close()}
          className="inline-flex items-center gap-1 text-[13px] text-[hsl(var(--muted))] hover:text-[hsl(var(--text))]"
        >
          <ArrowLeft className="h-4 w-4" />
          Закрыть вкладку
        </button>
      </div>

      <h1 className="font-display text-[22px] font-semibold tracking-tight text-[hsl(var(--text))]">
        <Sparkles className="mr-1.5 inline h-5 w-5 -translate-y-0.5 text-violet-600" />
        Новая партия КП
      </h1>
      <p className="mt-1 text-[13px] text-[hsl(var(--muted))]">
        {companyIds
          ? `${companyIds.length} ${companyIds.length === 1 ? 'компания' : 'компаний'} — выбери шаблон отправителя и тон, начнём генерацию.`
          : 'Загружаю список компаний…'}
      </p>

      {resolveError && (
        <CardV2 className="mt-5 border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-700">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="flex-1">{resolveError}</div>
          </div>
          <div className="mt-3">
            <ButtonV2
              variant="secondary"
              size="sm"
              onClick={() => window.close()}
            >
              Закрыть вкладку
            </ButtonV2>
          </div>
        </CardV2>
      )}

      {!resolveError && companyIds && (
        <div className="mt-6 space-y-5">
          {/* Шаблон */}
          <div>
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-[hsl(var(--muted))]">
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
              <p className="mt-1 text-[11px] italic text-[hsl(var(--muted))]">
                Пишешь от лица: {selectedTemplate.sender_profile}
              </p>
            )}
          </div>

          {isCustom && (
            <div>
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-[hsl(var(--muted))]">
                Кто ты — 1-2 предложения
              </label>
              <textarea
                value={customSenderProfile}
                onChange={(e) => setCustomSenderProfile(e.target.value)}
                rows={3}
                maxLength={600}
                placeholder="Например: маркетолог-фрилансер, делаю настройку Яндекс.Директа и веду рекламные кампании."
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </div>
          )}

          <div>
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-[hsl(var(--muted))]">
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

          {/* Калькулятор «что выжмем» — независимый блок, не влияет на старт.
              Юзеру нужен сразу до отправки, чтобы понять, имеет ли смысл
              катать партию из N компаний или поднять/опустить лимит. */}
          <ColdEmailCalculator letterCount={companyIds.length} />

          {startError && (
            <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {startError}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <ButtonV2
              variant="ghost"
              size="md"
              onClick={() => window.close()}
              disabled={starting}
            >
              Отмена
            </ButtonV2>
            <ButtonV2
              variant="primary"
              size="md"
              loading={starting}
              disabled={starting || !selectedKey || templatesLoading}
              onClick={handleStart}
              iconLeft={!starting ? <Sparkles /> : undefined}
            >
              Сгенерировать ({companyIds.length})
            </ButtonV2>
          </div>
        </div>
      )}
    </div>
  );
}
