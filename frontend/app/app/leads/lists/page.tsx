'use client';

/**
 * /app/leads/lists — мои списки лидов.
 *
 * Простой плоский лист с количеством элементов и датой создания.
 * Создание и удаление — здесь же.
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ListPlus, Trash2 } from 'lucide-react';

import {
  createLeadList,
  deleteLeadList,
  listMyLeadLists,
  type LeadListOut,
} from '@/src/services/api/leadLists';

export default function LeadListsPage() {
  const [lists, setLists] = useState<LeadListOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      setLists(await listMyLeadLists());
    } catch (e: any) {
      setError(e?.message || 'Не удалось загрузить списки');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function create() {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    try {
      await createLeadList({ name, source: 'maps' });
      setNewName('');
      await refresh();
    } catch (e: any) {
      setError(e?.message || 'Не удалось создать');
    } finally {
      setCreating(false);
    }
  }

  async function remove(id: number) {
    if (!confirm('Удалить список вместе со связями?')) return;
    setDeletingId(id);
    try {
      await deleteLeadList(id);
      setLists((prev) => prev.filter((l) => l.id !== id));
    } catch (e: any) {
      setError(e?.message || 'Не удалось удалить');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="mx-auto max-w-[1000px] space-y-5 px-6 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Списки лидов</h1>
          <p className="text-sm text-slate-500">
            Сохранённые карточки компаний из поиска по картам. Из списка можно создать
            email-кампанию.
          </p>
        </div>
        <Link
          href="/app/leads"
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          ← К поиску
        </Link>
      </div>

      {error && (
        <div className="rounded-v2-sm border border-[color:var(--signal-hot)]/30 bg-[var(--signal-hot-bg)] px-3 py-2 text-sm text-[color:var(--signal-hot)]">
          {error}
        </div>
      )}

      <div className="rounded-md border border-dashed border-slate-300 px-4 py-3">
        <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-slate-500">
          Новый список
        </div>
        <div className="flex gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Например: Стоматологии Москвы / горячие"
            className="flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-slate-500"
          />
          <button
            onClick={create}
            disabled={creating || !newName.trim()}
            className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            <ListPlus className="h-4 w-4" />
            {creating ? '…' : 'Создать'}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
          Загружаю списки…
        </div>
      ) : lists.length === 0 ? (
        <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
          Пока нет списков. Создай первый сверху, или из карточки компании в поиске.
        </div>
      ) : (
        <ul className="divide-y divide-slate-200 rounded-md border border-slate-200">
          {lists.map((l) => (
            <li key={l.id} className="flex items-center justify-between px-4 py-3 hover:bg-slate-50">
              <div className="min-w-0 flex-1">
                <Link
                  href={`/app/leads/lists/${l.id}`}
                  className="block truncate text-sm font-medium text-slate-900 hover:underline"
                >
                  {l.name}
                </Link>
                <div className="text-[12px] text-slate-500">
                  {l.items_count} {l.items_count === 1 ? 'компания' : 'компаний'} ·{' '}
                  {new Date(l.created_at).toLocaleDateString('ru-RU')}
                </div>
              </div>
              <button
                onClick={() => remove(l.id)}
                disabled={deletingId === l.id}
                className="inline-flex items-center gap-1 rounded-v2-sm border border-slate-300 bg-white px-2.5 py-1 text-[12px] font-medium text-slate-600 hover:bg-[var(--signal-hot-bg)] hover:text-[color:var(--signal-hot)] disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {deletingId === l.id ? '…' : 'Удалить'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
