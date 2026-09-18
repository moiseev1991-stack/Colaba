'use client';

/**
 * /app/admin/billing — админка биллинга и юзеров (суперюзер).
 * Практики enterprise-таблиц (Pencil&Paper, NN/g, 2026-09):
 * пагинация (не infinite scroll), фильтры по состоянию, сортировка,
 * master-detail (клик по строке → карточка), опасные действия —
 * красные + confirmDialog, защита от само-блокировки на бэке.
 */

import { useCallback, useEffect, useState } from 'react';
import { Ban, Coins, CreditCard, Download, Search, ShieldCheck, Users, X } from 'lucide-react';

import { apiClient } from '@/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CardV2 } from '@/components/ui/CardV2';
import { Input } from '@/components/ui/input';
import { PageContainer, PageHeader } from '@/components/ui/page';
import { Skeleton } from '@/components/ui/Skeleton';
import { SuperuserGate } from '@/components/SuperuserGate';
import { confirmDialog } from '@/components/ui/confirm';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';

interface Overview {
  users_total: number;
  active_subscriptions: number;
  subscriptions_by_tariff: Record<string, number>;
  mrr_rub: number;
  credits_in_circulation: number;
  credits_granted_total: number;
  credits_spent_total: number;
  payments_succeeded: number;
  payments_rub_total: number;
}

interface AdminUser {
  id: number;
  email: string;
  is_active: boolean;
  is_superuser: boolean;
  created_at: string | null;
  balance: number;
  subscription: { tariff_code: string; period_end: string; auto_renew: boolean } | null;
}

interface UserDetail {
  id: number;
  email: string;
  is_active: boolean;
  is_superuser: boolean;
  created_at: string | null;
  stats: { searches_count: number; last_search_at: string | null };
  balance: number;
  buckets: { source: string; remaining: number; expires_at: string | null }[];
  subscription: { tariff_code: string; period_end: string; auto_renew: boolean } | null;
  transactions: {
    id: number;
    type: string;
    amount: number;
    operation: string | null;
    comment: string | null;
    created_at: string;
  }[];
  transactions_total: number;
}

interface AdminPayment {
  id: number;
  user_id: number | null;
  email: string | null;
  tariff_code: string;
  amount_rub: number;
  credits: number;
  status: string;
  granted: boolean;
  created_at: string;
}

const STATUS_FILTERS = [
  { code: '', label: 'Все' },
  { code: 'subscriber', label: 'С подпиской' },
  { code: 'zero_balance', label: 'Без кредитов' },
  { code: 'active', label: 'Активные' },
  { code: 'blocked', label: 'Заблокированные' },
  { code: 'superuser', label: 'Админы' },
] as const;

const SORTS = [
  { code: 'created_desc', label: 'Новые сверху' },
  { code: 'created_asc', label: 'Старые сверху' },
  { code: 'email_asc', label: 'По email' },
] as const;

function fmt(n: number): string {
  return n.toLocaleString('ru-RU');
}

