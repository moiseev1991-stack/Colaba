'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { RefreshCw, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getMonitorRequests, type MonitorRequest } from '@/src/services/api/monitor';

const AUTO_REFRESH_INTERVAL_MS = 4000;
const SKELETON_ROWS = 8;

function formatLastUpdated(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  } catch {
    return '--:--:--';
  }
}

export function RequestMonitorTable() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [data, setData] = useState<{ updated_at: string; requests: MonitorRequest[] } | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setError(false);
      const res = await getMonitorRequests();
      setData({ updated_at: res.updated_at, requests: res.requests });
    } catch {
      setError(true);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const onRefresh = () => {
    setLoading(true);
    fetchData();
  };

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!autoRefresh) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }
    const t = setInterval(() => {
      fetchData();
    }, AUTO_REFRESH_INTERVAL_MS);
    intervalRef.current = t;
    return () => {
      clearInterval(t);
      intervalRef.current = null;
    };
  }, [autoRefresh, fetchData]);

  return (
    <div className="w-full max-w-4xl mx-auto rounded-xl overflow-hidden border border-gray-700 bg-[#0f172a] shadow-xl">
      <div className="px-4 py-3 border-b border-gray-700/80 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-100">Request Monitor</h2>
          <p className="text-sm text-gray-400">
            Last updated: {data ? formatLastUpdated(data.updated_at) : '--:--:--'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={loading}
            className="border-gray-600 bg-gray-800/50 text-gray-200 hover:bg-gray-700 hover:text-white"
          >
            <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <label className="flex items-center gap-2 cursor-pointer">
            <span className="text-sm text-gray-400">Auto-refresh</span>
            <button
              type="button"
              role="switch"
              aria-checked={autoRefresh}
              onClick={() => setAutoRefresh((v) => !v)}
              className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-[#0f172a] ${
                autoRefresh ? 'border-red-600 bg-red-600' : 'border-gray-600 bg-gray-700'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                  autoRefresh ? 'translate-x-6' : 'translate-x-0.5'
                }`}
              />
            </button>
          </label>
        </div>
      </div>

      <div className="overflow-x-auto">
        {loading && !data && (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-700/80">
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Method</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400">URL</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Response Time</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Phone</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400">OK</th>
              </tr>
            </thead>
            <tbody>
              {[...Array(SKELETON_ROWS)].map((_, i) => (
                <tr key={i} className="border-b border-gray-700/50">
                  <td className="px-4 py-3">
                    <div className="monitor-skeleton-cell h-4 w-14 rounded" />
                  </td>
                  <td className="px-4 py-3">
                    <div className="monitor-skeleton-cell h-4 w-48 rounded" />
                  </td>
                  <td className="px-4 py-3">
                    <div className="monitor-skeleton-cell h-4 w-12 rounded" />
                  </td>
                  <td className="px-4 py-3">
                    <div className="monitor-skeleton-cell h-4 w-28 rounded" />
                  </td>
                  <td className="px-4 py-3">
                    <div className="monitor-skeleton-cell h-4 w-10 rounded" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {error && !data && (
          <div className="px-4 py-12 text-center">
            <p className="text-red-400 mb-3">Failed to load</p>
            <Button variant="outline" size="sm" onClick={onRefresh} className="border-gray-600 text-gray-200 hover:bg-gray-700">
              <RotateCw className="h-4 w-4 mr-1.5" />
              Retry
            </Button>
          </div>
        )}

        {data && data.requests.length === 0 && !loading && (
          <div className="px-4 py-12 text-center text-gray-400">No requests yet</div>
        )}

        {data && data.requests.length > 0 && (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-700/80">
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Method</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400">URL</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Response Time</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Phone</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400">OK</th>
              </tr>
            </thead>
            <tbody>
              {data.requests.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-gray-700/50 transition-colors duration-200 hover:bg-gray-800/30"
                >
                  <td className="px-4 py-3 text-sm font-medium text-gray-200">{r.method}</td>
                  <td className="px-4 py-3 text-sm text-gray-300 truncate max-w-[240px]" title={r.url}>
                    {r.url}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-300 tabular-nums">{r.response_time_ms}ms</td>
                  <td className="px-4 py-3 text-sm text-gray-400">{r.phone ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium transition-colors duration-200 ${
                        r.ok
                          ? 'bg-emerald-900/40 text-emerald-300'
                          : 'bg-red-900/40 text-red-300'
                      }`}
                    >
                      {r.ok ? 'Да' : 'Нет'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {loading && data && (
        <div className="h-1 w-full bg-gray-800 overflow-hidden">
          <div className="h-full w-1/3 bg-red-500/60 animate-pulse rounded-r" />
        </div>
      )}
    </div>
  );
}
