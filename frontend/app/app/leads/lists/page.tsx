'use client';

/**
 * /app/leads/lists — мои списки лидов (вид Premium, 17.09).
 *
 * Карточка на список: название, сколько компаний, откуда и когда создан.
 * Создание и удаление — здесь же; открыть список — клик по карточке.
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ListPlus, Rows3, Trash2 } from 'lucide-react';

import { Button, buttonClass } from '@/components/ui/button';
import { confirmDialog } from '@/components/ui/confirm';
import { Input } from '@/components/ui/input';
import { PageContainer, PageHeader } from '@/components/ui/page';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/states';
import { pluralRu } from '@/lib/utils';
import {
  createLeadList,
  deleteLeadList,
  listMyLeadLists,
  type LeadListOut,
} from '@/src/services/api/leadLists';

const SOURCE_LABEL: Record<string, string> = {
  maps: 'из поиска по картам',
  sites: 'из поиска сайтов',
};

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

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    try {
      await createLeadList({ name, source: 'maps' });
      setNewName('');
      await refresh();
    } catch (e: any) {
      setError(e?.message || 'Не удалось создать список');
    } finally {
      setCreating(false);
    }
  }

  async function remove(list: LeadListOut) {
    if (
      !(await confirmDialog({
        title: `Удалить список «${list.name}»?`,
        description: 'Компании останутся в поиске — удалится только сам список.',
        confirmLabel: 'Удалить',
      }))
    )
      return;
    setDeletingId(list.id);
    try {
      await deleteLeadList(list.id);
      setLists((prev) => prev.filter((l) => l.id !== list.id));
    } catch (e: any) {
      setError(e?.message || 'Не удалось удалить список');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title="Списки лидов"
        description="Компании, которые вы сохранили из поиска. Из списка можно подготовить письма всем сразу и запустить рассылку."
        actions={
          <Link href="/app/leads" className={buttonClass({ variant: 'secondary' })}>
            К поиску
          </Link>
        }
      />

      {error && (
        <p
          role="alert"
          className="mb-4 rounded-card bg-ui-danger/[.06] px-4 py-3 text-small text-ui-danger"
        >
          {error}
        </p>
      )}

      <form
        onSubmit={create}
        className="mb-6 flex flex-col gap-3 rounded-panel border border-black/[.06] bg-ui-surface p-4 shadow-raised sm:flex-row sm:items-center sm:p-5"
      >
        <label htmlFor="new-list-name" className="shrink-0 text-sm font-bold text-ui-text sm:w-36">
          Новый список
        </label>
        <Input
          id="new-list-name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Например: стоматологии Москвы — горячие"
          className="flex-1"
        />
        <Button
          type="submit"
          loading={creating}
          disabled={!newName.trim()}
          iconLeft={<ListPlus className="h-4 w-4" />}
        >
          Создать
        </Button>
      </form>

      {loading ? (
        <div className="flex flex-col gap-2.5" aria-busy="true">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[76px]" rounded="lg" />
          ))}
        </div>
      ) : lists.length === 0 ? (
        <EmptyState
          icon={<Rows3 className="h-6 w-6" aria-hidden />}
          title="Списков пока нет"
          description="Создайте список здесь или добавьте компании кнопкой «В список» в выдаче поиска и в карточке компании."
          action={
            <Link href="/app/leads" className={buttonClass()}>
              Перейти к поиску
            </Link>
          }
        />
      ) : (
        <ul className="flex flex-col gap-2.5">
          {lists.map((l) => (
            <li
              key={l.id}
              className="relative flex items-center gap-4 rounded-panel border border-black/[.05] bg-ui-surface p-4 shadow-raised transition-all hover:-translate-y-0.5 hover:shadow-floating sm:px-5"
            >
              <span
                aria-hidden
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-ui-accent/[.08] text-ui-accent"
              >
                <Rows3 className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                {/* Ссылка растянута на всю карточку; кнопка удаления лежит поверх. */}
                <Link
                  href={`/app/leads/lists/${l.id}`}
                  className="line-clamp-2 text-base font-bold text-ui-text after:absolute after:inset-0 after:rounded-panel after:content-[''] sm:block sm:truncate"
                >
                  {l.name}
                </Link>
                <p className="mt-0.5 truncate text-small text-ui-text-muted">
                  <span className="font-semibold tabular-nums text-ui-text">{l.items_count}</span>{' '}
                  {pluralRu(l.items_count, ['компания', 'компании', 'компаний'])}
                  {SOURCE_LABEL[l.source] ? ` · ${SOURCE_LABEL[l.source]}` : ''} · создан{' '}
                  {new Date(l.created_at).toLocaleDateString('ru-RU')}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => remove(l)}
                loading={deletingId === l.id}
                aria-label={`Удалить список «${l.name}»`}
                title="Удалить список"
                className="relative z-10 text-ui-text-muted hover:bg-ui-danger/10 hover:text-ui-danger"
              >
                {deletingId !== l.id && <Trash2 className="h-4 w-4" aria-hidden />}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </PageContainer>
  );
}
