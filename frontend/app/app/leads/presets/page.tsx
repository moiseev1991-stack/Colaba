'use client';

/**
 * /app/leads/presets — управление моими пресетами фильтров (модуль maps).
 *
 * Создание тут не делается — пресеты создаются на форме поиска через
 * «сохранить» (там виден актуальный фильтр). Здесь — редактирование
 * name/description/ai_prompt, скрытие/возврат, удаление.
 *
 * Фильтр (filter JSONB) сам по себе не редактируется в форме — показывается
 * как краткая сводка («рейтинг 4.0+, негатив 5+, слова: грязно»). Чтобы
 * поменять фильтр — нужно применить пресет на странице поиска, поправить
 * фильтры в боковой панели и сохранить заново.
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowLeft, EyeOff, Pencil, Plus, RotateCcw, Sparkles, Trash2, Filter } from 'lucide-react';

import { SaveFilterPresetModal } from '@/components/maps/SaveFilterPresetModal';
import { Dialog } from '@/components/ui/dialog';
import { CardV2 } from '@/components/ui/CardV2';
import { ButtonV2 } from '@/components/ui/ButtonV2';
import { SignalPill } from '@/components/ui/SignalPill';
import { cn } from '@/lib/utils';
import type { MapSearchFilter } from '@/src/services/api/maps';
import {
  cloneStarterPreset,
  deleteUserPreset,
  listStarterPresets,
  listUserPresets,
  updateUserPreset,
  type StarterPresetOut,
  type UserPresetOut,
  type UserPresetUpdate,
} from '@/src/services/api/user-presets';

// §4.8 ТЗ редизайна 2026-06-03 (Phase C batch 1): на v2 токенах.
const INPUT_CLS =
  'w-full rounded-v2-sm border px-2.5 py-1.5 text-sm transition-colors outline-none';
const INPUT_STYLE = { borderColor: 'hsl(var(--border))', color: 'hsl(var(--text))' } as const;

export default function MyPresetsPage() {
  const [presets, setPresets] = useState<UserPresetOut[]>([]);
  const [starters, setStarters] = useState<StarterPresetOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'active' | 'hidden'>('active');
  const [editing, setEditing] = useState<UserPresetOut | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<UserPresetOut | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [cloningSlug, setCloningSlug] = useState<string | null>(null);
  // Создание пресета прямо с этой страницы. Открываем SaveFilterPresetModal
  // с пустым фильтром — юзер сможет сохранить чистый AI-пресет (название +
  // AI-промпт без фильтров). Для пресета с фильтрами лучше идти на форму
  // поиска — оттуда виден актуальный набор.
  const [createOpen, setCreateOpen] = useState(false);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      // null = и активные, и скрытые — фильтрация по табам делается локально
      const [list, starterList] = await Promise.all([
        listUserPresets('maps', null),
        listStarterPresets().catch(() => [] as StarterPresetOut[]),
      ]);
      setPresets(list);
      setStarters(starterList);
    } catch (e: any) {
      setError(e?.message || 'Не удалось загрузить пресеты');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function doCloneStarter(s: StarterPresetOut) {
    setCloningSlug(s.slug);
    setError(null);
    try {
      const cloned = await cloneStarterPreset(s.slug);
      setPresets((prev) => [cloned, ...prev]);
      setTab('active');
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      setError(detail || e?.message || 'Не удалось скопировать пресет');
    } finally {
      setCloningSlug(null);
    }
  }

  const active = presets.filter((p) => !p.hidden);
  const hidden = presets.filter((p) => p.hidden);
  const visible = tab === 'active' ? active : hidden;

  async function toggleHidden(p: UserPresetOut, value: boolean) {
    setBusyId(p.id);
    setError(null);
    try {
      const upd = await updateUserPreset(p.id, { hidden: value });
      setPresets((prev) => prev.map((x) => (x.id === upd.id ? upd : x)));
    } catch (e: any) {
      setError(e?.message || 'Не удалось обновить пресет');
    } finally {
      setBusyId(null);
    }
  }

  async function doDelete() {
    if (!confirmDelete) return;
    setBusyId(confirmDelete.id);
    setError(null);
    try {
      await deleteUserPreset(confirmDelete.id);
      setPresets((prev) => prev.filter((p) => p.id !== confirmDelete.id));
      setConfirmDelete(null);
    } catch (e: any) {
      setError(e?.message || 'Не удалось удалить пресет');
    } finally {
      setBusyId(null);
    }
  }

  async function saveEdit(patch: UserPresetUpdate) {
    if (!editing) return;
    setBusyId(editing.id);
    setError(null);
    try {
      const upd = await updateUserPreset(editing.id, patch);
      setPresets((prev) => prev.map((x) => (x.id === upd.id ? upd : x)));
      setEditing(null);
    } catch (e: any) {
      setError(e?.message || 'Не удалось сохранить изменения');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1
            className="flex items-center gap-2 font-display font-semibold tracking-tight"
            style={{ fontSize: 'clamp(1.5rem, 3vw, 2rem)', color: 'hsl(var(--text))' }}
          >
            <Filter className="h-5 w-5 text-brand-600 dark:text-brand-400" />
            Мои пресеты фильтров
          </h1>
          <p className="mt-2 text-sm max-w-[640px]" style={{ color: 'hsl(var(--muted))' }}>
            Сохранённые наборы фильтров для поиска по картам. Создаются на форме
            поиска кнопкой «сохранить» — здесь редактируешь название, описание,
            AI-промпт, скрываешь или удаляешь.
          </p>
        </div>
        <div className="flex gap-2">
          <ButtonV2
            variant="primary"
            size="sm"
            onClick={() => setCreateOpen(true)}
            iconLeft={<Plus />}
          >
            Создать пресет
          </ButtonV2>
          <Link href="/app/leads" className="contents">
            <ButtonV2 variant="secondary" size="sm" iconLeft={<ArrowLeft />}>
              К поиску
            </ButtonV2>
          </Link>
        </div>
      </div>

      {error && (
        <div
          className="flex items-start justify-between gap-3 rounded-v2-sm border px-3 py-2 text-sm"
          style={{
            background: 'var(--signal-hot-bg)',
            borderColor: 'rgb(239 68 68 / 0.3)',
            color: 'var(--signal-hot)',
          }}
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            aria-label="Скрыть ошибку"
            className="-m-1 rounded-v2-sm p-1 transition-opacity hover:opacity-70"
            style={{ color: 'var(--signal-hot)' }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Стартовые (системные) пресеты — read-only, можно склонировать к себе. */}
      {starters.length > 0 && (
        <section>
          <h2
            className="font-display font-semibold tracking-tight text-base mb-2"
            style={{ color: 'hsl(var(--text))' }}
          >
            Стандартные пресеты
          </h2>
          <p className="text-xs mb-3" style={{ color: 'hsl(var(--muted))' }}>
            Готовые наборы фильтров под типовые сценарии. Нажми «Скопировать
            к себе» — пресет появится в активных, его можно будет править
            и применять на форме поиска.
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            {starters.map((s) => (
              <div
                key={s.slug}
                className="rounded-v2-sm border p-3"
                style={{
                  background: 'hsl(var(--surface-2))',
                  borderColor: 'hsl(var(--border))',
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className="text-sm font-medium font-display"
                        style={{ color: 'hsl(var(--text))' }}
                      >
                        {s.name}
                      </span>
                      <SignalPill tone="muted" size="sm">стандартный</SignalPill>
                      {s.ai_prompt && (
                        <SignalPill tone="accent" size="sm" icon={<Sparkles />}>
                          AI
                        </SignalPill>
                      )}
                    </div>
                    {s.description && (
                      <div
                        className="mt-1 text-[12px] leading-relaxed"
                        style={{ color: 'hsl(var(--muted))' }}
                      >
                        {s.description}
                      </div>
                    )}
                    <div className="mt-1.5 text-[12px]" style={{ color: 'hsl(var(--muted))' }}>
                      <span className="font-medium" style={{ color: 'hsl(var(--text))' }}>
                        Фильтр:{' '}
                      </span>
                      {summarizeFilter(s.filter as MapSearchFilter)}
                    </div>
                  </div>
                  <ButtonV2
                    variant="secondary"
                    size="sm"
                    onClick={() => void doCloneStarter(s)}
                    loading={cloningSlug === s.slug}
                    disabled={cloningSlug !== null}
                  >
                    Скопировать к себе
                  </ButtonV2>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <div
        className="flex items-center gap-3"
        style={{ borderBottom: '1px solid hsl(var(--border))' }}
      >
        <TabButton current={tab} value="active" onClick={setTab} count={active.length}>
          Активные
        </TabButton>
        <TabButton current={tab} value="hidden" onClick={setTab} count={hidden.length}>
          Скрытые
        </TabButton>
      </div>

      {loading ? (
        <div
          className="rounded-v2-sm border px-4 py-6 text-sm"
          style={{
            background: 'hsl(var(--surface-2))',
            borderColor: 'hsl(var(--border))',
            color: 'hsl(var(--muted))',
          }}
        >
          Загружаю пресеты…
        </div>
      ) : visible.length === 0 ? (
        <div
          className="rounded-v2-sm border px-4 py-6 text-sm"
          style={{
            background: 'hsl(var(--surface-2))',
            borderColor: 'hsl(var(--border))',
            color: 'hsl(var(--muted))',
          }}
        >
          {tab === 'active'
            ? 'Активных пресетов нет. Открой поиск по картам, настрой фильтры и нажми «сохранить» — пресет появится здесь.'
            : 'Скрытых пресетов нет. Скрыть пресет можно с этой страницы или из боковой панели поиска.'}
        </div>
      ) : (
        <CardV2 className="overflow-hidden">
          <ul className="reveal-stack divide-y" style={{ borderColor: 'hsl(var(--border))' }}>
            {visible.map((p) => (
              <li
                key={p.id}
                className="reveal-item flex items-start justify-between gap-4 px-4 py-3 transition-colors hover:bg-[hsl(var(--surface-2))]"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className="truncate text-sm font-medium font-display"
                      style={{ color: 'hsl(var(--text))' }}
                    >
                      {p.name}
                    </span>
                    {p.ai_prompt && p.ai_prompt.trim() && (
                      <SignalPill tone="accent" size="sm" icon={<Sparkles />}>
                        AI
                      </SignalPill>
                    )}
                    {p.hidden && (
                      <SignalPill tone="muted" size="sm">скрыт</SignalPill>
                    )}
                  </div>
                  {p.description && (
                    <div className="mt-0.5 text-[12px]" style={{ color: 'hsl(var(--muted))' }}>
                      {p.description}
                    </div>
                  )}
                  <div className="mt-1 text-[12px]" style={{ color: 'hsl(var(--muted))' }}>
                    <span className="font-medium" style={{ color: 'hsl(var(--text))' }}>Фильтр: </span>
                    {summarizeFilter(p.filter as MapSearchFilter)}
                  </div>
                  {p.ai_prompt && p.ai_prompt.trim() && (
                    <div
                      className="mt-1 line-clamp-2 text-[12px]"
                      style={{ color: 'rgb(139 92 246)' }}
                    >
                      <span className="font-medium">AI-промпт: </span>
                      {p.ai_prompt}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <IconButton
                    title="Редактировать"
                    onClick={() => setEditing(p)}
                    disabled={busyId === p.id}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </IconButton>
                  {p.hidden ? (
                    <IconButton
                      title="Вернуть в активные"
                      onClick={() => void toggleHidden(p, false)}
                      disabled={busyId === p.id}
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </IconButton>
                  ) : (
                    <IconButton
                      title="Скрыть"
                      onClick={() => void toggleHidden(p, true)}
                      disabled={busyId === p.id}
                    >
                      <EyeOff className="h-3.5 w-3.5" />
                    </IconButton>
                  )}
                  <IconButton
                    title="Удалить"
                    danger
                    onClick={() => setConfirmDelete(p)}
                    disabled={busyId === p.id}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </IconButton>
                </div>
              </li>
            ))}
          </ul>
        </CardV2>
      )}

      {editing && (
        <EditPresetDialog
          preset={editing}
          onClose={() => setEditing(null)}
          onSave={saveEdit}
          saving={busyId === editing.id}
        />
      )}

      <SaveFilterPresetModal
        open={createOpen}
        filter={{}}
        onClose={() => setCreateOpen(false)}
        onSaved={(p) => {
          setPresets((prev) => [p, ...prev]);
          setTab('active');
          setCreateOpen(false);
        }}
      />

      <Dialog
        open={confirmDelete !== null}
        onClose={() => busyId !== confirmDelete?.id && setConfirmDelete(null)}
        title="Удалить пресет?"
      >
        <div className="space-y-4 p-6">
          <div className="text-sm" style={{ color: 'hsl(var(--text))' }}>
            Удалить пресет <strong>«{confirmDelete?.name}»</strong> навсегда?
          </div>
          <div
            className="rounded-v2-sm border px-3 py-2 text-[12px]"
            style={{
              background: 'var(--signal-warm-bg)',
              borderColor: 'rgb(245 158 11 / 0.3)',
              color: 'var(--signal-warm)',
            }}
          >
            Если просто временно убрать с глаз — лучше «скрыть» (он уедет во вкладку «Скрытые»).
          </div>
          <div
            className="flex justify-end gap-2 pt-3"
            style={{ borderTop: '1px solid hsl(var(--border))' }}
          >
            <ButtonV2
              variant="secondary"
              size="sm"
              onClick={() => setConfirmDelete(null)}
              disabled={busyId === confirmDelete?.id}
            >
              Отмена
            </ButtonV2>
            <ButtonV2
              variant="danger"
              size="sm"
              onClick={() => void doDelete()}
              loading={busyId === confirmDelete?.id}
            >
              Удалить
            </ButtonV2>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

function TabButton({
  current,
  value,
  onClick,
  count,
  children,
}: {
  current: 'active' | 'hidden';
  value: 'active' | 'hidden';
  onClick: (v: 'active' | 'hidden') => void;
  count: number;
  children: React.ReactNode;
}) {
  const isActive = current === value;
  return (
    <button
      type="button"
      onClick={() => onClick(value)}
      className={cn(
        '-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors',
        isActive
          ? 'border-brand-500 text-brand-700 dark:border-brand-400 dark:text-brand-400'
          : 'border-transparent hover:text-[hsl(var(--text))]',
      )}
      style={isActive ? undefined : { color: 'hsl(var(--muted))' }}
    >
      {children}{' '}
      <span style={{ color: 'hsl(var(--muted))' }}>· {count}</span>
    </button>
  );
}

function IconButton({
  title,
  onClick,
  disabled,
  danger,
  children,
}: {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        // min-h-9 min-w-9 = 36px тач-таргет на mobile, на sm+ компактная p-1.5
        // (видимая иконка 14px, общая зона 36px) — аудит ловил 27×27 на мобиле.
        'inline-flex min-h-9 min-w-9 sm:min-h-0 sm:min-w-0 items-center justify-center rounded-v2-sm border bg-[hsl(var(--surface))] p-1.5 transition-colors disabled:opacity-50',
        danger
          ? 'hover:bg-[var(--signal-hot-bg)] hover:text-[color:var(--signal-hot)] hover:border-[rgb(239_68_68_/_0.3)]'
          : 'hover:bg-[hsl(var(--surface-2))] hover:text-[hsl(var(--text))]',
      )}
      style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--muted))' }}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// EditPresetDialog — модалка с редактированием name/description/ai_prompt.
// Сам filter не редактируется — нужно открыть поиск, поправить и сохранить
// заново (так filter всегда соответствует осмысленному состоянию UI).
// ---------------------------------------------------------------------------

function EditPresetDialog({
  preset,
  onClose,
  onSave,
  saving,
}: {
  preset: UserPresetOut;
  onClose: () => void;
  onSave: (patch: UserPresetUpdate) => Promise<void>;
  saving: boolean;
}) {
  const [name, setName] = useState(preset.name);
  const [description, setDescription] = useState(preset.description ?? '');
  const [aiPrompt, setAiPrompt] = useState(preset.ai_prompt ?? '');

  async function handleSave() {
    const trimmedName = name.trim();
    if (trimmedName.length < 2) return;
    await onSave({
      name: trimmedName,
      description: description.trim() || null,
      ai_prompt: aiPrompt.trim() || null,
    });
  }

  return (
    <Dialog open onClose={() => !saving && onClose()} title="Редактировать пресет">
      <div className="space-y-4 p-6">
        <div>
          <label
            className="mb-1 block text-xs font-medium"
            style={{ color: 'hsl(var(--muted))' }}
          >
            Название
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={INPUT_CLS}
            style={INPUT_STYLE}
          />
        </div>
        <div>
          <label
            className="mb-1 block text-xs font-medium"
            style={{ color: 'hsl(var(--muted))' }}
          >
            Описание (опционально)
          </label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={INPUT_CLS}
            style={INPUT_STYLE}
            placeholder="Кратко: зачем этот пресет"
          />
        </div>
        <div>
          <label
            className="mb-1 block text-xs font-medium"
            style={{ color: 'hsl(var(--muted))' }}
          >
            AI-промпт (опционально)
          </label>
          <textarea
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            rows={4}
            className={INPUT_CLS}
            style={INPUT_STYLE}
            placeholder="Например: «Оцени готовность купить SMM 1-10 по отзывам клиентов»"
          />
          <p className="mt-1 text-[11px]" style={{ color: 'hsl(var(--muted))' }}>
            Если задан — при применении пресета каждой компании выдачи будет
            автоматически посчитан score 0-10. Лимит 100 запросов в сутки на юзера.
          </p>
        </div>
        <div
          className="rounded-v2-sm border px-3 py-2 text-[12px]"
          style={{
            background: 'hsl(var(--surface-2))',
            borderColor: 'hsl(var(--border))',
            color: 'hsl(var(--text))',
          }}
        >
          <span className="font-medium">Фильтр пресета: </span>
          {summarizeFilter(preset.filter as MapSearchFilter)}
          <div className="mt-1 text-[11px]" style={{ color: 'hsl(var(--muted))' }}>
            Чтобы поменять фильтр — открой пресет на странице поиска, отредактируй
            фильтры в боковой панели и сохрани под тем же именем (старый перезапишется).
          </div>
        </div>
        <div
          className="flex justify-end gap-2 pt-3"
          style={{ borderTop: '1px solid hsl(var(--border))' }}
        >
          <ButtonV2 variant="secondary" size="sm" onClick={onClose} disabled={saving}>
            Отмена
          </ButtonV2>
          <ButtonV2
            variant="primary"
            size="sm"
            onClick={() => void handleSave()}
            disabled={name.trim().length < 2}
            loading={saving}
          >
            Сохранить
          </ButtonV2>
        </div>
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// summarizeFilter — человекочитаемая сводка MapSearchFilter.
// Не показываем sort_by и pain_tag_ids (они — конкретные id, бесполезны вне
// контекста выдачи).
// ---------------------------------------------------------------------------

function summarizeFilter(f: MapSearchFilter): string {
  const parts: string[] = [];
  if (f.min_rating != null && f.max_rating != null) {
    parts.push(`рейтинг ${f.min_rating}–${f.max_rating}`);
  } else if (f.min_rating != null) {
    parts.push(`рейтинг от ${f.min_rating}`);
  } else if (f.max_rating != null) {
    parts.push(`рейтинг до ${f.max_rating}`);
  }
  if (f.min_reviews != null) parts.push(`отзывов от ${f.min_reviews}`);
  if (f.min_negative != null) parts.push(`негатива от ${f.min_negative}`);
  if (f.has_owner_replies === true) parts.push('с ответами владельца');
  if (f.has_owner_replies === false) parts.push('без ответов владельца');
  if (f.has_website === true) parts.push('с сайтом');
  if (f.has_website === false) parts.push('без сайта');
  const contains = [
    ...(f.review_text_contains ? [f.review_text_contains] : []),
    ...(f.review_text_contains_any ?? []),
  ];
  if (contains.length > 0) parts.push(`слова: ${contains.join(', ')}`);
  const excludes = [
    ...(f.review_text_excludes ? [f.review_text_excludes] : []),
    ...(f.review_text_excludes_any ?? []),
  ];
  if (excludes.length > 0) parts.push(`без слов: ${excludes.join(', ')}`);
  return parts.length > 0 ? parts.join(' · ') : 'без фильтров';
}