function dt(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit',
    month: 'short',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const SOURCE_LABELS: Record<string, string> = {
  subscription: 'Подписка',
  topup: 'Докупка',
  admin: 'Админ',
  welcome: 'Приветственные',
};

const TX_LABELS: Record<string, string> = {
  grant: 'Начисление',
  spend: 'Списание',
  refund: 'Возврат',
  expire: 'Сгорело',
};

function BillingAdminInner() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [usersTotal, setUsersTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [sort, setSort] = useState('created_desc');
  const [q, setQ] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [payments, setPayments] = useState<AdminPayment[]>([]);
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  // грант-диалог
  const [grantFor, setGrantFor] = useState<{ id: number; email: string } | null>(null);
  const [grantAmount, setGrantAmount] = useState('100');
  const [grantComment, setGrantComment] = useState('');

  const PAGE_SIZE = 25;

  const loadUsers = useCallback(
    async (opts?: { page?: number; status?: string; sort?: string; q?: string }) => {
      const p = opts?.page ?? page;
      const st = opts?.status ?? statusFilter;
      const so = opts?.sort ?? sort;
      const qq = opts?.q ?? q;
      try {
        const u = await apiClient.get<{ items: AdminUser[]; total: number; total_pages: number }>(
          '/billing/admin/users',
          { params: { q: qq, status: st, sort: so, page: p, page_size: PAGE_SIZE } },
        );
        setUsers(u.data.items);
        setUsersTotal(u.data.total);
        setTotalPages(u.data.total_pages);
        setPage(p);
      } catch {
        toast.error('Не удалось загрузить пользователей');
      }
    },
    [page, statusFilter, sort, q],
  );

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const [o, p] = await Promise.all([
        apiClient.get<Overview>('/billing/admin/overview'),
        apiClient.get<{ items: AdminPayment[] }>('/billing/admin/payments', {
          params: { page_size: 25 },
        }),
      ]);
      setOverview(o.data);
      setPayments(p.data.items);
      await loadUsers({ page: 1 });
    } catch {
      toast.error('Не удалось загрузить админку биллинга');
    } finally {
      setBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function fetchDetail(id: number): Promise<UserDetail | null> {
    const d = await apiClient
      .get<UserDetail>(`/billing/admin/users/${id}/detail`)
      .catch(() => null);
    return d ? d.data : null;
  }

  async function openDetail(u: AdminUser) {
    setDetailLoading(true);
    setDetail(null);
    const d = await fetchDetail(u.id);
    setDetail(d);
    setDetailLoading(false);
  }

  async function refreshAfterAction() {
    await loadUsers();
    if (detail) setDetail(await fetchDetail(detail.id));
    const o = await apiClient.get<Overview>('/billing/admin/overview').catch(() => null);
    if (o) setOverview(o.data);
  }

  async function doGrant() {
    if (!grantFor) return;
    const amount = parseInt(grantAmount, 10);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Количество кредитов — положительное число');
      return;
    }
    if (grantComment.trim().length < 3) {
      toast.error('Укажите причину начисления (для аудита)');
      return;
    }
    setBusy(true);
    try {
      await apiClient.post(`/billing/admin/users/${grantFor.id}/grant`, {
        amount,
        comment: grantComment.trim(),
      });
      toast.success(`Начислено ${amount} кредитов: ${grantFor.email}`);
      setGrantFor(null);
      setGrantComment('');
      await refreshAfterAction();
    } catch {
      toast.error('Начисление не удалось');
    } finally {
      setBusy(false);
    }
  }

  async function manualSubscribe(u: { id: number; email: string }, tariff: string) {
    const ok = await confirmDialog({
      title: `Выдать подписку «${tariff}»?`,
      description: `${u.email} получит тариф без оплаты, автопродление выключено.`,
      confirmLabel: 'Выдать',
      danger: false,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await apiClient.post(`/billing/admin/users/${u.id}/subscription`, {
        action: 'activate',
        tariff_code: tariff,
      });
      toast.success(`Подписка ${tariff} выдана: ${u.email}`);
      await refreshAfterAction();
    } catch {
      toast.error('Не удалось выдать подписку');
    } finally {
      setBusy(false);
    }
  }

  async function cancelSubscription(u: { id: number; email: string }) {
    const ok = await confirmDialog({
      title: 'Отменить подписку?',
      description: `${u.email}: статус cancelled, автопродление снято. Оплаченные кредиты живут до конца периода.`,
      confirmLabel: 'Отменить подписку',
      danger: false,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await apiClient.post(`/billing/admin/users/${u.id}/subscription`, { action: 'cancel' });
      toast.success(`Подписка отменена: ${u.email}`);
      await refreshAfterAction();
    } catch {
      toast.error('Не удалось отменить подписку');
    } finally {
      setBusy(false);
    }
  }

  async function toggleBlock(u: { id: number; email: string; is_active: boolean }) {
    const blocking = u.is_active;
    const ok = await confirmDialog({
      title: blocking ? `Заблокировать ${u.email}?` : `Разблокировать ${u.email}?`,
      description: blocking
        ? 'Пользователь не сможет войти. Существующие сессии живут до экспирации токена.'
        : 'Пользователь снова сможет войти.',
      confirmLabel: blocking ? 'Заблокировать' : 'Разблокировать',
      danger: blocking,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await apiClient.post(`/billing/admin/users/${u.id}/status`, { is_active: !blocking });
      toast.success(blocking ? `Заблокирован: ${u.email}` : `Разблокирован: ${u.email}`);
      await refreshAfterAction();
    } catch (e: unknown) {
      const d = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(typeof d === 'string' ? d : 'Действие не удалось');
    } finally {
      setBusy(false);
    }
  }

  async function toggleRole(u: { id: number; email: string; is_superuser: boolean }) {
    const granting = !u.is_superuser;
    const ok = await confirmDialog({
      title: granting ? `Дать права админа ${u.email}?` : `Снять права админа у ${u.email}?`,
      description: granting
        ? 'Пользователь получит доступ к служебным разделам и этой админке.'
        : 'Доступ к служебным разделам будет закрыт.',
      confirmLabel: granting ? 'Дать права' : 'Снять права',
      danger: !granting,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await apiClient.post(`/billing/admin/users/${u.id}/role`, { is_superuser: granting });
      toast.success(
        granting ? `Права админа выданы: ${u.email}` : `Права админа сняты: ${u.email}`,
      );
      await refreshAfterAction();
    } catch (e: unknown) {
      const d = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(typeof d === 'string' ? d : 'Действие не удалось');
    } finally {
      setBusy(false);
    }
  }

  function exportCsv() {
    window.open(`/api/v1/billing/admin/users/export?q=${encodeURIComponent(q)}`, '_blank');
  }

  return (
    <PageContainer>
      <PageHeader
        title="Биллинг-админ"
        description="Пользователи, подписки, кредиты и платежи. Все действия попадают в аудит (ledger + логи)."
      />

      {!overview ? (
        <div className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <>
          {/* Обзор */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <CardV2 className="p-5">
              <div className="flex items-center gap-2 text-small text-ui-text-muted">
                <Users className="h-4 w-4" aria-hidden /> Пользователей
              </div>
              <div className="mt-1.5 text-2xl font-extrabold tabular-nums text-ui-text">
                {fmt(overview.users_total)}
              </div>
            </CardV2>
            <CardV2 className="p-5">
              <div className="flex items-center gap-2 text-small text-ui-text-muted">
                <CreditCard className="h-4 w-4" aria-hidden /> Активных подписок
              </div>
              <div className="mt-1.5 text-2xl font-extrabold tabular-nums text-ui-text">
                {overview.active_subscriptions}
                <span className="ml-2 text-sm font-normal text-ui-text-muted">
                  MRR ≈ {fmt(overview.mrr_rub)} ₽
                </span>
              </div>
            </CardV2>
            <CardV2 className="p-5">
              <div className="flex items-center gap-2 text-small text-ui-text-muted">
                <Coins className="h-4 w-4" aria-hidden /> Кредитов в обороте
              </div>
              <div className="mt-1.5 text-2xl font-extrabold tabular-nums text-ui-text">
                {fmt(overview.credits_in_circulation)}
              </div>
              <div className="mt-1 text-small text-ui-text-muted">
                выдано {fmt(overview.credits_granted_total)} · списано{' '}
                {fmt(overview.credits_spent_total)}
              </div>
            </CardV2>
            <CardV2 className="p-5">
              <div className="flex items-center gap-2 text-small text-ui-text-muted">
                <CreditCard className="h-4 w-4" aria-hidden /> Платежей
              </div>
              <div className="mt-1.5 text-2xl font-extrabold tabular-nums text-ui-text">
                {overview.payments_succeeded}
                <span className="ml-2 text-sm font-normal text-ui-text-muted">
                  {fmt(overview.payments_rub_total)} ₽
                </span>
              </div>
            </CardV2>
          </div>

          {/* Пользователи */}
          <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-extrabold tracking-tight text-ui-text">
              Пользователи{' '}
              <span className="text-sm font-normal text-ui-text-muted">({fmt(usersTotal)})</span>
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  setQ(searchInput);
                  void loadUsers({ page: 1, q: searchInput });
                }}
              >
                <Input
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="email…"
                  className="w-52"
                />
                <Button
                  type="submit"
                  variant="secondary"
                  size="sm"
                  iconLeft={<Search className="h-4 w-4" />}
                >
                  Найти
                </Button>
              </form>
              <select
                value={sort}
                onChange={(e) => {
                  setSort(e.target.value);
                  void loadUsers({ page: 1, sort: e.target.value });
                }}
                className="h-9 rounded-control border border-ui-border bg-ui-surface-2 px-2.5 text-small text-ui-text"
                aria-label="Сортировка"
              >
                {SORTS.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.label}
                  </option>
                ))}
              </select>
              <Button
                variant="ghost"
                size="sm"
                iconLeft={<Download className="h-4 w-4" />}
                onClick={exportCsv}
              >
                CSV
              </Button>
            </div>
          </div>

          {/* Фильтры-чипы */}
          <div className="mt-3 flex flex-wrap gap-1.5">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.code}
                type="button"
                onClick={() => {
                  setStatusFilter(f.code);
                  void loadUsers({ page: 1, status: f.code });
                }}
                className={cn(
                  'rounded-pill border px-3 py-1 text-xs font-medium transition-colors',
                  statusFilter === f.code
                    ? 'border-ui-accent bg-ui-accent/10 text-ui-text'
                    : 'border-ui-border bg-ui-surface-2 text-ui-text-muted hover:text-ui-text',
                )}
              >
                {f.label}
              </button>
            ))}
          </div>

          <CardV2 className="mt-3 overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ui-border text-left text-small text-ui-text-muted">
                  <th className="px-4 py-2.5 font-medium">Пользователь</th>
                  <th className="px-4 py-2.5 font-medium">Статус</th>
                  <th className="px-4 py-2.5 font-medium">Баланс</th>
                  <th className="px-4 py-2.5 font-medium">Подписка</th>
                  <th className="px-4 py-2.5 font-medium">Регистрация</th>
                  <th className="px-4 py-2.5 text-right font-medium">Действия</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr
                    key={u.id}
                    className="cursor-pointer border-b border-ui-border/60 last:border-0 hover:bg-ui-surface-2/50"
                    onClick={() => void openDetail(u)}
                  >
                    <td className="px-4 py-2.5">
                      <span className="text-ui-text">{u.email}</span>
                      {u.is_superuser && (
                        <Badge tone="accent" size="sm" className="ml-2">
                          админ
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {u.is_active ? (
                        <Badge tone="success" size="sm">
                          активен
                        </Badge>
                      ) : (
                        <Badge tone="danger" size="sm">
                          заблокирован
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-2.5 font-semibold tabular-nums text-ui-text">
                      {fmt(u.balance)}
                    </td>
                    <td className="px-4 py-2.5">
                      {u.subscription ? (
                        <span className="text-ui-text">
                          {u.subscription.tariff_code}{' '}
                          <span className="text-ui-text-muted">
                            до {new Date(u.subscription.period_end).toLocaleDateString('ru-RU')}
                          </span>
                        </span>
                      ) : (
                        <span className="text-ui-text-muted">—</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-ui-text-muted">
                      {u.created_at ? new Date(u.created_at).toLocaleDateString('ru-RU') : '—'}
                    </td>
                    <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <div className="flex flex-wrap justify-end gap-1.5">
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={busy}
                          onClick={() => {
                            setGrantFor(u);
                            setGrantAmount('100');
                          }}
                        >
                          <Coins className="h-4 w-4" aria-hidden /> Кредиты
                        </Button>
                        {!u.subscription ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={busy}
                            onClick={() => void manualSubscribe(u, 'starter')}
                          >
                            Подписка
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={busy}
                            onClick={() => void cancelSubscription(u)}
                          >
                            Отменить
                          </Button>
                        )}
                        {u.is_active ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={busy}
                            className="text-ui-danger"
                            iconLeft={<Ban className="h-4 w-4" />}
                            onClick={() => void toggleBlock(u)}
                          >
                            Блок
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={busy}
                            onClick={() => void toggleBlock(u)}
                          >
                            Разблок
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardV2>

          {/* Пагинация */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <span className="text-small text-ui-text-muted">
              Страница {page} из {totalPages} · {fmt(usersTotal)} пользователей
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={page <= 1}
                onClick={() => void loadUsers({ page: page - 1 })}
              >
                ← Назад
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => void loadUsers({ page: page + 1 })}
              >
                Вперёд →
              </Button>
            </div>
          </div>

          {/* Платежи */}
          <h2 className="mt-8 text-xl font-extrabold tracking-tight text-ui-text">Платежи</h2>
          <CardV2 className="mt-3 overflow-x-auto p-0">
            {payments.length === 0 ? (
              <p className="px-6 py-6 text-center text-sm text-ui-text-muted">Платежей пока нет</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ui-border text-left text-small text-ui-text-muted">
                    <th className="px-4 py-2.5 font-medium">Дата</th>
                    <th className="px-4 py-2.5 font-medium">Пользователь</th>
                    <th className="px-4 py-2.5 font-medium">Тариф</th>
                    <th className="px-4 py-2.5 font-medium">Сумма</th>
                    <th className="px-4 py-2.5 font-medium">Статус</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p.id} className="border-b border-ui-border/60 last:border-0">
                      <td className="whitespace-nowrap px-4 py-2.5 text-ui-text-muted">
                        {dt(p.created_at)}
                      </td>
                      <td className="px-4 py-2.5 text-ui-text">{p.email ?? p.user_id}</td>
                      <td className="px-4 py-2.5 text-ui-text">{p.tariff_code}</td>
                      <td className="px-4 py-2.5 tabular-nums text-ui-text">
                        {fmt(p.amount_rub)} ₽
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge
                          tone={
                            p.status === 'succeeded'
                              ? 'success'
                              : p.status === 'cancelled'
                                ? 'danger'
                                : 'warning'
                          }
                          size="sm"
                        >
                          {p.status}
                          {p.granted ? ' · начислено' : ''}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardV2>
        </>
      )}

      {/* Диалог гранта */}
      {grantFor && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
        >
          <CardV2 className="w-full max-w-md p-6">
            <h3 className="text-lg font-bold text-ui-text">
              Начислить кредиты
              <span className="ml-2 text-sm font-normal text-ui-text-muted">{grantFor.email}</span>
            </h3>
            <p className="mt-1 text-small text-ui-text-muted">
              Кредиты не сгорают. Причина попадёт в аудит истории юзера.
            </p>
            <div className="mt-4 space-y-3">
              <Input
                type="number"
                value={grantAmount}
                onChange={(e) => setGrantAmount(e.target.value)}
                placeholder="Количество"
              />
              <Input
                value={grantComment}
                onChange={(e) => setGrantComment(e.target.value)}
                placeholder="Причина (видит юзер в истории)"
              />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setGrantFor(null)}>
                Отмена
              </Button>
              <Button variant="primary" loading={busy} onClick={() => void doGrant()}>
                Начислить
              </Button>
            </div>
          </CardV2>
        </div>
      )}

      {/* Карточка юзера (master-detail) */}
      {(detail || detailLoading) && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/40"
          role="dialog"
          aria-modal="true"
        >
          <div className="h-full w-full max-w-lg overflow-y-auto bg-ui-bg p-6 shadow-overlay">
            {detailLoading || !detail ? (
              <div className="space-y-4">
                <Skeleton className="h-8 w-3/4" />
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-40 w-full" />
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-bold text-ui-text">{detail.email}</h3>
                    <p className="mt-0.5 text-small text-ui-text-muted">
                      ID {detail.id} · с{' '}
                      {detail.created_at
                        ? new Date(detail.created_at).toLocaleDateString('ru-RU')
                        : '—'}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Закрыть"
                    onClick={() => setDetail(null)}
                  >
                    <X className="h-4 w-4" aria-hidden />
                  </Button>
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {detail.is_active ? (
                    <Badge tone="success" size="sm">
                      активен
                    </Badge>
                  ) : (
                    <Badge tone="danger" size="sm">
                      заблокирован
                    </Badge>
                  )}
                  {detail.is_superuser && (
                    <Badge tone="accent" size="sm">
                      админ
                    </Badge>
                  )}
                  {detail.subscription && (
                    <Badge tone="info" size="sm">
                      {detail.subscription.tariff_code} до{' '}
                      {new Date(detail.subscription.period_end).toLocaleDateString('ru-RU')}
                    </Badge>
                  )}
                </div>

                <div className="mt-4 grid grid-cols-3 gap-3">
                  <CardV2 className="p-4">
                    <div className="text-small text-ui-text-muted">Баланс</div>
                    <div className="mt-1 text-xl font-extrabold tabular-nums text-ui-text">
                      {fmt(detail.balance)}
                    </div>
                  </CardV2>
                  <CardV2 className="p-4">
                    <div className="text-small text-ui-text-muted">Поисков</div>
                    <div className="mt-1 text-xl font-extrabold tabular-nums text-ui-text">
                      {fmt(detail.stats.searches_count)}
                    </div>
                  </CardV2>
                  <CardV2 className="p-4">
                    <div className="text-small text-ui-text-muted">Последний поиск</div>
                    <div className="mt-1 text-small font-semibold text-ui-text">
                      {detail.stats.last_search_at
                        ? new Date(detail.stats.last_search_at).toLocaleDateString('ru-RU')
                        : '—'}
                    </div>
                  </CardV2>
                </div>

                {detail.buckets.length > 0 && (
                  <div className="mt-4">
                    <h4 className="text-sm font-bold text-ui-text">Гранты кредитов</h4>
                    <div className="mt-2 space-y-1.5">
                      {detail.buckets.map((b, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between rounded-card border border-ui-border bg-ui-surface-2/50 px-3 py-2 text-small"
                        >
                          <span className="text-ui-text">
                            {SOURCE_LABELS[b.source] ?? b.source}
                          </span>
                          <span className="tabular-nums text-ui-text-muted">
                            {fmt(b.remaining)} ·{' '}
                            {b.expires_at
                              ? `до ${new Date(b.expires_at).toLocaleDateString('ru-RU')}`
                              : 'не сгорают'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mt-4">
                  <h4 className="text-sm font-bold text-ui-text">
                    История{' '}
                    <span className="font-normal text-ui-text-muted">
                      ({fmt(detail.transactions_total)})
                    </span>
                  </h4>
                  <div className="mt-2 space-y-1.5">
                    {detail.transactions.map((t) => (
                      <div
                        key={t.id}
                        className="flex items-start justify-between gap-3 rounded-card border border-ui-border bg-ui-surface-2/50 px-3 py-2 text-small"
                      >
                        <div className="min-w-0">
                          <span className="text-ui-text">{TX_LABELS[t.type] ?? t.type}</span>
                          {t.comment && <p className="truncate text-ui-text-muted">{t.comment}</p>}
                        </div>
                        <span
                          className={cn(
                            'shrink-0 font-semibold tabular-nums',
                            t.amount > 0 ? 'text-ui-success' : 'text-ui-text',
                          )}
                        >
                          {t.amount > 0 ? '+' : ''}
                          {t.amount}
                        </span>
                      </div>
                    ))}
                    {detail.transactions.length === 0 && (
                      <p className="text-small text-ui-text-muted">Операций нет</p>
                    )}
                  </div>
                </div>

                <div className="mt-6 flex flex-wrap gap-2 border-t border-ui-border pt-4">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={busy}
                    onClick={() => {
                      setGrantFor(detail);
                      setGrantAmount('100');
                    }}
                  >
                    <Coins className="h-4 w-4" aria-hidden /> Кредиты
                  </Button>
                  {!detail.subscription ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      onClick={() => void manualSubscribe(detail, 'starter')}
                    >
                      Выдать подписку
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      onClick={() => void cancelSubscription(detail)}
                    >
                      Отменить подписку
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    className="text-ui-danger"
                    iconLeft={
                      detail.is_active ? (
                        <Ban className="h-4 w-4" />
                      ) : (
                        <ShieldCheck className="h-4 w-4" />
                      )
                    }
                    onClick={() => void toggleBlock(detail)}
                  >
                    {detail.is_active ? 'Заблокировать' : 'Разблокировать'}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    className={detail.is_superuser ? 'text-ui-danger' : ''}
                    onClick={() => void toggleRole(detail)}
                  >
                    {detail.is_superuser ? 'Снять права админа' : 'Сделать админом'}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </PageContainer>
  );
}

export default function BillingAdminPage() {
  return (
    <SuperuserGate>
      <BillingAdminInner />
    </SuperuserGate>
  );
}
