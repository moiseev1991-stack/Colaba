'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { getEmailStats, listCampaigns, type EmailCampaign, type CampaignStats } from '@/src/services/api/emailCampaigns';
import { BarChart3, Mail, CheckCircle, Eye, MousePointer, XCircle, AlertTriangle, Loader2, ArrowLeft, Send, FileEdit } from 'lucide-react';
import { MetricCard } from '@/components/ui/MetricCard';
import { CardV2 } from '@/components/ui/CardV2';
import { SignalPill, type SignalTone } from '@/components/ui/SignalPill';

// §4.5 ТЗ редизайна 2026-06-03 (Phase C batch 1): статистика на v2 токенах,
// MetricCard вместо самопального StatCard, SignalPill для статусов кампаний.
function statusPill(s: string): { label: string; tone: SignalTone; icon: React.ReactNode } {
  switch (s) {
    case 'draft':     return { label: 'Черновик', tone: 'muted', icon: <FileEdit /> };
    case 'sending':   return { label: 'Отправка', tone: 'cool', icon: <Send /> };
    case 'completed': return { label: 'Завершена', tone: 'good', icon: <CheckCircle /> };
    case 'failed':    return { label: 'Ошибка',   tone: 'hot',  icon: <XCircle /> };
    default:          return { label: s,          tone: 'muted', icon: null };
  }
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
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        <div
          className="flex items-center justify-center gap-2 rounded-v2-lg border p-8"
          style={{ background: 'hsl(var(--surface))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--muted))' }}
        >
          <Loader2 className="h-5 w-5 animate-spin" /> Загрузка статистики…
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex items-center gap-4 mb-6">
        <Link
          href="/app/email/campaigns"
          className="inline-flex items-center gap-1.5 text-sm transition-colors hover:text-[hsl(var(--text))]"
          style={{ color: 'hsl(var(--muted))' }}
        >
          <ArrowLeft className="h-4 w-4" /> К рассылкам
        </Link>
      </div>

      <h1
        className="flex items-center gap-2 mb-6 font-display font-semibold tracking-tight"
        style={{ fontSize: 'clamp(1.5rem, 3vw, 2rem)', color: 'hsl(var(--text))' }}
      >
        <BarChart3 className="h-5 w-5 text-brand-600 dark:text-brand-400" />
        Статистика доставки
      </h1>

      {/* Главные метрики: 4 в ряд на десктопе, 2 — на mobile. reveal-stack staggered. */}
      <div className="reveal-stack grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <MetricCard
          label="Отправлено"
          value={stats?.sent ?? 0}
          icon={<Mail className="h-4 w-4" />}
        />
        <MetricCard
          label="Доставлено"
          value={stats?.delivered ?? 0}
          deltaLabel={stats ? `${stats.delivery_rate}% доставки` : undefined}
          icon={<CheckCircle className="h-4 w-4" />}
        />
        <MetricCard
          label="Открыто"
          value={stats?.opened ?? 0}
          deltaLabel={stats ? `${stats.open_rate}% открытий` : undefined}
          icon={<Eye className="h-4 w-4" />}
        />
        <MetricCard
          label="Кликов"
          value={stats?.clicked ?? 0}
          deltaLabel={stats ? `${stats.click_rate}% CTR` : undefined}
          icon={<MousePointer className="h-4 w-4" />}
        />
      </div>

      {/* Secondary метрики: возвраты/спам — выделены отдельной парой, чтобы
          не смешивались с «успешными» цифрами выше. */}
      <div className="reveal-stack grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <MetricCard
          label="Возвраты (Bounced)"
          value={stats?.bounced ?? 0}
          deltaLabel={stats && stats.bounce_rate > 0 ? `${stats.bounce_rate}% возвратов` : 'Отлично — 0%'}
          icon={<XCircle className="h-4 w-4" />}
        />
        <MetricCard
          label="Спам / Ошибки"
          value={`${stats?.spam ?? 0} / ${stats?.failed ?? 0}`}
          deltaLabel="Жалоб на спам / ошибок отправки"
          icon={<AlertTriangle className="h-4 w-4" />}
        />
      </div>

      {/* Последние рассылки */}
      <CardV2 className="overflow-hidden">
        <div
          className="px-5 py-4"
          style={{ borderBottom: '1px solid hsl(var(--border))' }}
        >
          <h2
            className="font-display font-semibold tracking-tight text-[15px]"
            style={{ color: 'hsl(var(--text))' }}
          >
            Последние рассылки
          </h2>
        </div>
        {recentCampaigns.length === 0 ? (
          <div className="p-6 text-center text-sm" style={{ color: 'hsl(var(--muted))' }}>
            Нет рассылок
          </div>
        ) : (
          <ul className="reveal-stack divide-y" style={{ borderColor: 'hsl(var(--border))' }}>
            {recentCampaigns.map(c => {
              const pill = statusPill(c.status);
              return (
                <li
                  key={c.id}
                  className="reveal-item px-5 py-4 flex items-center justify-between gap-3"
                  style={{ borderTop: 'none', borderBottom: '1px solid hsl(var(--border))' }}
                >
                  <div className="min-w-0">
                    <div
                      className="text-[14px] font-medium truncate"
                      style={{ color: 'hsl(var(--text))' }}
                      title={c.name}
                    >
                      {c.name}
                    </div>
                    <div className="text-[12px]" style={{ color: 'hsl(var(--muted))' }}>
                      {c.sent_count} отправлено / {c.delivered_count} доставлено / {c.opened_count} открыто
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <SignalPill tone={pill.tone} icon={pill.icon} size="sm">{pill.label}</SignalPill>
                    <Link
                      href={`/app/email/campaigns/${c.id}`}
                      className="text-[12px] font-medium text-brand-600 dark:text-brand-400 hover:underline"
                    >
                      Подробнее
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardV2>
    </div>
  );
}
