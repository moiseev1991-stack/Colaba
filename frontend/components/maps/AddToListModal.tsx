'use client';

/**
 * Модал «Добавить в список лидов».
 *
 * Показывает мои списки, даёт быстро создать новый. После выбора —
 * POST /lead-lists/{id}/items { company_ids: [...] }.
 */

import { Plus, X, ListPlus } from 'lucide-react';
import { useEffect, useState } from 'react';

import {
  addLeadListItems,
  createLeadList,
  listMyLeadLists,
  type LeadListOut,
} from '@/src/services/api/leadLists';

interface Props {
  open: boolean;
  companyIds: number[];
  defaultListName?: string;
  onClose: () => void;
  onDone?: (listId: number) => void;
}

export function AddToListModal({
  open,
  companyIds,
  defaultListName,
  onClose,
  onDone,
}: Props) {
  const [lists, setLists] = useState<LeadListOut[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setNewName(defaultListName ?? '');
    void (async () => {
      setLoading(true);
      try {
        setLists(await listMyLeadLists());
      } catch (e: any) {
        setError(e?.message || 'Не удалось загрузить списки');
      } finally {
        setLoading(false);
      }
    })();
  }, [open, defaultListName]);

  if (!open) return null;

  async function addTo(list: LeadListOut) {
    if (!companyIds.length) return;
    setSavingId(list.id);
    setError(null);
    try {
      const result = await addLeadListItems(list.id, companyIds);
      onDone?.(list.id);
      // обновляем items_count в локальном списке для UX
      setLists((prev) =>
        prev.map((l) => (l.id === list.id ? { ...l, items_count: result.items_count } : l))
      );
      onClose();
    } catch (e: any) {
      setError(e?.message || 'Не удалось добавить');
    } finally {
      setSavingId(null);
    }
  }

  async function createAndAdd() {
    const name = newName.trim();
    if (!name) {
      setError('Введи название списка');
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const list = await createLeadList({ name, source: 'maps' });
      await addLeadListItems(list.id, companyIds);
      onDone?.(list.id);
      onClose();
    } catch (e: any) {
      setError(e?.message || 'Не удалось создать список');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4 py-8">
      <div className="flex max-h-full w-full max-w-md flex-col overflow-hidden rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h3 className="text-sm font-semibold text-slate-900">
            В список лидов
            <span className="ml-2 text-[11px] font-normal text-slate-500">
              ({companyIds.length} {companyIds.length === 1 ? 'компания' : 'компаний'})
            </span>
          </h3>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {error && (
            <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Новый список */}
          <div className="rounded-md border border-dashed border-slate-300 px-3 py-3">
            <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-slate-500">
              Создать новый
            </div>
            <div className="flex gap-2">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Например: Стоматологии Москвы / горячие"
                className="flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-slate-500"
              />
              <button
                onClick={createAndAdd}
                disabled={creating || !newName.trim()}
                className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
              >
                <Plus className="h-4 w-4" />
                {creating ? '…' : 'Создать'}
              </button>
            </div>
          </div>

          <div className="mt-4 mb-2 text-[11px] font-medium uppercase tracking-wide text-slate-500">
            Существующие
          </div>

          {loading ? (
            <div className="text-sm text-slate-500">Загружаю списки…</div>
          ) : lists.length === 0 ? (
            <div className="text-sm text-slate-500">Пока нет списков. Создай первый сверху.</div>
          ) : (
            <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
              {lists.map((l) => (
                <li
                  key={l.id}
                  className="flex items-center justify-between px-3 py-2 text-sm hover:bg-slate-50"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-slate-900">{l.name}</div>
                    <div className="text-[11px] text-slate-500">
                      {l.items_count} {l.items_count === 1 ? 'компания' : 'компаний'}
                    </div>
                  </div>
                  <button
                    onClick={() => addTo(l)}
                    disabled={savingId === l.id}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-[12px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    <ListPlus className="h-3.5 w-3.5" />
                    {savingId === l.id ? '…' : 'Добавить'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
