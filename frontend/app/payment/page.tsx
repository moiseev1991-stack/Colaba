'use client';

import { useState, useEffect } from 'react';
import { CreditCard, CheckCircle, Loader2, ExternalLink } from 'lucide-react';
import { PageContainer, PageColumn, PageHeader } from '@/components/ui/page';
import { ButtonV2 } from '@/components/ui/ButtonV2';
import { CardV2 } from '@/components/ui/CardV2';
import { apiClient } from '@/client';

interface Plan {
  id: string;
  name: string;
  price_rub: number;
  searches: number;
  description: string;
}

interface PlansResponse {
  plans: Plan[];
  configured: boolean;
}

export default function PaymentPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [configured, setConfigured] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<string>('business');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    apiClient
      .get<PlansResponse>('/payments/plans')
      .then((r) => {
        setPlans(r.data.plans);
        setConfigured(r.data.configured);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handlePay = async () => {
    if (!selectedPlan) return;
    setPaying(true);
    setError('');
    try {
      const returnUrl = `${window.location.origin}/payment/success`;
      const resp = await apiClient.post<{
        confirmation_url: string;
        payment_id: string;
        status: string;
      }>('/payments/create', {
        plan: selectedPlan,
        return_url: returnUrl,
      });
      if (resp.data.confirmation_url) {
        window.location.href = resp.data.confirmation_url;
      } else {
        setError('Платёжный шлюз не вернул ссылку. Проверьте настройки ЮКасса.');
      }
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        'Ошибка при создании платежа';
      setError(msg);
    } finally {
      setPaying(false);
    }
  };

  const selected = plans.find((p) => p.id === selectedPlan);

  return (
    <PageContainer className="overflow-x-hidden">
      <PageColumn>
        <PageHeader
          breadcrumbs={[{ label: 'Главная', href: '/' }, { label: 'Оплата' }]}
          title="Подписка"
        />

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin" style={{ color: 'hsl(var(--muted))' }} />
          </div>
        ) : !configured ? (
          /* Бета: оплата не подключена — никаких тарифов, кнопок и
             внутренних подсказок (аудит 17.09: юзеру показывали env-переменные
             ЮKassa и мёртвые кнопки «Оплатить»). Честная карточка беты. */
          <CardV2 className="p-8 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-card bg-ui-accent/10 text-ui-accent">
              <CheckCircle className="h-6 w-6" />
            </div>
            <h2 className="text-heading font-extrabold tracking-tight text-ui-text">
              Сейчас SpinLid бесплатен
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-ui-text-muted">
              Идёт открытая бета — все функции доступны без оплаты и без лимитов. Когда появится
              платная подписка, тарифы откроются на этой странице, а мы предупредим заранее.
            </p>
            <ButtonV2
              variant="primary"
              size="lg"
              className="mt-6"
              onClick={() => (window.location.href = '/app/leads')}
            >
              Начать пользоваться
            </ButtonV2>
          </CardV2>
        ) : (
          <div className="space-y-4">
            {/* Тарифы */}
            <div className="grid gap-3">
              {plans.map((plan) => {
                const isSel = selectedPlan === plan.id;
                return (
                  <button
                    key={plan.id}
                    type="button"
                    onClick={() => setSelectedPlan(plan.id)}
                    className={`w-full text-left rounded-v2-lg border-2 p-4 transition-colors ${
                      isSel
                        ? 'border-brand-500 bg-brand-50/60 dark:bg-brand-500/10'
                        : 'hover:border-brand-400/40'
                    }`}
                    style={
                      !isSel
                        ? { borderColor: 'hsl(var(--border))', background: 'hsl(var(--surface))' }
                        : undefined
                    }
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                            isSel ? 'border-brand-500' : ''
                          }`}
                          style={!isSel ? { borderColor: 'hsl(var(--border))' } : undefined}
                        >
                          {isSel && <div className="w-2.5 h-2.5 rounded-full bg-brand-500" />}
                        </div>
                        <div>
                          <div className="font-semibold" style={{ color: 'hsl(var(--text))' }}>
                            {plan.name}
                          </div>
                          <div className="text-sm" style={{ color: 'hsl(var(--muted))' }}>
                            {plan.description}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <span
                          className="font-display font-semibold tracking-tight text-base"
                          style={{ color: 'hsl(var(--text))' }}
                        >
                          {plan.price_rub.toLocaleString('ru-RU')} ₽
                        </span>
                        <div className="text-xs" style={{ color: 'hsl(var(--muted))' }}>
                          /мес
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Форма */}
            <CardV2 className="p-5">
              <div className="flex items-center gap-2 mb-4">
                <CreditCard className="h-5 w-5 text-brand-600 dark:text-brand-400" />
                <span className="font-medium" style={{ color: 'hsl(var(--text))' }}>
                  Оплата через ЮКасса
                </span>
              </div>

              <div className="mb-4">
                <label
                  className="block text-sm font-medium mb-1"
                  style={{ color: 'hsl(var(--text))' }}
                >
                  Email для чека
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="w-full h-10 px-3 rounded-v2-sm border text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  style={{
                    background: 'hsl(var(--surface))',
                    borderColor: 'hsl(var(--border))',
                    color: 'hsl(var(--text))',
                  }}
                />
              </div>

              {error && (
                <div
                  className="mb-3 rounded-v2-sm border px-3 py-2 text-sm"
                  style={{
                    background: 'var(--signal-hot-bg)',
                    borderColor: 'rgb(239 68 68 / 0.3)',
                    color: 'var(--signal-hot)',
                  }}
                >
                  {error}
                </div>
              )}

              <ButtonV2
                variant="primary"
                size="lg"
                onClick={handlePay}
                loading={paying}
                disabled={!selectedPlan}
                iconLeft={!paying ? <ExternalLink /> : undefined}
                className="w-full"
              >
                {paying
                  ? 'Переадресация…'
                  : `Оплатить ${selected ? `${selected.price_rub.toLocaleString('ru-RU')} ₽` : ''}`}
              </ButtonV2>

              <ul className="mt-4 space-y-1.5 text-xs" style={{ color: 'hsl(var(--muted))' }}>
                <li className="flex items-center gap-1.5">
                  <CheckCircle className="h-3.5 w-3.5" style={{ color: 'var(--signal-good)' }} />{' '}
                  Оплата картой, СБП, ЮMoney
                </li>
                <li className="flex items-center gap-1.5">
                  <CheckCircle className="h-3.5 w-3.5" style={{ color: 'var(--signal-good)' }} />{' '}
                  Безопасная транзакция через ЮКасса
                </li>
                <li className="flex items-center gap-1.5">
                  <CheckCircle className="h-3.5 w-3.5" style={{ color: 'var(--signal-good)' }} />{' '}
                  Фискальный чек на email
                </li>
              </ul>
            </CardV2>
          </div>
        )}
      </PageColumn>
    </PageContainer>
  );
}
