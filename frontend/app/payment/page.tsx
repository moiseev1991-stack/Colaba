'use client';

import { useState, useEffect } from 'react';
import { CreditCard, CheckCircle, Loader2, ExternalLink } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
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
    apiClient.get<PlansResponse>('/payments/plans')
      .then(r => {
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
      const resp = await apiClient.post<{ confirmation_url: string; payment_id: string; status: string }>('/payments/create', {
        plan: selectedPlan,
        return_url: returnUrl,
      });
      if (resp.data.confirmation_url) {
        window.location.href = resp.data.confirmation_url;
      } else {
        setError('Платёжный шлюз не вернул ссылку. Проверьте настройки ЮКасса.');
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Ошибка при создании платежа';
      setError(msg);
    } finally {
      setPaying(false);
    }
  };

  const selected = plans.find(p => p.id === selectedPlan);

  return (
    <div className="max-w-[580px] mx-auto px-4 sm:px-6 overflow-x-hidden">
      <PageHeader breadcrumb={[{ label: 'Главная', href: '/' }, { label: 'Оплата' }]} title="Подписка" />

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
      ) : (
        <div className="space-y-4">
          {!configured && (
            <div className="rounded-[12px] border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4 text-sm text-amber-700 dark:text-amber-300">
              <strong>Тестовый режим:</strong> платёжный шлюз ЮКасса не настроен.
              Укажите <code>YOOKASSA_SHOP_ID</code> и <code>YOOKASSA_SECRET_KEY</code> в переменных окружения.
            </div>
          )}

          {/* Тарифы */}
          <div className="grid gap-3">
            {plans.map(plan => (
              <button
                key={plan.id}
                type="button"
                onClick={() => setSelectedPlan(plan.id)}
                className={`w-full text-left rounded-[12px] border-2 p-4 transition-colors ${
                  selectedPlan === plan.id
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-blue-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                      selectedPlan === plan.id ? 'border-blue-500' : 'border-gray-300 dark:border-gray-600'
                    }`}>
                      {selectedPlan === plan.id && (
                        <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                      )}
                    </div>
                    <div>
                      <div className="font-semibold text-gray-900 dark:text-white">{plan.name}</div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">{plan.description}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-lg font-bold text-gray-900 dark:text-white">
                      {plan.price_rub.toLocaleString('ru-RU')} ₽
                    </span>
                    <div className="text-xs text-gray-400">/мес</div>
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* Форма */}
          <div className="rounded-[12px] border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
            <div className="flex items-center gap-2 mb-4">
              <CreditCard className="h-5 w-5 text-blue-600" />
              <span className="font-medium text-gray-900 dark:text-white">Оплата через ЮКасса</span>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email для чека</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="your@email.com"
                className="w-full h-10 px-3 rounded-[8px] border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {error && (
              <div className="mb-3 rounded-[8px] bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3 py-2 text-sm text-red-700 dark:text-red-300">
                {error}
              </div>
            )}

            <Button
              onClick={handlePay}
              disabled={paying || !selectedPlan}
              className="w-full h-11"
            >
              {paying ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Переадресация…</>
              ) : (
                <><ExternalLink className="h-4 w-4 mr-2" />
                  Оплатить {selected ? `${selected.price_rub.toLocaleString('ru-RU')} ₽` : ''}
                </>
              )}
            </Button>

            <ul className="mt-4 space-y-1.5 text-xs text-gray-500 dark:text-gray-400">
              <li className="flex items-center gap-1.5"><CheckCircle className="h-3.5 w-3.5 text-green-500" /> Оплата картой, СБП, ЮMoney</li>
              <li className="flex items-center gap-1.5"><CheckCircle className="h-3.5 w-3.5 text-green-500" /> Безопасная транзакция через ЮКасса</li>
              <li className="flex items-center gap-1.5"><CheckCircle className="h-3.5 w-3.5 text-green-500" /> Фискальный чек на email</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
