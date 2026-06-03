'use client';

/**
 * Модалка «Сохранить как пресет».
 *
 * Принимает текущий MapSearchFilter из панели и предлагает сохранить
 * его с именем + опциональным описанием. По 409 (имя занято) — показывает
 * inline-ошибку, не закрывает модал.
 */

import { useEffect, useState } from 'react';

import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ButtonV2 } from '@/components/ui/ButtonV2';
import type { MapSearchFilter } from '@/src/services/api/maps';
import { createUserPreset, type UserPresetOut } from '@/src/services/api/user-presets';

interface Props {
  open: boolean;
  filter: MapSearchFilter;
  onClose: () => void;
  onSaved: (preset: UserPresetOut) => void;
  /** Опциональные пред-заполненные поля. Используется когда юзер кликает
   *  встроенный пресет с готовым AI-промптом и хочет «копировать его в
   *  свой пресет» одним кликом. */
  defaultName?: string;
  defaultAiPrompt?: string;
}

export function SaveFilterPresetModal({
  open, filter, onClose, onSaved, defaultName, defaultAiPrompt,
}: Props) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [aiPrompt, setAiPrompt] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset state каждый раз при открытии — иначе после закрытия с ошибкой
  // повторное открытие показало бы старое значение и старую ошибку.
  // Префиксы из defaultName/defaultAiPrompt подхватываются именно здесь.
  useEffect(() => {
    if (open) {
      setName(defaultName ?? '');
      setDescription('');
      setAiPrompt(defaultAiPrompt ?? '');
      setError(null);
      setIsSaving(false);
    }
  }, [open, defaultName, defaultAiPrompt]);

  const summary = describeFilter(filter);
  // С AI-промптом можно сохранить даже без фильтров — пресет работает как
  // «AI-критерий» для оценки выдачи. Без промпта и без фильтров — нечего
  // сохранять.
  const isEmpty = summary.length === 0 && !aiPrompt.trim();
  const canSave = name.trim().length > 0 && !isSaving && !isEmpty;

  async function handleSave() {
    if (!canSave) return;
    setIsSaving(true);
    setError(null);
    try {
      const preset = await createUserPreset({
        name: name.trim(),
        description: description.trim() || null,
        module: 'maps',
        filter: filter as unknown as Record<string, unknown>,
        ai_prompt: aiPrompt.trim() || null,
      });
      onSaved(preset);
      onClose();
    } catch (e: unknown) {
      const detail =
        (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        (e as { message?: string })?.message ||
        'Не удалось сохранить пресет';
      setError(typeof detail === 'string' ? detail : 'Не удалось сохранить пресет');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Сохранить как пресет">
      <div className="space-y-4 p-6">
        {isEmpty ? (
          <div className="rounded-v2-sm border border-amber-200/60 bg-[var(--signal-warm-bg)] px-3 py-2 text-sm text-[color:var(--signal-warm)] dark:border-amber-500/30">
            Настройте фильтры в панели слева или задайте AI-промпт ниже — пустой
            пресет сохранять не имеет смысла.
          </div>
        ) : null}
        <div>
          <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-[hsl(var(--muted))]">
            Название
          </label>
          <Input
            type="text"
            placeholder="Например: «Барбершопы без сайта»"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={isSaving}
            autoFocus
            maxLength={100}
          />
        </div>

        <div>
          <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-[hsl(var(--muted))]">
            Описание <span className="text-[hsl(var(--muted))] opacity-70">(необязательно)</span>
          </label>
          <textarea
            placeholder="Кому продаём, как искать… — показывается в tooltip над кнопкой"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={isSaving}
            maxLength={1000}
            rows={2}
            className="w-full rounded-v2-sm border bg-[hsl(var(--surface))] px-3 py-2 text-sm text-[hsl(var(--text))] focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            style={{ borderColor: 'hsl(var(--border))' }}
          />
        </div>

        <div>
          <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-[hsl(var(--muted))]">
            AI-промпт <span className="text-[hsl(var(--muted))] opacity-70">(необязательно — оценит каждую компанию)</span>
          </label>
          <textarea
            placeholder={
              'Например: «Оцени готовность компании купить SMM-услуги ' +
              'по шкале 0-10 на основе данных и отзывов»'
            }
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            disabled={isSaving}
            maxLength={4000}
            rows={3}
            className="w-full rounded-v2-sm border bg-[hsl(var(--surface))] px-3 py-2 text-sm text-[hsl(var(--text))] focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            style={{ borderColor: 'hsl(var(--border))' }}
          />
          <p className="mt-1 text-[11px] text-[hsl(var(--muted))]">
            Когда применишь этот пресет — для каждой компании выдачи LLM (gpt-4o-mini
            через ProxyAPI) посчитает score 0-10 + краткий комментарий. Лимит — 100
            анализов в сутки. Кэшируется по тексту промпта (повторно не платишь).
          </p>
        </div>

        {summary.length > 0 && (
          <div>
            <div className="mb-1 text-[11px] font-medium uppercase tracking-wider text-[hsl(var(--muted))]">
              Будет сохранено:
            </div>
            <ul className="space-y-0.5 rounded-v2-sm bg-[hsl(var(--surface-2))] p-2.5 text-xs text-[hsl(var(--text))]">
              {summary.map((line, i) => (
                <li key={i}>• {line}</li>
              ))}
            </ul>
          </div>
        )}

        {error && (
          <div className="rounded-v2-sm border border-red-200/60 bg-[var(--signal-hot-bg)] px-3 py-2 text-sm text-[color:var(--signal-hot)] dark:border-red-500/30">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 border-t pt-3" style={{ borderColor: 'hsl(var(--border))' }}>
          <ButtonV2
            variant="secondary"
            size="md"
            onClick={onClose}
            disabled={isSaving}
          >
            Отмена
          </ButtonV2>
          <ButtonV2
            variant="primary"
            size="md"
            onClick={handleSave}
            disabled={!canSave}
            loading={isSaving}
          >
            Сохранить пресет
          </ButtonV2>
        </div>
      </div>
    </Dialog>
  );
}

/**
 * Возвращает массив строк-описаний активных фильтров для превью в модалке.
 * Пустой массив — фильтров нет, кнопка save заблокирована.
 */
function describeFilter(f: MapSearchFilter): string[] {
  const out: string[] = [];
  if (f.min_rating != null) out.push(`Рейтинг от ${f.min_rating}`);
  if (f.max_rating != null) out.push(`Рейтинг до ${f.max_rating}`);
  if (f.min_reviews != null) out.push(`Минимум отзывов: ${f.min_reviews}`);
  if (f.min_negative != null) out.push(`Негативных от: ${f.min_negative}`);
  if (f.has_owner_replies === true) out.push('Только с ответами владельца');
  if (f.has_owner_replies === false) out.push('Только без ответов владельца');
  if (f.has_website === true) out.push('Только с сайтом');
  if (f.has_website === false) out.push('Только без сайта');
  const contains = [
    f.review_text_contains,
    ...(f.review_text_contains_any ?? []),
  ].filter(Boolean) as string[];
  if (contains.length) out.push(`В отзывах содержит: ${contains.map((w) => `«${w}»`).join(' / ')}`);
  const excludes = [
    f.review_text_excludes,
    ...(f.review_text_excludes_any ?? []),
  ].filter(Boolean) as string[];
  if (excludes.length) out.push(`В отзывах НЕ содержит: ${excludes.map((w) => `«${w}»`).join(' / ')}`);
  if (f.pain_tag_ids?.length) out.push(`Боли клиентов (теги): ${f.pain_tag_ids.length} шт.`);
  if (f.sort_by && f.sort_by !== 'rating_desc') out.push(`Сортировка: ${sortLabel(f.sort_by)}`);
  return out;
}

function sortLabel(s: string): string {
  switch (s) {
    case 'rating_asc': return 'Рейтинг ↑';
    case 'rating_desc': return 'Рейтинг ↓';
    case 'reviews_desc': return 'Больше отзывов';
    case 'negative_desc': return 'Больше негатива';
    case 'pain_desc': return 'По упоминаниям болей';
    default: return s;
  }
}
