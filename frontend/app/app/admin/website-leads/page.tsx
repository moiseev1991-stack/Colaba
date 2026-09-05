'use client';

/**
 * /app/admin/website-leads — админский inbox заявок с публичных
 * SEO-лендингов spinlid.ru. Доступ только под is_superuser
 * (бэкенд проверяет, GET вернёт 403 если флага нет).
 *
 * На старте только у sir.nikam@example.com — после миграции 041.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Trash2 } from 'lucide-react';

// origin — из какой таблицы пришла заявка. website: главная + SEO-лендинги
// (модуль website_leads). inbound: форма /razbor (модуль inbound_leads, своё
// API /api/v1/inbound-leads). Раньше страница читала только website_leads,
// поэтому заявки с /razbor тут не показывались. Объединяем оба потока.
type Origin = 'website' | 'inbound';

type Lead = {
  id: number;
  origin: Origin;
  name: string;
  channel: string;
  contact: string;
  wish: string;
  source_page: string;
  referrer: string;
  ip: string;
  user_agent: string;
  status: string;
  created_at: string;
};

const STATUSES: ReadonlyArray<{ value: string; label: string; color: string }> = [
  { value: 'new', label: 'Новая', color: '#0e9384' },
  { value: 'contacted', label: 'Связались', color: '#2563eb' },
  { value: 'qualified', label: 'В работе', color: '#a855f7' },
  { value: 'spam', label: 'Спам', color: '#94a3b8' },
];

// Статусы у inbound_leads свои (new/in_progress/replied/closed). В UI держим
// единый набор website-статусов, а на границе с API /inbound-leads
// конвертируем 1:1 туда-обратно.
const INBOUND_TO_UI: Record<string, string> = {
  new: 'new',
  in_progress: 'contacted',
  replied: 'qualified',
  closed: 'spam',
};
const UI_TO_INBOUND: Record<string, string> = {
  new: 'new',
  contacted: 'in_progress',
  qualified: 'replied',
  spam: 'closed',
};

function mapInboundLead(i: any): Lead {
  return {
    id: i.id,
    origin: 'inbound',
    name: i.name || '',
    channel: i.tg_username ? 'telegram' : '',
    contact: i.contact_text || (i.tg_username ? `@${i.tg_username}` : ''),
    wish: i.company_text || '',
    source_page: i.source_tag || (i.source === 'landing_form' ? 'razbor' : i.source || ''),
    referrer: '',
    ip: '',
    user_agent: '',
    status: INBOUND_TO_UI[i.status] ?? 'new',
    created_at: i.created_at,
  };
}

const CHANNEL_LABEL: Record<string, string> = {
  email: 'Email',
  phone: 'Телефон',
  whatsapp: 'WhatsApp',
  telegram: 'Telegram',
  max: 'MAX',
};

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export default function AdminWebsiteLeadsPage() {
  const [items, setItems] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [includeDeleted, setIncludeDeleted] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Фильтр по статусу применяем на клиенте (у двух источников разные
      // словари статусов), поэтому тянем всё и мержим.
      const wsParams = new URLSearchParams();
      if (includeDeleted) wsParams.set('include_deleted', 'true');
      wsParams.set('limit', '200');
      const [wsRes, inRes] = await Promise.all([
        fetch(`/api/v1/website-leads?${wsParams.toString()}`, { cache: 'no-store' }),
        fetch('/api/v1/inbound-leads?limit=200', { cache: 'no-store' }),
      ]);
      if ([wsRes.status, inRes.status].some((s) => s === 401 || s === 403)) {
        setError('Доступ запрещён. Эта страница доступна только администраторам.');
        setItems([]);
        return;
      }
      if (!wsRes.ok) {
        setError(`Не удалось загрузить заявки (HTTP ${wsRes.status}).`);
        return;
      }
      const wsData = await wsRes.json();
      const wsItems: Lead[] = (wsData.items ?? []).map((i: any) => ({ ...i, origin: 'website' as const }));
      let inItems: Lead[] = [];
      if (inRes.ok) {
        const inData = await inRes.json();
        inItems = (inData.items ?? []).map(mapInboundLead);
      }
      const merged = [...wsItems, ...inItems].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
      setItems(merged);
      setTotal(merged.length);
    } catch {
      setError('Сеть не отвечает.');
    } finally {
      setLoading(false);
    }
  }, [includeDeleted]);

  useEffect(() => {
    load();
  }, [load]);

  const counters = useMemo(() => {
    const byStatus: Record<string, number> = { new: 0, contacted: 0, qualified: 0, spam: 0 };
    for (const it of items) {
      byStatus[it.status] = (byStatus[it.status] ?? 0) + 1;
    }
    return byStatus;
  }, [items]);

  const visible = useMemo(
    () => (statusFilter ? items.filter((i) => i.status === statusFilter) : items),
    [items, statusFilter],
  );

  async function changeStatus(id: number, origin: Origin, newStatus: string) {
    const prev = items;
    setItems((curr) => curr.map((i) => (i.id === id && i.origin === origin ? { ...i, status: newStatus } : i)));
    try {
      const base = origin === 'inbound' ? '/api/v1/inbound-leads' : '/api/v1/website-leads';
      const apiStatus = origin === 'inbound' ? UI_TO_INBOUND[newStatus] : newStatus;
      const res = await fetch(`${base}/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: apiStatus }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}${text ? ': ' + text.slice(0, 200) : ''}`);
      }
    } catch (e: any) {
      setItems(prev);
      alert(`Не удалось обновить статус.\n${e?.message ?? 'unknown'}`);
    }
  }

  async function softDelete(id: number) {
    // Удаление есть только у website_leads. Заявки с /razbor (inbound) не
    // удаляем кнопкой — у их API нет DELETE; помечать «Спам» можно статусом.
    if (!confirm('Удалить заявку (soft-delete)?')) return;
    try {
      const res = await fetch(`/api/v1/website-leads/${id}`, { method: 'DELETE' });
      // Принимаем любой 2xx — бэк отдаёт 204 No Content, но прокси на
      // проде (Traefik/Coolify) переписывает его в 200 OK, потому что
      // 204 без тела для некоторых прокси выглядит как «битый ответ».
      // Раньше тут была строгая проверка `!== 204` → юзер видел alert
      // «не удалось», хотя в БД soft-delete уже отработал.
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}${text ? ': ' + text.slice(0, 200) : ''}`);
      }
      setItems((curr) => curr.filter((i) => i.id !== id));
      setTotal((t) => Math.max(t - 1, 0));
    } catch (e: any) {
      alert(`Не удалось удалить.\n${e?.message ?? 'unknown'}`);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1400px] px-3 sm:px-6 py-4 sm:py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-semibold" style={{ color: 'hsl(var(--text))' }}>
            Заявки с сайта
          </h1>
          <p className="text-sm mt-1" style={{ color: 'hsl(var(--muted))' }}>
            Лиды, оставленные на публичных страницах spinlid.ru. Всего: {total}.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-60"
          style={{
            background: 'hsl(var(--surface))',
            border: '1px solid hsl(var(--border))',
            color: 'hsl(var(--text))',
          }}
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Обновить
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setStatusFilter('')}
          className="rounded-full px-3 py-1 text-sm"
          style={{
            background: statusFilter === '' ? 'hsl(var(--accent) / 0.15)' : 'hsl(var(--surface))',
            border: '1px solid hsl(var(--border))',
            color: 'hsl(var(--text))',
            fontWeight: statusFilter === '' ? 600 : 400,
          }}
        >
          Все ({items.length})
        </button>
        {STATUSES.map((s) => (
          <button
            key={s.value}
            type="button"
            onClick={() => setStatusFilter(s.value === statusFilter ? '' : s.value)}
            className="rounded-full px-3 py-1 text-sm"
            style={{
              background: statusFilter === s.value ? `${s.color}22` : 'hsl(var(--surface))',
              border: `1px solid ${statusFilter === s.value ? s.color : 'hsl(var(--border))'}`,
              color: 'hsl(var(--text))',
              fontWeight: statusFilter === s.value ? 600 : 400,
            }}
          >
            {s.label} ({counters[s.value] ?? 0})
          </button>
        ))}
        <label className="ml-2 flex items-center gap-2 text-sm" style={{ color: 'hsl(var(--muted))' }}>
          <input
            type="checkbox"
            checked={includeDeleted}
            onChange={(e) => setIncludeDeleted(e.target.checked)}
          />
          Показывать удалённые
        </label>
      </div>

      {error && (
        <div
          className="mt-4 rounded-lg p-3 text-sm"
          style={{
            background: 'rgba(239,68,68,0.08)',
            border: '1px solid rgba(239,68,68,0.3)',
            color: '#dc2626',
          }}
        >
          {error}
        </div>
      )}

      <div
        className="mt-4 overflow-x-auto rounded-lg"
        style={{ border: '1px solid hsl(var(--border))' }}
      >
        <table className="min-w-full text-sm">
          <thead>
            <tr style={{ background: 'hsl(var(--surface))', color: 'hsl(var(--muted))' }}>
              <th className="text-left px-3 py-2 font-medium">Дата</th>
              <th className="text-left px-3 py-2 font-medium">Имя</th>
              <th className="text-left px-3 py-2 font-medium">Канал</th>
              <th className="text-left px-3 py-2 font-medium">Контакт</th>
              <th className="text-left px-3 py-2 font-medium">Пожелание</th>
              <th className="text-left px-3 py-2 font-medium">Страница</th>
              <th className="text-left px-3 py-2 font-medium">Статус</th>
              <th className="text-right px-3 py-2 font-medium">&nbsp;</th>
            </tr>
          </thead>
          <tbody>
            {loading && items.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center py-8" style={{ color: 'hsl(var(--muted))' }}>
                  Загрузка…
                </td>
              </tr>
            )}
            {!loading && visible.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center py-8" style={{ color: 'hsl(var(--muted))' }}>
                  Пока заявок нет.
                </td>
              </tr>
            )}
            {visible.map((it) => (
              <tr key={`${it.origin}-${it.id}`} style={{ borderTop: '1px solid hsl(var(--border))' }}>
                <td className="px-3 py-2 whitespace-nowrap" style={{ color: 'hsl(var(--muted))' }}>
                  {formatDate(it.created_at)}
                </td>
                <td className="px-3 py-2" style={{ color: 'hsl(var(--text))' }}>
                  {it.name || <span style={{ color: 'hsl(var(--muted))' }}>—</span>}
                </td>
                <td className="px-3 py-2" style={{ color: 'hsl(var(--text))' }}>
                  {CHANNEL_LABEL[it.channel] ?? it.channel}
                </td>
                <td className="px-3 py-2 whitespace-nowrap" style={{ color: 'hsl(var(--text))' }}>
                  <span style={{ fontFamily: 'var(--font-mono, monospace)' }}>{it.contact}</span>
                </td>
                <td className="px-3 py-2" style={{ color: 'hsl(var(--muted))', maxWidth: 240 }}>
                  {it.wish ? (
                    <span title={it.wish}>
                      {it.wish.length > 60 ? `${it.wish.slice(0, 60)}…` : it.wish}
                    </span>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="px-3 py-2" style={{ color: 'hsl(var(--muted))' }}>
                  <span style={{ fontFamily: 'var(--font-mono, monospace)' }}>{it.source_page}</span>
                </td>
                <td className="px-3 py-2">
                  <select
                    value={it.status}
                    onChange={(e) => changeStatus(it.id, it.origin, e.target.value)}
                    className="rounded px-2 py-1 text-sm"
                    style={{
                      background: 'hsl(var(--bg))',
                      border: '1px solid hsl(var(--border))',
                      color: 'hsl(var(--text))',
                    }}
                  >
                    {STATUSES.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2 text-right">
                  {it.origin === 'website' ? (
                    <button
                      type="button"
                      onClick={() => softDelete(it.id)}
                      className="rounded p-1"
                      style={{ color: '#94a3b8' }}
                      title="Удалить"
                    >
                      <Trash2 size={16} />
                    </button>
                  ) : (
                    <span title="Заявка с /razbor — пометьте статусом «Спам»" style={{ color: 'hsl(var(--border))' }}>
                      /razbor
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
