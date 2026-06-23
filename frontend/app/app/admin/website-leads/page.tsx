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

type Lead = {
  id: number;
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
      const params = new URLSearchParams();
      if (statusFilter) params.set('status_filter', statusFilter);
      if (includeDeleted) params.set('include_deleted', 'true');
      params.set('limit', '200');
      const res = await fetch(`/api/v1/website-leads?${params.toString()}`, {
        cache: 'no-store',
      });
      if (res.status === 401 || res.status === 403) {
        setError('Доступ запрещён. Эта страница доступна только администраторам.');
        setItems([]);
        return;
      }
      if (!res.ok) {
        setError(`Не удалось загрузить заявки (HTTP ${res.status}).`);
        return;
      }
      const data = await res.json();
      setItems(data.items ?? []);
      setTotal(data.total ?? 0);
    } catch {
      setError('Сеть не отвечает.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, includeDeleted]);

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

  async function changeStatus(id: number, newStatus: string) {
    const prev = items;
    setItems((curr) => curr.map((i) => (i.id === id ? { ...i, status: newStatus } : i)));
    try {
      const res = await fetch(`/api/v1/website-leads/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
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
            {!loading && items.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center py-8" style={{ color: 'hsl(var(--muted))' }}>
                  Пока заявок нет.
                </td>
              </tr>
            )}
            {items.map((it) => (
              <tr key={it.id} style={{ borderTop: '1px solid hsl(var(--border))' }}>
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
                    onChange={(e) => changeStatus(it.id, e.target.value)}
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
                  <button
                    type="button"
                    onClick={() => softDelete(it.id)}
                    className="rounded p-1"
                    style={{ color: '#94a3b8' }}
                    title="Удалить"
                  >
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
