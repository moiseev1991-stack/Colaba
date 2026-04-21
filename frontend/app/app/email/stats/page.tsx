'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { getEmailStats, listCampaigns, type EmailCampaign, type CampaignStats } from '@/src/services/api/emailCampaigns';
import { BarChart3, Mail, CheckCircle, Eye, MousePointer, XCircle, AlertTriangle, Loader2, ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

function StatCard({ icon: Icon, label, value, subtext, color }: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  subtext?: string;
  color: string;
}) {
  return (
    <div className="rounded-[12px] border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
      <div className="flex items-start gap-3">
        <div className={cn('p-2.5 rounded-[8px]', color)}>
          <Icon className="h-5 w-5 text-white" />
        </div>
        <div>
          <div className="text-[13px] text-gray-500 dark:text-gray-400 mb-0.5">{label}</div>
          <div className="text-[24px] font-semibold" style={{ color: 'hsl(var(--text))' }}>{value}</div>
          {subtext && <div className="text-[12px] text-gray-400">{subtext}</div>}
        </div>
      </div>
    </div>
  );
}

export default function EmailStatsPage() {
  const [stats, setStats] = useState<CampaignStats | null>(null);
  const [recentCampaigns, setRecentCampaigns] = useState<EmailCampaign[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [statsData, campaignsData] = await Promise.all([
        getEmailStats(),
        listCampaigns({ limit: 5 }),
      ]);
      setStats(statsData);
      setRecentCampaigns(campaignsData);
    } catch {
      setStats(null);
      setRecentCampaigns([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="mx-auto max-w-[1200px] px-6 py-8">
        <div className="flex items-center justify-center gap-2 text-gray-500 dark:text-gray-400">
          <Loader2 className="h-5 w-5 animate-spin" /> Загрузка статистики…
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1200px] px-6 py-8">
      <div className="flex items-center gap-4 mb-6">
        <Link
          href="/app/email/campaigns"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> К рассылкам
        </Link>
      </div>

      <h1 className="text-[20px] font-semibold mb-6 flex items-center gap-2" style={{ color: 'hsl(var(--text))' }}>
        <BarChart3 className="h-5 w-5" />
        Статистика доставки
      </h1>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard
          icon={Mail}
          label="Отправлено"
          value={stats?.sent ?? 0}
          subtext="писем"
          color="bg-blue-500"
        />
        <StatCard
          icon={CheckCircle}
          label="Доставлено"
          value={stats?.delivered ?? 0}
          subtext={stats ? `${stats.delivery_rate}% доставки` : undefined}
          color="bg-green-500"
        />
        <StatCard
          icon={Eye}
          label="Открыто"
          value={stats?.opened ?? 0}
          subtext={stats ? `${stats.open_rate}% открытий` : undefined}
          color="bg-purple-500"
        />
        <StatCard
          icon={MousePointer}
          label="Кликов"
          value={stats?.clicked ?? 0}
          subtext={stats ? `${stats.click_rate}% CTR` : undefined}
          color="bg-indigo-500"
        />
      </div>

      {/* Secondary Stats */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        <StatCard
          icon={XCircle}
          label="Возвраты (Bounced)"
          value={stats?.bounced ?? 0}
          subtext={stats && stats.bounce_rate > 0 ? `${stats.bounce_rate}% возвратов` : 'Отлично!'}
          color="bg-red-500"
        />
        <StatCard
          icon={AlertTriangle}
          label="Спам / Ошибки"
          value={`${stats?.spam ?? 0} / ${stats?.failed ?? 0}`}
          subtext="Жалоб на спам / ошибок отправки"
          color="bg-amber-500"
        />
      </div>

      {/* Recent Campaigns */}
      <div className="rounded-[12px] border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-[15px] font-medium" style={{ color: 'hsl(var(--text))' }}>Последние рассылки</h2>
        </div>
        {recentCampaigns.length === 0 ? (
          <div className="p-6 text-center text-sm text-gray-500 dark:text-gray-400">
            Нет рассылок
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {recentCampaigns.map(c => (
              <div key={c.id} className="px-5 py-4 flex items-center justify-between">
                <div>
                  <div className="text-[14px] font-medium" style={{ color: 'hsl(var(--text))' }}>{c.name}</div>
                  <div className="text-[12px] text-gray-500 dark:text-gray-400">
                    {c.sent_count} отправлено / {c.delivered_count} доставлено / {c.opened_count} открыто
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={cn(
                    'px-2 py-0.5 rounded text-xs',
                    c.status === 'completed' && 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
                    c.status === 'sending' && 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
                    c.status === 'failed' && 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
                    c.status === 'draft' && 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300',
                  )}>
                    {c.status === 'completed' ? 'Завершена' : c.status === 'sending' ? 'Отправка' : c.status === 'failed' ? 'Ошибка' : 'Черновик'}
                  </span>
                  <Link
                    href={`/app/email/campaigns/${c.id}`}
                    className="text-[12px] text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    Подробнее
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
