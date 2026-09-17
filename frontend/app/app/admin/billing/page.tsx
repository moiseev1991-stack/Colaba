'use client';

/**
 * /app/admin/billing — админка биллинга (суперюзер, 2026-09).
 * Практики Stripe/EnterpriseReady: обзор → поиск юзера → действия
 * (грант кредитов, ручная подписка/отмена) → платежи; каждое действие
 * аудитируется (comment «admin:» в ledger, логи бэкенда).
 */

import { useCallback, useEffect, useState } from 'react';
import { Coins, CreditCard, Plus, Search, Users } from 'lucide-react';

import { apiClient } from '@/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CardV2 } from '@/components/ui/CardV2';
import { Input } from '@/components/ui/input';
import { PageContainer, PageHeader } from '@/components/ui/page';
import { Skeleton } from '@/components/ui/Skeleton';
import { SuperuserGate } from '@/components/SuperuserGate';
import { toast } from '@/components/ui/toast';

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
  is_superuser: boolean;
  created_at: string | null;
  balance: number;
  subscription: { tariff_code: string; period_end: string; auto_renew: boolean } | null;
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

function fmt(n: number): string {
  return n.toLocaleString('ru-RU');
}

function BillingAdminInner() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [usersTotal, setUsersTotal] = useState(0);
  const [q, setQ] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [payments, setPayments] = useState<AdminPayment[]>([]);
  const [busyUser, setBusyUser] = useState<number | null>(null);
  // грант-диалог (упрощённый: prompt-подход в модалке CardV2)
  const [grantFor, setGrantFor] = useState<AdminUser | null>(null);
  const [grantAmount, setGrantAmount] = useState('100');
  const [grantComment, setGrantComment] = useState('');

  const load = useCallback(
    async (query = q) => {
      try {
        const [o, u, p] = await Promise.all([
          apiClient.get<Overview>('/billing/admin/overview'),
          apiClient.get<{ items: AdminUser[]; total: number }>('/billing/admin/users', {
            params: { q: query, page_size: 50 },
          }),
          apiClient.get<{ items: AdminPayment[] }>('/billing/admin/payments', {
            params: { page_size: 25 },
          }),
        ]);
        setOverview(o.data);
        setUsers(u.data.items);
        setUsersTotal(u.data.total);
        setPayments(p.data.items);
      } catch {
        toast.error('Не удалось загрузить админку биллинга');
      }
    },
    [q],
  );

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    setBusyUser(grantFor.id);
    try {
      await apiClient.post(`/billing/admin/users/${grantFor.id}/grant`, {
        amount,
        comment: grantComment.trim(),
      });
      toast.success(`Начислено ${amount} кредитов: ${grantFor.email}`);
      setGrantFor(null);
      setGrantComment('');
      await load();
    } catch {
      toast.error('Начисление не удалось');
    } finally {
      setBusyUser(null);
    }
  }

  async function manualSubscribe(u: AdminUser, tariff: string) {
    setBusyUser(u.id);
    try {
      await apiClient.post(`/billing/admin/users/${u.id}/subscription`, {
        action: 'activate',
        tariff_code: tariff,
      });
      toast.success(`Подписка ${tariff} выдана: ${u.email}`);
      await load();
    } catch {
      toast.error('Не удалось выдать подписку');
    } finally {
      setBusyUser(null);
    }
  }

  async function cancelSubscription(u: AdminUser) {
    setBusyUser(u.id);
    try {
      await apiClient.post(`/billing/admin/users/${u.id}/subscription`, { action: 'cancel' });
      toast.success(`Подписка отменена: ${u.email} (кредиты живут до конца периода)`);
      await load();
    } catch {
      toast.error('Не удалось отменить подписку');
    } finally {
      setBusyUser(null);
    }
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
              <span className="text-sm font-normal text-ui-text-muted">({usersTotal})</span>
            </h2>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                setQ(searchInput);
                void load(searchInput);
              }}
            >
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="email…"
                className="w-56"
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
          </div>
          <CardV2 className="mt-3 overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ui-border text-left text-small text-ui-text-muted">
                  <th className="px-4 py-2.5 font-medium">Пользователь</th>
                  <th className="px-4 py-2.5 font-medium">Баланс</th>
                  <th className="px-4 py-2.5 font-medium">Подписка</th>
                  <th className="px-4 py-2.5 text-right font-medium">Действия</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-ui-border/60 last:border-0">
                    <td className="px-4 py-2.5">
                      <span className="text-ui-text">{u.email}</span>
                      {u.is_superuser && (
                        <Badge tone="accent" size="sm" className="ml-2">
                          админ
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
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap justify-end gap-1.5">
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={busyUser === u.id}
                          onClick={() => {
                            setGrantFor(u);
                            setGrantAmount('100');
                          }}
                        >
                          <Plus className="h-4 w-4" aria-hidden /> Кредиты
                        </Button>
                        {!u.subscription ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={busyUser === u.id}
                            onClick={() => void manualSubscribe(u, 'starter')}
                          >
                            Подписка
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={busyUser === u.id}
                            onClick={() => void cancelSubscription(u)}
                          >
                            Отменить
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardV2>

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
                        {new Date(p.created_at).toLocaleString('ru-RU', {
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
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
              <Button
                variant="primary"
                loading={busyUser === grantFor.id}
                onClick={() => void doGrant()}
              >
                Начислить
              </Button>
            </div>
          </CardV2>
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
