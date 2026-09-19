'use client';

/**
 * /app/billing — ЛК тарификации (2026-09): баланс кредитов, тарифы,
 * история начислений/списаний, управление подпиской (автопродление).
 * Прозрачность — мировая практика (z.ai/Claude): цены операций видны.
 */

import { useCallback, useEffect, useState } from 'react';
import { Coins, CreditCard, RefreshCw, Sparkles } from 'lucide-react';

import { apiClient } from '@/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CardV2 } from '@/components/ui/CardV2';
import { PageContainer, PageHeader } from '@/components/ui/page';
import { Skeleton } from '@/components/ui/Skeleton';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';

interface Tariff {
  code: string;
  name: string;
  price_rub: number;
  credits: number;
  searches: number;
  rub_per_credit: number;
  description: string;
  purchasable: boolean;
}

interface Summary {
  balance: number;
  enforcement_enabled: boolean;
  subscription: {
    tariff_code: string;
    status: string;
    period_end: string;
    auto_renew: boolean;
    cancel_at_period_end: boolean;
  } | null;
  tariffs: Tariff[];
  operations_prices: { code: string; label: string; credits: number }[];
  payments_configured: boolean;
}

interface Tx {
  id: number;
  type: 'grant' | 'spend' | 'refund' | 'expire';
  amount: number;
  balance_after: number;
  operation: string | null;
  comment: string | null;
  created_at: string;
}

const TX_LABELS: Record<Tx['type'], string> = {
  grant: 'Начисление',
  spend: 'Списание',
  refund: 'Возврат',
  expire: 'Сгорело',
};

