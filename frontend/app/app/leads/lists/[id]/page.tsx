'use client';

/**
 * /app/leads/lists/[id] — детали списка лидов.
 *
 * Показывает компании со всеми болями + контактами + кнопками. Из шапки
 * списка доступна кнопка «Создать кампанию» (CreateCampaignFromListModal).
 */

import { ArrowLeft, Mail, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { CreateCampaignFromListModal } from '@/components/maps/CreateCampaignFromListModal';
import { DraftEmailModal } from '@/components/maps/DraftEmailModal';
import { MapsCompanyCard } from '@/components/maps/MapsCompanyCard';
import {
  getLeadList,
  removeLeadListItem,
  type LeadListDetailOut,
} from '@/src/services/api/leadLists';
import {
  draftEmailForCompany,
  type CompanyOut,
  type OutreachDraftOut,
} from '@/src/services/api/maps';

export default function LeadListDetailPage() {
  const params = useParams<{ id: string }>();
  const listId = Number(params?.id);

  const [data, setData] = useState<LeadListDetailOut | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [campaignOpen, setCampaignOpen] = useState(false);

  const [draftOpen, setDraftOpen] = useState(false);
  const [draftLoading, setDraftLoading] = useState(false);
  const [draftData, setDraftData] = useState<OutreachDraftOut | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [draftLoadingCompanyId, setDraftLoadingCompanyId] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    if (!listId) return;
    setLoading(true);
    setError(null);
    try {
      setData(await getLeadList(listId));
    } catch (e: any) {
      setError(e?.response?.data?.detail || e?.message || 'Не удалось загрузить список');
    } finally {
      setLoading(false);
    }
  }, [listId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function remove(company: CompanyOut) {
    if (!data) return;
    if (!confirm(`Убрать «${company.name}» из списка?`)) return;
    try {
      await removeLeadListItem(data.id, company.id);
      setData({
        ...data,
        items: data.items.filter((c) => c.id !== company.id),
        items_count: Math.max(0, data.items_count - 1),
      });
    } catch (e: any) {
      setError(e?.message || 'Не удалось удалить');
    }
  }

  const onDraftEmail = useCallback(async (c: any) => {
    const id = c.id ?? c.company_id;
    if (id == null) return;
    setDraftOpen(true);
    setDraftLoading(true);
    setDraftLoadingCompanyId(id);
    setDraftData(null);
    setDraftError(null);
    try {
      setDraftData(await draftEmailForCompany(id));
    } catch (e: any) {
      const detail = e?.response?.data?.detail || e?.message || 'Не удалось сгенерировать письмо';
      setDraftError(typeof detail === 'string' ? detail : JSON.stringify(detail));
    } finally {
      setDraftLoading(false);
      setDraftLoadingCompanyId(null);
    }
  }, []);

  if (loading) {
    return (
      <div className="mx-auto max-w-[1000px] px-6 py-6 text-sm text-slate-500">
        Загружаю список…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-[1000px] space-y-3 px-6 py-6">
        <Link
          href="/app/leads/lists"
          className="inline-flex items-center gap-1 text-sm text-slate-600 hover:underline"
        >
          <ArrowLeft className="h-4 w-4" /> К спискам
        </Link>
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error || 'Список не найден'}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1100px] space-y-5 px-6 py-6">
      <Link
        href="/app/leads/lists"
        className="inline-flex items-center gap-1 text-sm text-slate-600 hover:underline"
      >
        <ArrowLeft className="h-4 w-4" /> К спискам
      </Link>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">{data.name}</h1>
          <p className="text-sm text-slate-500">
            {data.items_count} {data.items_count === 1 ? 'компания' : 'компаний'}
            {data.description ? ` · ${data.description}` : ''}
          </p>
        </div>
        <button
          onClick={() => setCampaignOpen(true)}
          disabled={data.items_count === 0}
          className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          <Mail className="h-4 w-4" />
          Создать кампанию
        </button>
      </div>

      {data.items.length === 0 ? (
        <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
          Список пуст. Открой{' '}
          <Link href="/app/leads" className="text-slate-900 underline">
            поиск по картам
          </Link>{' '}
          и добавь компании.
        </div>
      ) : (
        <ul className="divide-y divide-slate-200 rounded-md border border-slate-200 bg-white">
          {data.items.map((c) => (
            <li key={c.id} className="relative">
              <MapsCompanyCard
                company={c}
                onDraftEmail={onDraftEmail}
                draftEmailLoading={draftLoadingCompanyId === c.id}
              />
              <button
                onClick={() => remove(c)}
                className="absolute right-3 top-3 rounded-md p-1 text-slate-400 hover:bg-red-50 hover:text-red-700"
                title="Убрать из списка"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <CreateCampaignFromListModal
        open={campaignOpen}
        listId={data.id}
        listName={data.name}
        itemsCount={data.items_count}
        onClose={() => setCampaignOpen(false)}
      />

      <DraftEmailModal
        open={draftOpen}
        draft={draftData}
        loading={draftLoading}
        error={draftError}
        onClose={() => setDraftOpen(false)}
      />
    </div>
  );
}
