'use client';

/**
 * /app/leads/lists/[id] — детали списка лидов.
 *
 * Показывает компании со всеми болями + контактами + кнопками. Из шапки
 * списка доступна кнопка «Создать кампанию» (CreateCampaignFromListModal).
 * Вид Premium (17.09): общий PageHeader, клик по компании открывает её карточку.
 */

import { Mail, Sparkles, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { BulkDraftsModal } from '@/components/maps/BulkDraftsModal';
import { CreateCampaignFromListModal } from '@/components/maps/CreateCampaignFromListModal';
import { DraftEmailModal } from '@/components/maps/DraftEmailModal';
import { MapsCompanyCard } from '@/components/maps/MapsCompanyCard';
import { MapsCompanyDetailDrawer } from '@/components/maps/MapsCompanyDetailDrawer';
import { Button, buttonClass } from '@/components/ui/button';
import { confirmDialog } from '@/components/ui/confirm';
import { PageContainer, PageHeader } from '@/components/ui/page';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { pluralRu } from '@/lib/utils';
import { OUTREACH_SENDING_ENABLED, SENDING_SOON_HINT } from '@/lib/outreach';
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
  const [bulkDraftsOpen, setBulkDraftsOpen] = useState(false);

  const [draftOpen, setDraftOpen] = useState(false);
  const [draftLoading, setDraftLoading] = useState(false);
  const [draftData, setDraftData] = useState<OutreachDraftOut | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [draftLoadingCompanyId, setDraftLoadingCompanyId] = useState<number | null>(null);
  const [drawerCompanyId, setDrawerCompanyId] = useState<number | null>(null);

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
    if (
      !(await confirmDialog({
        title: `Убрать «${company.name}» из списка?`,
        confirmLabel: 'Убрать',
      }))
    )
      return;
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

  const crumbs = [{ label: 'Списки', href: '/app/leads/lists' }, { label: data?.name ?? 'Список' }];

  if (loading) {
    return (
      <PageContainer aria-busy="true">
        <PageHeader title="Загрузка списка…" breadcrumbs={crumbs} />
        <div className="flex flex-col gap-3.5">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-36" rounded="lg" />
          ))}
        </div>
      </PageContainer>
    );
  }

  if (!data) {
    return (
      <PageContainer>
        <PageHeader title="Список" breadcrumbs={crumbs} />
        <ErrorState
          title={error ? 'Не удалось открыть список' : 'Список не найден'}
          description={error ?? 'Возможно, его удалили.'}
          action={
            <Link href="/app/leads/lists" className={buttonClass({ variant: 'secondary' })}>
              Ко всем спискам
            </Link>
          }
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        breadcrumbs={crumbs}
        title={data.name}
        description={
          <>
            {data.items_count} {pluralRu(data.items_count, ['компания', 'компании', 'компаний'])}
            {data.description ? ` · ${data.description}` : ''}
          </>
        }
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() => setBulkDraftsOpen(true)}
              disabled={data.items_count === 0}
              title="Черновик письма для каждой компании списка"
              iconLeft={<Sparkles className="h-4 w-4" />}
            >
              Письма всем
            </Button>
            <Button
              onClick={() => setCampaignOpen(true)}
              disabled={data.items_count === 0 || !OUTREACH_SENDING_ENABLED}
              title={OUTREACH_SENDING_ENABLED ? undefined : SENDING_SOON_HINT}
              iconLeft={<Mail className="h-4 w-4" />}
            >
              Создать кампанию
            </Button>
          </>
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

      {data.items.length === 0 ? (
        <EmptyState
          title="В списке пока нет компаний"
          description="Добавьте их кнопкой «В список» в выдаче поиска или в карточке компании."
          action={
            <Link href="/app/leads" className={buttonClass()}>
              Перейти к поиску
            </Link>
          }
        />
      ) : (
        <ul className="flex flex-col gap-3.5">
          {data.items.map((c) => (
            <MapsCompanyCard
              key={c.id}
              company={c}
              onClick={() => setDrawerCompanyId(c.id)}
              onDraftEmail={onDraftEmail}
              draftEmailLoading={draftLoadingCompanyId === c.id}
              extraAction={
                <button
                  type="button"
                  onClick={(e) => {
                    // Не открывать карточку компании — клик по корзине.
                    e.stopPropagation();
                    void remove(c);
                  }}
                  title="Убрать из списка"
                  aria-label={`Убрать из списка: ${c.name}`}
                  className="grid h-9 w-9 place-items-center rounded-full bg-ui-surface-2 text-ui-text-muted transition-colors hover:bg-ui-danger/10 hover:text-ui-danger"
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              }
            />
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

      <BulkDraftsModal
        open={bulkDraftsOpen}
        listId={data.id}
        listName={data.name}
        itemsCount={data.items_count}
        onClose={() => setBulkDraftsOpen(false)}
      />

      {/* Карточка компании — без контекста поиска, как на «По боли». */}
      <MapsCompanyDetailDrawer
        companyId={drawerCompanyId}
        searchId={null}
        onClose={() => setDrawerCompanyId(null)}
      />

      <DraftEmailModal
        open={draftOpen}
        draft={draftData}
        loading={draftLoading}
        error={draftError}
        onClose={() => setDraftOpen(false)}
      />
    </PageContainer>
  );
}