const TX_TONES: Record<Tx['type'], 'success' | 'danger' | 'info' | 'neutral'> = {
  grant: 'success',
  spend: 'danger',
  refund: 'info',
  expire: 'neutral',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function BillingPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [txTotal, setTxTotal] = useState(0);
  const [txPage, setTxPage] = useState(1);
  const [paying, setPaying] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [s, t] = await Promise.all([
        apiClient.get<Summary>('/billing/summary'),
        apiClient.get<{ items: Tx[]; total: number }>('/billing/transactions', {
          params: { page: 1, page_size: 25 },
        }),
      ]);
      setSummary(s.data);
      setTxs(t.data.items);
      setTxTotal(t.data.total);
    } catch {
      toast.error('Не удалось загрузить биллинг. Попробуйте обновить страницу.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function loadTxPage(page: number) {
    const t = await apiClient.get<{ items: Tx[]; total: number }>('/billing/transactions', {
      params: { page, page_size: 25 },
    });
    setTxs(t.data.items);
    setTxPage(page);
  }

  async function pay(tariff: Tariff) {
    setPaying(tariff.code);
    try {
      const resp = await apiClient.post<{ confirmation_url: string }>('/payments/create', {
        plan: tariff.code,
      });
      if (resp.data.confirmation_url) {
        window.location.href = resp.data.confirmation_url;
        return;
      }
      toast.error('Платёжный шлюз не вернул ссылку на оплату');
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : 'Ошибка создания платежа');
    } finally {
      setPaying(null);
    }
  }

  async function toggleAutoRenew() {
    if (!summary?.subscription) return;
    const next = !summary.subscription.auto_renew;
    try {
      await apiClient.post('/billing/subscription', {
        auto_renew: next,
        cancel_at_period_end: !next,
      });
      toast.success(
        next
          ? 'Автопродление включено'
          : 'Автопродление выключено — подписка активна до конца периода',
      );
      await load();
    } catch {
      toast.error('Не удалось изменить автопродление');
    }
  }

  if (!summary) {
    return (
      <PageContainer>
        <Skeleton className="h-8 w-64" />
        <div className="mt-6 space-y-4">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      </PageContainer>
    );
  }

  const activeTariff = summary.tariffs.find((t) => t.code === summary.subscription?.tariff_code);
  const pages = Math.max(1, Math.ceil(txTotal / 25));

  return (
    <PageContainer>
      <PageHeader
        title="Баланс и тарифы"
        description="Кредиты списываются за операции: поиск, генерация КП, отправка письма. Подписка даёт пакет кредитов на 30 дней."
      />

      {/* Баланс + подписка */}
      <div className="grid gap-4 lg:grid-cols-3">
        <CardV2 className="p-6 lg:col-span-1">
          <div className="flex items-center gap-2 text-small text-ui-text-muted">
            <Coins className="h-4 w-4" aria-hidden /> Баланс
          </div>
          <div className="mt-2 text-[40px] font-extrabold leading-none tabular-nums text-ui-text">
            {summary.balance}
          </div>
          <div className="mt-1 text-small text-ui-text-muted">кредитов</div>
          {!summary.enforcement_enabled && (
            <Badge tone="info" size="sm" className="mt-3">
              Бета: списания не включены
            </Badge>
          )}
        </CardV2>

        <CardV2 className="p-6 lg:col-span-2">
          <div className="flex items-center gap-2 text-small text-ui-text-muted">
            <CreditCard className="h-4 w-4" aria-hidden /> Подписка
          </div>
          {summary.subscription ? (
            <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-xl font-bold text-ui-text">
                  {activeTariff?.name ?? summary.subscription.tariff_code}
                  {activeTariff && (
                    <span className="ml-2 text-sm font-normal text-ui-text-muted">
                      {activeTariff.credits.toLocaleString('ru-RU')} кредитов / мес
                    </span>
                  )}
                </div>
                <p className="mt-1 text-small text-ui-text-muted">
                  Активна до {new Date(summary.subscription.period_end).toLocaleDateString('ru-RU')}
                  {summary.subscription.cancel_at_period_end &&
                    ' · завершится по окончании периода'}
                </p>
              </div>
              <Button variant="secondary" size="sm" onClick={toggleAutoRenew}>
                {summary.subscription.auto_renew
                  ? 'Выключить автопродление'
                  : 'Включить автопродление'}
              </Button>
            </div>
          ) : (
            <div className="mt-2">
              <div className="text-xl font-bold text-ui-text">
                Бесплатный
                <span className="ml-2 text-sm font-normal text-ui-text-muted">0 ₽</span>
              </div>
              <p className="mt-1 text-small text-ui-text-muted">
                Тариф по умолчанию: 100 приветственных кредитов (≈10 поисков) при регистрации.
                Платные тарифы ниже — пакеты кредитов на 30 дней, докупленные не сгорают.
              </p>
            </div>
          )}
        </CardV2>
      </div>

      {/* Тарифы */}
      <h2 className="mt-10 text-xl font-extrabold tracking-tight text-ui-text">Тарифы</h2>
      <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {summary.tariffs.map((t) => {
          const isCurrent =
            summary.subscription?.tariff_code === t.code ||
            (!summary.subscription && t.code === 'free');
          return (
            <CardV2 key={t.code} className={cn('p-6', isCurrent && 'ring-2 ring-ui-accent/40')}>
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-ui-text">{t.name}</h3>
                {isCurrent && (
                  <Badge tone="accent" size="sm">
                    Ваш тариф
                  </Badge>
                )}
              </div>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="text-[32px] font-extrabold leading-none tabular-nums text-ui-text">
                  {t.credits.toLocaleString('ru-RU')}
                </span>
                <span className="text-sm text-ui-text-muted">кредитов</span>
              </div>
              <p className="mt-1 text-small text-ui-text-muted">
                ≈ {t.searches} поисков
                {t.price_rub > 0 && <> · {t.rub_per_credit.toFixed(2)} ₽/кредит</>}
              </p>
              <p className="mt-3 min-h-10 text-small text-ui-text-muted">{t.description}</p>
              <div className="mt-4 flex items-center justify-between">
                <span className="text-xl font-extrabold tabular-nums text-ui-text">
                  {t.price_rub.toLocaleString('ru-RU')} ₽
                  {t.price_rub > 0 && (
                    <span className="text-sm font-normal text-ui-text-muted"> / 30 дней</span>
                  )}
                </span>
              </div>
              {!t.purchasable ? (
                <Button variant="secondary" className="mt-4 w-full" disabled>
                  Выдаётся при регистрации
                </Button>
              ) : summary.payments_configured ? (
                <Button
                  variant="primary"
                  className="mt-4 w-full"
                  loading={paying === t.code}
                  onClick={() => pay(t)}
                >
                  {isCurrent ? 'Продлить' : 'Оплатить'}
                </Button>
              ) : (
                <Button variant="secondary" className="mt-4 w-full" disabled>
                  <Sparkles className="h-4 w-4" aria-hidden /> Бета бесплатна
                </Button>
              )}
            </CardV2>
          );
        })}
      </div>

      {/* Цены операций — прозрачность */}
      <h2 className="mt-10 text-xl font-extrabold tracking-tight text-ui-text">
        Сколько стоят операции
      </h2>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {summary.operations_prices.map((op) => (
          <div
            key={op.code}
            className="flex items-center justify-between rounded-card border border-ui-border bg-ui-surface-2/50 px-4 py-2.5"
          >
            <span className="text-sm text-ui-text">{op.label}</span>
            <span className="text-small font-semibold tabular-nums text-ui-text-muted">
              {op.credits} {op.credits === 1 ? 'кредит' : 'кредитов'}
            </span>
          </div>
        ))}
      </div>

      {/* История */}
      <div className="mt-10 flex items-center justify-between">
        <h2 className="text-xl font-extrabold tracking-tight text-ui-text">История операций</h2>
        <Button
          variant="ghost"
          size="sm"
          iconLeft={<RefreshCw className="h-4 w-4" />}
          onClick={() => void load()}
        >
          Обновить
        </Button>
      </div>
      <CardV2 className="mt-4 overflow-hidden p-0">
        {txs.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-ui-text-muted">
            Операций пока нет. Кредиты появятся здесь после подписки или списания за поиск.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ui-border text-left text-small text-ui-text-muted">
                <th className="px-4 py-2.5 font-medium">Дата</th>
                <th className="px-4 py-2.5 font-medium">Тип</th>
                <th className="px-4 py-2.5 font-medium">Операция</th>
                <th className="px-4 py-2.5 text-right font-medium">Кредиты</th>
                <th className="px-4 py-2.5 text-right font-medium">Остаток</th>
              </tr>
            </thead>
            <tbody>
              {txs.map((t) => (
                <tr key={t.id} className="border-b border-ui-border/60 last:border-0">
                  <td className="whitespace-nowrap px-4 py-2.5 text-ui-text-muted">
                    {formatDate(t.created_at)}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge tone={TX_TONES[t.type]} size="sm">
                      {TX_LABELS[t.type]}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5 text-ui-text">{t.comment || t.operation || '—'}</td>
                  <td
                    className={cn(
                      'whitespace-nowrap px-4 py-2.5 text-right font-semibold tabular-nums',
                      t.amount > 0 ? 'text-ui-success' : 'text-ui-text',
                    )}
                  >
                    {t.amount > 0 ? '+' : ''}
                    {t.amount}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-ui-text-muted">
                    {t.balance_after}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardV2>
      {pages > 1 && (
        <div className="mt-3 flex items-center justify-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={txPage <= 1}
            onClick={() => void loadTxPage(txPage - 1)}
          >
            ← Назад
          </Button>
          <span className="text-small text-ui-text-muted">
            {txPage} из {pages}
          </span>
          <Button
            variant="secondary"
            size="sm"
            disabled={txPage >= pages}
            onClick={() => void loadTxPage(txPage + 1)}
          >
            Вперёд →
          </Button>
        </div>
      )}
    </PageContainer>
  );
}
