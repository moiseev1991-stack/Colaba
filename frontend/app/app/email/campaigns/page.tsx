'use client';

import { Fragment, useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  listCampaigns,
  getCampaignLogs,
  type EmailCampaign,
  type EmailLog,
} from '@/src/services/api/emailCampaigns';
import {
  Mail,
  Eye,
  Loader2,
  CheckCircle,
  XCircle,
  BarChart3,
  ArrowRight,
  ChevronDown,
  AlertTriangle,
  Send,
  Clock,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { EmptyState } from '@/components/EmptyState';

function formatDateTime(iso: string | undefined): string {
  if (!iso) return '-';
  const d = new Date(iso);
  return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function statusLabel(s: string): string {
  const map: Record<string, string> = {
    draft: 'Черновик',
    sending: 'Отправка',
    completed: 'Завершена',
    failed: 'Ошибка',
  };
  return map[s] || s;
}

function statusColor(s: string): string {
  const map: Record<string, string> = {
    draft: 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300',
    sending: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
    completed: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
    failed: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
  };
  return map[s] || 'bg-gray-100 text-gray-700';
}

// Демо-кампании для empty-state. Показываются только когда у юзера нет ни
// одной реальной рассылки — чтобы он видел, как выглядит таблица со
// статистикой, не запуская первую рассылку. Чисто фронтовый mock — на
// бэкенд не уходит, ID отрицательные специально, чтобы случайно не
// конфликтовать с реальными.
const SAMPLE_CAMPAIGNS: EmailCampaign[] = [
  {
    id: -1,
    name: 'Стоматологии Москвы — холодное письмо',
    subject: 'Для {company} — продвижение в Яндексе с гарантией',
    status: 'completed',
    total_recipients: 247,
    sent_count: 247,
    delivered_count: 231,
    opened_count: 89,
    clicked_count: 23,
    bounced_count: 12,
    spam_count: 4,
    failed_count: 0,
    from_email: 'd.moiseev@colaba.ru',
    from_name: 'Дмитрий Моисеев',
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 26).toISOString(),
    started_at: new Date(Date.now() - 1000 * 60 * 60 * 26).toISOString(),
    completed_at: new Date(Date.now() - 1000 * 60 * 60 * 22).toISOString(),
  },
  {
    id: -2,
    name: 'Юридические услуги СПб — повторное касание',
    subject: 'Напоминаю про SEO-аудит вашего сайта',
    status: 'sending',
    total_recipients: 180,
    sent_count: 96,
    delivered_count: 92,
    opened_count: 28,
    clicked_count: 6,
    bounced_count: 4,
    spam_count: 0,
    failed_count: 0,
    from_email: 'd.moiseev@colaba.ru',
    from_name: 'Дмитрий Моисеев',
    created_at: new Date(Date.now() - 1000 * 60 * 35).toISOString(),
    started_at: new Date(Date.now() - 1000 * 60 * 35).toISOString(),
  },
  {
    id: -3,
    name: 'Фитнес-клубы Воронежа — приглашение на demo',
    subject: 'Для {company} — 10 заявок в неделю или возврат',
    status: 'draft',
    total_recipients: 64,
    sent_count: 0,
    delivered_count: 0,
    opened_count: 0,
    clicked_count: 0,
    bounced_count: 0,
    spam_count: 0,
    failed_count: 0,
    from_email: 'd.moiseev@colaba.ru',
    from_name: 'Дмитрий Моисеев',
    created_at: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
  },
];

export default function CampaignsHistoryPage() {
  const [campaigns, setCampaigns] = useState<EmailCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 20;

  // Drill-down state. Per-campaign logs are cached so re-expanding doesn't refetch.
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [logsByCampaign, setLogsByCampaign] = useState<Map<number, EmailLog[]>>(new Map());
  const [loadingLogs, setLoadingLogs] = useState<Set<number>>(new Set());

  const load = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const data = await listCampaigns({ limit: PAGE_SIZE, offset: p * PAGE_SIZE });
      setCampaigns(data);
    } catch {
      setCampaigns([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(page); }, [load, page]);

  const toggleExpand = useCallback(async (id: number) => {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    if (logsByCampaign.has(id)) return;
    setLoadingLogs((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    try {
      const logs = await getCampaignLogs(id, { limit: 50 });
      setLogsByCampaign((prev) => new Map(prev).set(id, logs));
    } catch {
      setLogsByCampaign((prev) => new Map(prev).set(id, []));
    } finally {
      setLoadingLogs((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }, [expandedId, logsByCampaign]);

  const deliveryRate = (c: EmailCampaign): number => {
    if (c.sent_count === 0) return 0;
    return Math.round((c.delivered_count / c.sent_count) * 100);
  };

  const openRate = (c: EmailCampaign): number => {
    if (c.delivered_count === 0) return 0;
    return Math.round((c.opened_count / c.delivered_count) * 100);
  };

  return (
    <div className="mx-auto max-w-[1200px] px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-[20px] font-semibold flex items-center gap-2" style={{ color: 'hsl(var(--text))' }}>
          <Mail className="h-5 w-5" />
          История рассылок
        </h1>
        <Link
          href="/app/email/stats"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-xs font-medium border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        >
          <BarChart3 className="h-3.5 w-3.5" />
          Статистика
        </Link>
      </div>

      {loading ? (
        <div
          className="rounded-[12px] border overflow-hidden p-8 flex items-center justify-center gap-2"
          style={{ background: 'hsl(var(--surface))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--muted))' }}
        >
          <Loader2 className="h-5 w-5 animate-spin" /> Загрузка…
        </div>
      ) : campaigns.length === 0 ? (
        <EmptyState
          icon={<Mail className="h-6 w-6" />}
          title="У вас пока нет рассылок"
          description={
            <>
              Запустите первую рассылку из результатов поиска. Ниже — пример того, как
              будет выглядеть эта страница со статистикой по реальным кампаниям.
            </>
          }
          action={
            <Link
              href="/app/leads/history"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-[8px] text-[13px] font-semibold bg-[hsl(var(--accent))] text-white hover:opacity-90 transition-opacity"
            >
              К результатам поиска <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          }
          demoNote="демо-данные — не ваши кампании"
          demo={
            <div className="overflow-x-auto opacity-90">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: '1px solid hsl(var(--border))', background: 'hsl(var(--surface-2))' }}>
                    <th className="text-left py-3 px-4" style={{ color: 'hsl(var(--muted))' }} title="Когда кампания создана">Дата</th>
                    <th className="text-left py-3 px-4" style={{ color: 'hsl(var(--muted))' }}>Название</th>
                    <th className="text-left py-3 px-4" style={{ color: 'hsl(var(--muted))' }} title="Этап: Черновик → Отправка → Завершена">Статус</th>
                    <th className="text-center py-3 px-4" style={{ color: 'hsl(var(--muted))' }} title="Сколько писем уже ушло из общего числа получателей">Отправлено</th>
                    <th className="text-center py-3 px-4" style={{ color: 'hsl(var(--muted))' }} title="Письма реально дошли до почтового ящика и не отбились">Доставлено</th>
                    <th className="text-center py-3 px-4" style={{ color: 'hsl(var(--muted))' }} title="Сколько получателей открыли письмо (по пикселю в HTML)">Открыто</th>
                    <th className="text-center py-3 px-4" style={{ color: 'hsl(var(--muted))' }} title="Письма, которые сервер получателя отбил — адреса не существуют или ящик переполнен. Если >5% — почтовики начнут резать вашу рассылку.">Не дошли</th>
                    <th className="py-3 px-4 text-right uppercase tracking-wider text-xs" style={{ color: 'hsl(var(--muted))' }}>Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {SAMPLE_CAMPAIGNS.map((c) => (
                    <tr key={c.id} style={{ borderBottom: '1px solid hsl(var(--border))' }}>
                      <td className="py-3 px-4 whitespace-nowrap" style={{ color: 'hsl(var(--muted))' }}>
                        {formatDateTime(c.created_at)}
                      </td>
                      <td className="py-3 px-4 truncate max-w-[260px]" title={c.name} style={{ color: 'hsl(var(--text))' }}>
                        {c.name}
                      </td>
                      <td className="py-3 px-4">
                        <span className={cn('px-2 py-0.5 rounded text-xs', statusColor(c.status))}>
                          {statusLabel(c.status)}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center" style={{ color: 'hsl(var(--text))' }}>
                        {c.sent_count} / {c.total_recipients}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="flex items-center justify-center gap-1">
                          <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                          <span style={{ color: 'hsl(var(--text))' }}>{c.delivered_count}</span>
                          <span className="text-xs" style={{ color: 'hsl(var(--muted))' }}>({deliveryRate(c)}%)</span>
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="flex items-center justify-center gap-1">
                          <Eye className="h-3.5 w-3.5 text-blue-500" />
                          <span style={{ color: 'hsl(var(--text))' }}>{c.opened_count}</span>
                          <span className="text-xs" style={{ color: 'hsl(var(--muted))' }}>({openRate(c)}%)</span>
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="flex items-center justify-center gap-1">
                          {c.bounced_count > 0 && <XCircle className="h-3.5 w-3.5 text-red-500" />}
                          <span style={{ color: 'hsl(var(--text))' }}>{c.bounced_count}</span>
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center justify-end">
                          <span
                            className="text-xs italic select-none"
                            style={{ color: 'hsl(var(--muted))' }}
                            title="Это пример — кнопка «Детали» появится после первой реальной рассылки"
                          >
                            (пример)
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          }
        />
      ) : (
        <div
          className="rounded-[12px] border overflow-hidden"
          style={{ background: 'hsl(var(--surface))', borderColor: 'hsl(var(--border))' }}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
                  <th className="text-left py-3 px-4 text-gray-600 dark:text-gray-400">Дата</th>
                  <th className="text-left py-3 px-4 text-gray-600 dark:text-gray-400">Название</th>
                  <th className="text-left py-3 px-4 text-gray-600 dark:text-gray-400">Статус</th>
                  <th className="text-center py-3 px-4 text-gray-600 dark:text-gray-400">Отправлено</th>
                  <th className="text-center py-3 px-4 text-gray-600 dark:text-gray-400">Доставлено</th>
                  <th className="text-center py-3 px-4 text-gray-600 dark:text-gray-400">Открыто</th>
                  <th className="text-center py-3 px-4 text-gray-600 dark:text-gray-400">Возвраты</th>
                  <th className="py-3 px-4 text-right text-gray-600 dark:text-gray-400 uppercase tracking-wider text-xs">Действия</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map(c => {
                  const isExpanded = expandedId === c.id;
                  return (
                    <Fragment key={c.id}>
                      <tr
                        onClick={() => toggleExpand(c.id)}
                        className={cn(
                          'border-b cursor-pointer transition-colors',
                          isExpanded
                            ? 'bg-[hsl(var(--surface-2))]'
                            : 'hover:bg-[hsl(var(--surface-2)/0.6)]',
                        )}
                        style={{ borderColor: 'hsl(var(--border))' }}
                      >
                        <td className="py-3 px-4 whitespace-nowrap" style={{ color: 'hsl(var(--muted))' }}>{formatDateTime(c.created_at)}</td>
                        <td className="py-3 px-4 truncate max-w-[200px]" title={c.name} style={{ color: 'hsl(var(--text))' }}>
                          {c.name}
                        </td>
                        <td className="py-3 px-4">
                          <span className={cn('px-2 py-0.5 rounded text-xs', statusColor(c.status))}>
                            {statusLabel(c.status)}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center" style={{ color: 'hsl(var(--text))' }}>
                          {c.sent_count} / {c.total_recipients}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className="flex items-center justify-center gap-1">
                            <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                            <span style={{ color: 'hsl(var(--text))' }}>{c.delivered_count}</span>
                            <span className="text-xs" style={{ color: 'hsl(var(--muted))' }}>({deliveryRate(c)}%)</span>
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className="flex items-center justify-center gap-1">
                            <Eye className="h-3.5 w-3.5 text-blue-500" />
                            <span style={{ color: 'hsl(var(--text))' }}>{c.opened_count}</span>
                            <span className="text-xs" style={{ color: 'hsl(var(--muted))' }}>({openRate(c)}%)</span>
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className="flex items-center justify-center gap-1">
                            {c.bounced_count > 0 && <XCircle className="h-3.5 w-3.5 text-red-500" />}
                            <span style={{ color: 'hsl(var(--text))' }}>{c.bounced_count}</span>
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center justify-end">
                            <button
                              type="button"
                              aria-label={isExpanded ? 'Свернуть детали' : 'Показать детали'}
                              onClick={(e) => { e.stopPropagation(); toggleExpand(c.id); }}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-[8px] text-xs font-medium border hover:bg-[hsl(var(--surface-2))] transition-colors"
                              style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--text))' }}
                            >
                              <Eye className="h-3.5 w-3.5" />
                              Детали
                              <ChevronDown
                                className={cn('h-3.5 w-3.5 transition-transform', isExpanded && 'rotate-180')}
                                style={{ color: 'hsl(var(--muted))' }}
                              />
                            </button>
                          </div>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr style={{ background: 'hsl(var(--surface-2) / 0.4)' }}>
                          <td colSpan={8} className="p-0" style={{ borderBottom: '1px solid hsl(var(--border))' }}>
                            <CampaignDrilldown
                              campaign={c}
                              logs={logsByCampaign.get(c.id) ?? []}
                              loading={loadingLogs.has(c.id)}
                            />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Пагинация */}
          <div
            className="px-4 py-3 flex items-center justify-between text-sm"
            style={{ borderTop: '1px solid hsl(var(--border))', color: 'hsl(var(--muted))' }}
          >
            <span>Страница {page + 1}</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="px-3 py-1 rounded border hover:bg-[hsl(var(--surface-2))] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                style={{ borderColor: 'hsl(var(--border))' }}
              >
                ← Назад
              </button>
              <button
                type="button"
                onClick={() => setPage(p => p + 1)}
                disabled={campaigns.length < PAGE_SIZE}
                className="px-3 py-1 rounded border hover:bg-[hsl(var(--surface-2))] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                style={{ borderColor: 'hsl(var(--border))' }}
              >
                Вперёд →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Drill-down content shown under an expanded campaign row. Renders subject,
// per-recipient delivery log (up to 50 from API), and a link to the full page
// for deeper analysis.
function CampaignDrilldown({
  campaign,
  logs,
  loading,
}: {
  campaign: EmailCampaign;
  logs: EmailLog[];
  loading: boolean;
}) {
  return (
    <div className="px-6 py-5">
      <div className="mb-4 min-w-0">
        <div className="app-mono-label mb-1" style={{ color: 'hsl(var(--muted))' }}>
          тема письма
        </div>
        <div
          className="text-[14px] font-medium truncate"
          style={{ color: 'hsl(var(--text))' }}
          title={campaign.subject}
        >
          {campaign.subject}
        </div>
        {campaign.from_name && (
          <div className="text-xs mt-1" style={{ color: 'hsl(var(--muted))' }}>
            от: {campaign.from_name} &lt;{campaign.from_email}&gt;
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 mb-2">
        <span className="app-mono-label" style={{ color: 'hsl(var(--muted))' }}>
          получатели
        </span>
        {!loading && logs.length > 0 && (
          <span className="app-mono-label" style={{ color: 'hsl(var(--muted))' }}>
            {logs.length} {logs.length < campaign.total_recipients ? `из ${campaign.total_recipients}` : ''}
          </span>
        )}
      </div>

      {loading ? (
        <div className="p-6 flex items-center justify-center gap-2 text-sm" style={{ color: 'hsl(var(--muted))' }}>
          <Loader2 className="h-4 w-4 animate-spin" /> Загружаем получателей…
        </div>
      ) : logs.length === 0 ? (
        <div
          className="p-6 text-center text-sm rounded"
          style={{
            color: 'hsl(var(--muted))',
            background: 'hsl(var(--surface))',
            border: '1px dashed hsl(var(--border))',
          }}
        >
          Получателей пока нет — кампания ещё не начала отправку.
        </div>
      ) : (
        <div
          className="overflow-x-auto rounded"
          style={{ background: 'hsl(var(--surface))', border: '1px solid hsl(var(--border))' }}
        >
          <table className="w-full text-[13px]">
            <thead>
              <tr style={{ background: 'hsl(var(--surface-2))', borderBottom: '1px solid hsl(var(--border))' }}>
                <th className="text-left py-2 px-3 app-mono-label" style={{ color: 'hsl(var(--muted))' }}>email</th>
                <th className="text-left py-2 px-3 app-mono-label" style={{ color: 'hsl(var(--muted))' }}>статус</th>
                <th className="text-left py-2 px-3 app-mono-label" style={{ color: 'hsl(var(--muted))' }}>событие</th>
                <th className="text-left py-2 px-3 app-mono-label" style={{ color: 'hsl(var(--muted))' }}>ошибка</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log, idx) => {
                const info = logStatusInfo(log.status);
                const eventTime = latestLogEvent(log);
                return (
                  <tr
                    key={log.id}
                    style={idx < logs.length - 1 ? { borderBottom: '1px solid hsl(var(--border))' } : undefined}
                  >
                    <td className="py-2 px-3" style={{ color: 'hsl(var(--text))' }}>
                      <div className="font-medium truncate max-w-[280px]" title={log.to_email}>
                        {log.to_name || log.to_email}
                      </div>
                      {log.to_name && (
                        <div className="text-[11px] truncate max-w-[280px]" style={{ color: 'hsl(var(--muted))' }} title={log.to_email}>
                          {log.to_email}
                        </div>
                      )}
                    </td>
                    <td className="py-2 px-3 whitespace-nowrap">
                      <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border', info.cls)}>
                        {info.icon}
                        {info.label}
                      </span>
                    </td>
                    <td className="py-2 px-3 whitespace-nowrap" style={{ color: 'hsl(var(--muted))' }}>
                      {eventTime ? formatDateTime(eventTime) : '—'}
                    </td>
                    <td className="py-2 px-3 max-w-[280px]">
                      {log.error_message ? (
                        <span className="text-xs text-red-600 dark:text-red-400 truncate block" title={log.error_message}>
                          {log.error_message}
                        </span>
                      ) : (
                        <span style={{ color: 'hsl(var(--muted))' }}>—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function logStatusInfo(status: EmailLog['status']): {
  label: string;
  icon: React.ReactNode;
  cls: string;
} {
  switch (status) {
    case 'pending':
      return { label: 'В очереди', icon: <Clock className="h-3 w-3" />, cls: 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-300 border-zinc-500/30' };
    case 'sent':
      return { label: 'Отправлено', icon: <Send className="h-3 w-3" />, cls: 'bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/30' };
    case 'delivered':
      return { label: 'Доставлено', icon: <CheckCircle className="h-3 w-3" />, cls: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30' };
    case 'opened':
      return { label: 'Открыто', icon: <Eye className="h-3 w-3" />, cls: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30' };
    case 'clicked':
      return { label: 'Кликнул', icon: <ArrowRight className="h-3 w-3" />, cls: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30' };
    case 'bounced':
      return { label: 'Возврат', icon: <XCircle className="h-3 w-3" />, cls: 'bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/30' };
    case 'spam':
      return { label: 'Спам', icon: <AlertTriangle className="h-3 w-3" />, cls: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30' };
    case 'failed':
      return { label: 'Ошибка', icon: <XCircle className="h-3 w-3" />, cls: 'bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/30' };
    default:
      return { label: status, icon: null, cls: 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-300 border-zinc-500/30' };
  }
}

function latestLogEvent(log: EmailLog): string | undefined {
  return (
    log.clicked_at ||
    log.opened_at ||
    log.bounced_at ||
    log.delivered_at ||
    log.sent_at ||
    log.created_at
  );
}
