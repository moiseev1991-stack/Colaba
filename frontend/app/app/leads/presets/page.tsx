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
import { ArrowLeft, EyeOff, Pencil, Plus, RotateCcw, Sparkles, Trash2 } from 'lucide-react';

import { SaveFilterPresetModal } from '@/components/maps/SaveFilterPresetModal';
import { Dialog } from '@/components/ui/dialog';
import type { MapSearchFilter } from '@/src/services/api/maps';
import {
  deleteUserPreset,
  listUserPresets,
  updateUserPreset,
  type UserPresetOut,
  type UserPresetUpdate,
} from '@/src/services/api/user-presets';

export default function MyPresetsPage() {
  const [presets, setPresets] = useState<UserPresetOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'active' | 'hidden'>('active');
  const [editing, setEditing] = useState<UserPresetOut | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<UserPresetOut | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
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
      const list = await listUserPresets('maps', null);
      setPresets(list);
    } catch (e: any) {
      setError(e?.message || 'Не удалось загрузить пресеты');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

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
    <div className="mx-auto max-w-[1000px] space-y-5 px-6 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Мои пресеты фильтров</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Сохранённые наборы фильтров для поиска по картам. Создаются на форме
            поиска кнопкой «сохранить» — здесь редактируешь название, описание,
            AI-промпт, скрываешь или удаляешь.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
          >
            <Plus className="h-4 w-4" /> Создать пресет
          </button>
          <Link
            href="/app/leads"
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <ArrowLeft className="h-4 w-4" /> К поиску
          </Link>
        </div>
      </div>

      {error && (
        <div className="flex items-start justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-700/50 dark:bg-red-900/30 dark:text-red-300">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            aria-label="Скрыть ошибку"
            className="-m-1 rounded p-1 text-red-500 hover:bg-red-100 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-900/50 dark:hover:text-red-200"
          >
            ✕
          </button>
        </div>
      )}

      <div className="flex items-center gap-3 border-b border-slate-200 dark:border-slate-700">
        <TabButton current={tab} value="active" onClick={setTab} count={active.length}>
          Активные
        </TabButton>
        <TabButton current={tab} value="hidden" onClick={setTab} count={hidden.length}>
          Скрытые
        </TabButton>
      </div>

      {loading ? (
        <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-400">
          Загружаю пресеты…
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-400">
          {tab === 'active'
            ? 'Активных пресетов нет. Открой поиск по картам, настрой фильтры и нажми «сохранить» — пресет появится здесь.'
            : 'Скрытых пресетов нет. Скрыть пресет можно с этой страницы или из боковой панели поиска.'}
        </div>
      ) : (
        <ul className="divide-y divide-slate-200 rounded-md border border-slate-200 bg-white dark:divide-slate-700 dark:border-slate-700 dark:bg-slate-900">
          {visible.map((p) => (
            <li key={p.id} className="flex items-start justify-between gap-4 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{p.name}</span>
                  {p.ai_prompt && p.ai_prompt.trim() && (
                    <span className="inline-flex items-center gap-0.5 rounded bg-violet-100 px-1.5 py-0 text-[10px] font-semibold text-violet-800 dark:bg-violet-900/40 dark:text-violet-300">
                      <Sparkles className="h-2.5 w-2.5" /> AI
                    </span>
                  )}
                  {p.hidden && (
                    <span className="rounded bg-slate-200 px-1.5 py-0 text-[10px] font-medium text-slate-700 dark:bg-slate-700 dark:text-slate-300">
                      скрыт
                    </span>
                  )}
                </div>
                {p.description && (
                  <div className="mt-0.5 text-[12px] text-slate-500 dark:text-slate-400">{p.description}</div>
                )}
                <div className="mt-1 text-[12px] text-slate-500 dark:text-slate-400">
                  <span className="font-medium text-slate-600 dark:text-slate-300">Фильтр: </span>
                  {summarizeFilter(p.filter as MapSearchFilter)}
                </div>
                {p.ai_prompt && p.ai_prompt.trim() && (
                  <div className="mt-1 line-clamp-2 text-[12px] text-violet-700/90 dark:text-violet-300/90">
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
          <div className="text-sm text-slate-700 dark:text-slate-200">
            Удалить пресет <strong>«{confirmDelete?.name}»</strong> навсегда?
          </div>
          <div className="rounded-md border border-amber-200 bg-amber-50/60 px-3 py-2 text-[12px] text-amber-800 dark:border-amber-700/50 dark:bg-amber-900/30 dark:text-amber-300">
            Если просто временно убрать с глаз — лучше «скрыть» (он уедет во вкладку «Скрытые»).
          </div>
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-700">
            <button
              type="button"
              onClick={() => setConfirmDelete(null)}
              disabled={busyId === confirmDelete?.id}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              Отмена
            </button>
            <button
              type="button"
              onClick={() => void doDelete()}
              disabled={busyId === confirmDelete?.id}
              className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {busyId === confirmDelete?.id ? 'Удаляю…' : 'Удалить'}
            </button>
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
  const active = current === value;
  return (
    <button
      type="button"
      onClick={() => onClick(value)}
      className={
        '-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ' +
        (active
          ? 'border-slate-900 text-slate-900 dark:border-slate-100 dark:text-slate-100'
          : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700 dark:text-slate-400 dark:hover:border-slate-600 dark:hover:text-slate-200')
      }
    >
      {children} <span className="text-slate-400">· {count}</span>
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
      className={
        // min-h-9 min-w-9 = 36px тач-таргет на mobile, на sm+ компактная p-1.5
        // (видимая иконка 14px, общая зона 36px) — аудит ловил 27×27 на мобиле.
        'inline-flex min-h-9 min-w-9 items-center justify-center rounded-md border bg-white p-1.5 text-slate-600 disabled:opacity-50 sm:min-h-0 sm:min-w-0 dark:bg-slate-800 dark:text-slate-300 ' +
        (danger
          ? 'border-slate-300 hover:border-red-300 hover:bg-red-50 hover:text-red-700 dark:border-slate-600 dark:hover:border-red-700/60 dark:hover:bg-red-900/30 dark:hover:text-red-300'
          : 'border-slate-300 hover:bg-slate-50 hover:text-slate-900 dark:border-slate-600 dark:hover:bg-slate-700 dark:hover:text-white')
      }
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
          <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">Название</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-slate-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-slate-400"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">Описание (опционально)</label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-slate-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-slate-400"
            placeholder="Кратко: зачем этот пресет"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
            AI-промпт (опционально)
          </label>
          <textarea
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            rows={4}
            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-slate-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-slate-400"
            placeholder="Например: «Оцени готовность купить SMM 1-10 по отзывам клиентов»"
          />
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            Если задан — при применении пресета каждой компании выдачи будет
            автоматически посчитан score 0-10. Лимит 100 запросов в сутки на юзера.
          </p>
        </div>
        <div className="rounded-md border border-slate-200 bg-slate-50/50 px-3 py-2 text-[12px] text-slate-600 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-300">
          <span className="font-medium">Фильтр пресета: </span>
          {summarizeFilter(preset.filter as MapSearchFilter)}
          <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            Чтобы поменять фильтр — открой пресет на странице поиска, отредактируй
            фильтры в боковой панели и сохрани под тем же именем (старый перезапишется).
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-700">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || name.trim().length < 2}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
          >
            {saving ? 'Сохраняю…' : 'Сохранить'}
          </button>
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
