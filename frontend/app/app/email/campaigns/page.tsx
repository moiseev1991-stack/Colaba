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
  FileEdit,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { EmptyState } from '@/components/EmptyState';
import { SignalPill, type SignalTone } from '@/components/ui/SignalPill';
import { ButtonV2 } from '@/components/ui/ButtonV2';

function formatDateTime(iso: string | undefined): string {
  if (!iso) return '-';
  const d = new Date(iso);
  return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// §4.5 ТЗ редизайна 2026-06-03 (фоллоу-ап Phase B-3):
// Статус кампании → SignalPill. Раньше были разнокалиберные bg-gray-100/blue-100/...,
// теперь единая сигнальная шкала (cool=инфо, warm=в процессе, good=успех, hot=ошибка).
function campaignStatusPill(s: string): { label: string; tone: SignalTone; icon: React.ReactNode } {
  switch (s) {
    case 'draft':
      return { label: 'Черновик', tone: 'muted', icon: <FileEdit /> };
    case 'sending':
      return { label: 'Отправка', tone: 'cool', icon: <Send /> };
    case 'completed':
      return { label: 'Завершена', tone: 'good', icon: <CheckCircle /> };
    case 'failed':
      return { label: 'Ошибка', tone: 'hot', icon: <XCircle /> };
    default:
      return { label: s, tone: 'muted', icon: null };
  }
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
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      {/* §4.5 ТЗ редизайна 2026-06-03: display-шрифт, max-w-7xl */}
      <div className="mb-6 flex items-center justify-between">
        <h1
          className="flex items-center gap-2 font-display font-semibold tracking-tight"
          style={{ fontSize: 'clamp(1.5rem, 3vw, 2rem)', color: 'hsl(var(--text))' }}
        >
          <Mail className="h-5 w-5 text-brand-600 dark:text-brand-400" />
          История рассылок
        </h1>
        <Link href="/app/email/stats" className="contents">
          <ButtonV2 variant="secondary" size="sm" iconLeft={<BarChart3 />}>
            Статистика
          </ButtonV2>
        </Link>
      </div>

      {loading ? (
        <div
          className="rounded-v2-lg border overflow-hidden p-8 flex items-center justify-center gap-2"
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
            <Link href="/app/leads/history" className="contents">
              <ButtonV2 variant="primary" size="md" iconRight={<ArrowRight />}>
                К результатам поиска
              </ButtonV2>
            </Link>
          }
          demoNote="демо-данные — не ваши кампании"
          demo={<CampaignsTable campaigns={SAMPLE_CAMPAIGNS} variant="demo" deliveryRate={deliveryRate} openRate={openRate} />}
        />
      ) : (
        <div
          className="rounded-v2-lg border overflow-hidden shadow-v2-sm"
          style={{ background: 'hsl(var(--surface))', borderColor: 'hsl(var(--border))' }}
        >
          <CampaignsTable
            campaigns={campaigns}
            variant="live"
            expandedId={expandedId}
            toggleExpand={toggleExpand}
            logsByCampaign={logsByCampaign}
            loadingLogs={loadingLogs}
            deliveryRate={deliveryRate}
            openRate={openRate}
          />

          {/* Пагинация */}
          <div
            className="px-4 py-3 flex items-center justify-between text-sm"
            style={{ borderTop: '1px solid hsl(var(--border))', color: 'hsl(var(--muted))' }}
          >
            <span>Страница {page + 1}</span>
            <div className="flex gap-2">
              <ButtonV2
                variant="secondary"
                size="sm"
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
              >
                ← Назад
              </ButtonV2>
              <ButtonV2
                variant="secondary"
                size="sm"
                onClick={() => setPage(p => p + 1)}
                disabled={campaigns.length < PAGE_SIZE}
              >
                Вперёд →
              </ButtonV2>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Единая таблица с двумя режимами: live (с drill-down) и demo (статика для empty-state).
// Раньше markup был дублирован — теперь одна точка правды, бейджи на SignalPill.
type TableProps =
  | {
      variant: 'demo';
      campaigns: EmailCampaign[];
      deliveryRate: (c: EmailCampaign) => number;
      openRate: (c: EmailCampaign) => number;
    }
  | {
      variant: 'live';
      campaigns: EmailCampaign[];
      expandedId: number | null;
      toggleExpand: (id: number) => void;
      logsByCampaign: Map<number, EmailLog[]>;
      loadingLogs: Set<number>;
      deliveryRate: (c: EmailCampaign) => number;
      openRate: (c: EmailCampaign) => number;
    };

function CampaignsTable(props: TableProps) {
  const isDemo = props.variant === 'demo';
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr
            style={{
              borderBottom: '1px solid hsl(var(--border))',
              background: 'hsl(var(--surface-2))',
            }}
          >
            <Th title="Когда кампания создана">Дата</Th>
            <Th>Название</Th>
            <Th title="Этап: Черновик → Отправка → Завершена">Статус</Th>
            <Th align="center" title="Сколько писем уже ушло из общего числа получателей">Отправлено</Th>
            <Th align="center" title="Письма реально дошли до почтового ящика и не отбились">Доставлено</Th>
            <Th align="center" title="Сколько получателей открыли письмо (по пикселю в HTML)">Открыто</Th>
            <Th align="center" title="Письма, которые сервер получателя отбил — адреса не существуют или ящик переполнен. Если >5% — почтовики начнут резать вашу рассылку.">Возвраты</Th>
            <Th align="right">Действия</Th>
          </tr>
        </thead>
        <tbody>
          {props.campaigns.map((c) => {
            const pill = campaignStatusPill(c.status);
            if (isDemo) {
              return (
                <tr key={c.id} style={{ borderBottom: '1px solid hsl(var(--border))' }}>
                  <Td muted nowrap>{formatDateTime(c.created_at)}</Td>
                  <Td className="truncate max-w-[260px]" title={c.name}>{c.name}</Td>
                  <Td>
                    <SignalPill tone={pill.tone} icon={pill.icon} size="sm">{pill.label}</SignalPill>
                  </Td>
                  <Td align="center">{c.sent_count} / {c.total_recipients}</Td>
                  <Td align="center"><DeliveredCell campaign={c} rate={props.deliveryRate(c)} /></Td>
                  <Td align="center"><OpenedCell campaign={c} rate={props.openRate(c)} /></Td>
                  <Td align="center"><BouncedCell campaign={c} /></Td>
                  <Td align="right">
                    <span
                      className="text-xs italic select-none"
                      style={{ color: 'hsl(var(--muted))' }}
                      title="Это пример — кнопка «Детали» появится после первой реальной рассылки"
                    >
                      (пример)
                    </span>
                  </Td>
                </tr>
              );
            }

            const isExpanded = props.expandedId === c.id;
            return (
              <Fragment key={c.id}>
                <tr
                  onClick={() => props.toggleExpand(c.id)}
                  className={cn(
                    'cursor-pointer transition-colors',
                    isExpanded
                      ? 'bg-[hsl(var(--surface-2))]'
                      : 'hover:bg-[hsl(var(--surface-2)/0.6)]',
                  )}
                  style={{ borderBottom: '1px solid hsl(var(--border))' }}
                >
                  <Td muted nowrap>{formatDateTime(c.created_at)}</Td>
                  <Td className="truncate max-w-[200px]" title={c.name}>{c.name}</Td>
                  <Td>
                    <SignalPill tone={pill.tone} icon={pill.icon} size="sm">{pill.label}</SignalPill>
                  </Td>
                  <Td align="center">{c.sent_count} / {c.total_recipients}</Td>
                  <Td align="center"><DeliveredCell campaign={c} rate={props.deliveryRate(c)} /></Td>
                  <Td align="center"><OpenedCell campaign={c} rate={props.openRate(c)} /></Td>
                  <Td align="center"><BouncedCell campaign={c} /></Td>
                  <Td align="right">
                    <div className="flex items-center justify-end">
                      <ButtonV2
                        variant="secondary"
                        size="sm"
                        aria-label={isExpanded ? 'Свернуть детали' : 'Показать детали'}
                        onClick={(e) => { e.stopPropagation(); props.toggleExpand(c.id); }}
                        iconLeft={<Eye />}
                        iconRight={
                          <ChevronDown
                            className={cn('transition-transform', isExpanded && 'rotate-180')}
                          />
                        }
                      >
                        Детали
                      </ButtonV2>
                    </div>
                  </Td>
                </tr>
                {isExpanded && (
                  <tr style={{ background: 'hsl(var(--surface-2) / 0.4)' }}>
                    <td colSpan={8} className="p-0" style={{ borderBottom: '1px solid hsl(var(--border))' }}>
                      <CampaignDrilldown
                        campaign={c}
                        logs={props.logsByCampaign.get(c.id) ?? []}
                        loading={props.loadingLogs.has(c.id)}
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
  );
}

// Reusable header cell with v2-aware styling. Inline-table — не делю на ui/Table,
// нагрузка на единственную страницу не оправдывает отдельного компонента.
function Th({
  children,
  align = 'left',
  title,
}: {
  children: React.ReactNode;
  align?: 'left' | 'center' | 'right';
  title?: string;
}) {
  return (
    <th
      title={title}
      className={cn(
        'py-3 px-4 text-[11px] font-semibold uppercase tracking-wider',
        align === 'left' && 'text-left',
        align === 'center' && 'text-center',
        align === 'right' && 'text-right',
      )}
      style={{ color: 'hsl(var(--muted))' }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = 'left',
  muted,
  nowrap,
  className,
  title,
}: {
  children: React.ReactNode;
  align?: 'left' | 'center' | 'right';
  muted?: boolean;
  nowrap?: boolean;
  className?: string;
  title?: string;
}) {
  return (
    <td
      title={title}
      className={cn(
        'py-3 px-4',
        align === 'center' && 'text-center',
        align === 'right' && 'text-right',
        nowrap && 'whitespace-nowrap',
        className,
      )}
      style={{ color: muted ? 'hsl(var(--muted))' : 'hsl(var(--text))' }}
    >
      {children}
    </td>
  );
}

function DeliveredCell({ campaign, rate }: { campaign: EmailCampaign; rate: number }) {
  return (
    <span className="inline-flex items-center justify-center gap-1">
      <CheckCircle className="h-3.5 w-3.5" style={{ color: 'var(--signal-good)' }} />
      <span style={{ color: 'hsl(var(--text))' }}>{campaign.delivered_count}</span>
      <span className="text-xs" style={{ color: 'hsl(var(--muted))' }}>({rate}%)</span>
    </span>
  );
}

function OpenedCell({ campaign, rate }: { campaign: EmailCampaign; rate: number }) {
  return (
    <span className="inline-flex items-center justify-center gap-1">
      <Eye className="h-3.5 w-3.5" style={{ color: 'var(--signal-cool)' }} />
      <span style={{ color: 'hsl(var(--text))' }}>{campaign.opened_count}</span>
      <span className="text-xs" style={{ color: 'hsl(var(--muted))' }}>({rate}%)</span>
    </span>
  );
}

function BouncedCell({ campaign }: { campaign: EmailCampaign }) {
  const hasBounce = campaign.bounced_count > 0;
  return (
    <span className="inline-flex items-center justify-center gap-1">
      {hasBounce && <XCircle className="h-3.5 w-3.5" style={{ color: 'var(--signal-hot)' }} />}
      <span style={{ color: 'hsl(var(--text))' }}>{campaign.bounced_count}</span>
    </span>
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
          className="p-6 text-center text-sm rounded-v2-sm"
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
          className="overflow-x-auto rounded-v2-sm"
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
                      <SignalPill tone={info.tone} icon={info.icon} size="sm">{info.label}</SignalPill>
                    </td>
                    <td className="py-2 px-3 whitespace-nowrap" style={{ color: 'hsl(var(--muted))' }}>
                      {eventTime ? formatDateTime(eventTime) : '—'}
                    </td>
                    <td className="py-2 px-3 max-w-[280px]">
                      {log.error_message ? (
                        <span className="text-xs truncate block" style={{ color: 'var(--signal-hot)' }} title={log.error_message}>
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

// Per-recipient log status → SignalPill (та же сигнальная шкала, что у кампаний).
// pending=muted, sent=cool, delivered/opened/clicked=good, bounced/failed=hot, spam=warm.
function logStatusInfo(status: EmailLog['status']): {
  label: string;
  icon: React.ReactNode;
  tone: SignalTone;
} {
  switch (status) {
    case 'pending':
      return { label: 'В очереди', icon: <Clock />, tone: 'muted' };
    case 'sent':
      return { label: 'Отправлено', icon: <Send />, tone: 'cool' };
    case 'delivered':
      return { label: 'Доставлено', icon: <CheckCircle />, tone: 'good' };
    case 'opened':
      return { label: 'Открыто', icon: <Eye />, tone: 'good' };
    case 'clicked':
      return { label: 'Кликнул', icon: <ArrowRight />, tone: 'good' };
    case 'bounced':
      return { label: 'Возврат', icon: <XCircle />, tone: 'hot' };
    case 'spam':
      return { label: 'Спам', icon: <AlertTriangle />, tone: 'warm' };
    case 'failed':
      return { label: 'Ошибка', icon: <XCircle />, tone: 'hot' };
    default:
      return { label: status, icon: null, tone: 'muted' };
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
