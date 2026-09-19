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
import { PageColumn, PageContainer, PageHeader } from '@/components/ui/page';
import { cn, pluralRu } from '@/lib/utils';
import { clearBulkKpPending, readBulkKpPending } from '@/lib/kp-bulk-pending';
import {
  findCommonPains,
  listKpTemplates,
  startBulkKpGeneration,
  type KpCommonPain,
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
  // 2026-07-12: общая боль партии + 4hods для всей партии.
  const [commonPains, setCommonPains] = useState<KpCommonPain[]>([]);
  const [commonPainsLoading, setCommonPainsLoading] = useState(false);
  const [selectedCommonPainId, setSelectedCommonPainId] = useState<number | null>(null);
  const [bulkUse4hods, setBulkUse4hods] = useState(false);
  const [bulkChannel, setBulkChannel] = useState<'messenger' | 'email'>('email');
  const [bulkOfferStep, setBulkOfferStep] = useState('созвон 10 минут');

  useEffect(() => {
    let cancelled = false;
    listKpTemplates()
      .then((list) => {
        if (cancelled) return;
        setTemplates(list);
        const fromOnboarding = getStoredKpTemplateKey();
        const def =
          (fromOnboarding && list.find((t) => t.key === fromOnboarding)) || list[0] || null;
        setSelectedKey(def?.key ?? null);
      })
      .catch((e: any) => {
        if (!cancelled) setTemplatesError(e?.message || 'Не удалось загрузить шаблоны КП.');
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

  // 2026-07-12: подгружаем общие боли партии как только известен список.
  // Endpoint возвращает боли, встречающиеся у ≥2 компаний.
  useEffect(() => {
    if (!companyIds || companyIds.length < 2) {
      setCommonPains([]);
      return;
    }
    let cancelled = false;
    setCommonPainsLoading(true);
    findCommonPains(companyIds)
      .then((pains) => {
        if (cancelled) return;
        setCommonPains(pains);
      })
      .catch(() => {
        // тихо — блок просто не покажется
      })
      .finally(() => {
        if (!cancelled) setCommonPainsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [companyIds]);

  async function handleStart() {
    if (!companyIds || companyIds.length === 0) return;
    if (!selectedKey || starting) return;
    if (isCustom && !customSenderProfile.trim()) {
      setStartError('Для шаблона «Свой вариант» опиши, кто ты — 1-2 предложения.');
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
        pain_tag_ids: selectedCommonPainId != null ? [selectedCommonPainId] : null,
        use_4hods: bulkUse4hods,
        channel: bulkUse4hods ? bulkChannel : undefined,
        my_offer_step: bulkUse4hods ? bulkOfferStep.trim() || null : null,
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
    <PageContainer>
      <PageColumn>
        <div className="mb-5">
          <button
            type="button"
            onClick={() => window.close()}
            className="inline-flex items-center gap-1 text-small text-ui-text-muted hover:text-ui-text"
          >
            <ArrowLeft className="h-4 w-4" />
            Закрыть вкладку
          </button>
        </div>

        <PageHeader
          title="Новая партия КП"
          description={
            companyIds
              ? `${companyIds.length} ${pluralRu(companyIds.length, ['компания', 'компании', 'компаний'])} — выберите шаблон отправителя и тон, начнём генерацию.`
              : resolveError
                ? 'Список компаний не получен.'
                : 'Загрузка списка компаний…'
          }
        />

        {resolveError && (
          <CardV2 className="mt-5 border-ui-danger/35 bg-ui-danger/[.07] px-4 py-3 text-small text-ui-danger">
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="flex-1">{resolveError}</div>
            </div>
            <div className="mt-3">
              <ButtonV2 variant="secondary" size="sm" onClick={() => window.close()}>
                Закрыть вкладку
              </ButtonV2>
            </div>
          </CardV2>
        )}

        {!resolveError && companyIds && (
          <div className="mt-6 space-y-5">
            {/* Шаблон */}
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-ui-text-muted">
                Шаблон отправителя
              </label>
              {templatesLoading ? (
                <div className="rounded-md border border-ui-border bg-ui-surface-2 px-3 py-2 text-sm text-ui-text-muted">
                  Загрузка шаблонов…
                </div>
              ) : templatesError ? (
                <div className="rounded-md border border-ui-danger/35 bg-ui-danger/[.07] px-3 py-2 text-sm text-ui-danger">
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
                          'rounded-md border px-2.5 py-1 text-small font-medium transition-colors',
                          active
                            ? 'border-ui-accent bg-ui-accent text-white shadow-sm'
                            : 'border-ui-border bg-white text-ui-text hover:border-ui-text-muted/40',
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
                <p className="mt-1 text-xs italic text-ui-text-muted">
                  Пишешь от лица: {selectedTemplate.sender_profile}
                </p>
              )}
            </div>

            {isCustom && (
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-ui-text-muted">
                  Кто ты — 1-2 предложения
                </label>
                <textarea
                  value={customSenderProfile}
                  onChange={(e) => setCustomSenderProfile(e.target.value)}
                  rows={3}
                  maxLength={600}
                  placeholder="Например: маркетолог-фрилансер, делаю настройку Яндекс.Директа и веду рекламные кампании."
                  className="w-full rounded-md border border-ui-border bg-white px-3 py-2 text-sm text-ui-text placeholder:text-ui-text-muted focus:border-ui-accent focus:outline-none focus:ring-2 focus:ring-ui-accent/25"
                />
              </div>
            )}

            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-ui-text-muted">
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
                        'rounded-md border px-2.5 py-1 text-small font-medium transition-colors',
                        active
                          ? 'border-ui-accent bg-ui-accent/[.07] text-ui-accent'
                          : 'border-ui-border bg-white text-ui-text hover:border-ui-text-muted/40',
                      )}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 2026-07-12: Общая боль партии — если у ≥2 компаний есть
              общий pain, юзер может выбрать его и получить КП по этой
              боли ВСЕЙ партии (унифицированный оффер). Иначе — каждой
              компании берётся её топ-1 автоматически. */}
            {!commonPainsLoading && commonPains.length > 0 && (
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-ui-text-muted">
                  Общая боль партии{' '}
                  <span className="normal-case text-xs text-ui-text-muted">
                    · {commonPains.length} найдено, {companyIds.length} компаний
                  </span>
                </label>
                <div className="space-y-1.5 rounded-md border border-ui-border bg-ui-surface-2 p-2">
                  <label className="flex cursor-pointer items-start gap-2 rounded px-1.5 py-1 text-small hover:bg-ui-surface-2">
                    <input
                      type="radio"
                      name="common-pain"
                      checked={selectedCommonPainId === null}
                      onChange={() => setSelectedCommonPainId(null)}
                      className="mt-0.5 h-3.5 w-3.5 accent-[hsl(var(--color-accent))]"
                    />
                    <span className="flex-1">
                      <span className="font-medium">Автоматически</span>
                      <span className="ml-1.5 text-ui-text-muted">
                        · каждой компании — её топ-1 боль
                      </span>
                    </span>
                  </label>
                  {commonPains.slice(0, 8).map((p) => (
                    <label
                      key={p.pain_tag_id}
                      className={cn(
                        'flex cursor-pointer items-start gap-2 rounded px-1.5 py-1 text-small transition-colors',
                        selectedCommonPainId === p.pain_tag_id
                          ? 'bg-ui-accent/10'
                          : 'hover:bg-ui-surface-2',
                      )}
                    >
                      <input
                        type="radio"
                        name="common-pain"
                        checked={selectedCommonPainId === p.pain_tag_id}
                        onChange={() => setSelectedCommonPainId(p.pain_tag_id)}
                        className="mt-0.5 h-3.5 w-3.5 accent-[hsl(var(--color-accent))]"
                      />
                      <span className="flex-1">
                        <span className="font-medium text-ui-text">{p.label}</span>
                        <span className="ml-1.5 text-ui-text-muted">
                          · {p.companies_hit} из {companyIds.length} компаний · {p.total_mentions}{' '}
                          упоминаний
                        </span>
                        {p.example_quote && (
                          <span className="block truncate text-xs italic text-ui-text-muted">
                            «{p.example_quote.slice(0, 100)}
                            {p.example_quote.length > 100 ? '…' : ''}»
                          </span>
                        )}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* 2026-07-12: включить «4 хода» для всей партии. */}
            <div className="rounded-md border border-ui-border bg-white p-3">
              <label className="flex cursor-pointer items-start gap-2">
                <input
                  type="checkbox"
                  checked={bulkUse4hods}
                  onChange={(e) => setBulkUse4hods(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-[hsl(var(--color-accent))]"
                />
                <span className="flex-1 text-small">
                  <span className="font-medium text-ui-text">Промпт «4 хода» для всей партии</span>
                  <span className="ml-1 rounded-full bg-ui-accent/10 px-1.5 py-0.5 text-xs font-medium uppercase tracking-wide text-ui-accent">
                    beta
                  </span>
                  <span className="block text-xs text-ui-text-muted">
                    Каркас: наблюдение → что стоит клиенту → решение результатом → микрошаг.
                    Справочник — «автоматизация связи».
                  </span>
                </span>
              </label>
              {bulkUse4hods && (
                <div className="mt-3 space-y-2 border-t border-ui-border pt-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-ui-text-muted">
                      Канал
                    </label>
                    <div className="inline-flex rounded-md border border-ui-border bg-ui-surface-2 p-0.5">
                      {(['messenger', 'email'] as const).map((c) => {
                        const active = bulkChannel === c;
                        return (
                          <button
                            key={c}
                            type="button"
                            onClick={() => setBulkChannel(c)}
                            className={cn(
                              'rounded px-2.5 py-1 text-xs font-medium transition-colors',
                              active
                                ? 'bg-white text-ui-text shadow-sm ring-1 ring-ui-border'
                                : 'text-ui-text-muted hover:text-ui-text',
                            )}
                          >
                            {c === 'messenger' ? 'Мессенджер' : 'Email'}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-ui-text-muted">
                      Микрошаг (ХОД 4)
                    </label>
                    <input
                      type="text"
                      value={bulkOfferStep}
                      onChange={(e) => setBulkOfferStep(e.target.value)}
                      placeholder="созвон 10 минут / показ на примере / мини-аудит"
                      maxLength={200}
                      className="w-full rounded-md border border-ui-border bg-white px-3 py-1.5 text-xs text-ui-text placeholder:text-ui-text-muted focus:border-ui-accent focus:outline-none focus:ring-2 focus:ring-ui-accent/25"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* 19.09 (@user): калькулятор выручки убран — вместо прогнозных цифр коротко,
              что получится на выходе партии. */}
            <div className="rounded-card bg-ui-surface-2 px-4 py-3 text-small text-ui-text-muted">
              <b className="font-semibold text-ui-text">Что получится:</b> по каждой из{' '}
              {companyIds.length}{' '}
              {pluralRu(companyIds.length, ['компании', 'компаний', 'компаний'])} — готовое КП под
              её боль из отзывов. На странице партии скачаете таблицу: контакты (телефон, email,
              сайт, мессенджеры) и текст КП по каждой.
            </div>

            {startError && (
              <div className="rounded-md border border-ui-danger/35 bg-ui-danger/[.07] px-3 py-2 text-sm text-ui-danger">
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
      </PageColumn>
    </PageContainer>
  );
}
