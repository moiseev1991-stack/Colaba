/**
 * SSE-хук для прогрессивной выдачи поиска по картам.
 *
 * Подключается к /api/v1/maps/search/{id}/stream, накапливает компании
 * (event=company), отслеживает прогресс (event=progress) и завершение
 * (event=done или error). Закрывает соединение при unmount.
 *
 * 2026-06-18: на проде Coolify/Traefik закрывает SSE через ~60 сек
 * keep-alive. Раньше это сразу показывало красную плашку «Соединение
 * прервано» — пугало юзера, хотя бэкенд продолжал парсить в фоне.
 * Теперь делаем до 3-х тихих reconnect'ов с экспоненциальным backoff
 * (1.5с → 4с → 10с). Плашка ошибки появляется только если все 3 попытки
 * провалились. При успешном reconnect duplicate events отсеиваются —
 * `company` пришедшая повторно обновляет существующую запись (idx>=0).
 *
 * NB: текущий Next.js proxy (frontend/app/api/v1/[...path]/route.ts) буферизует
 * upstream — chunked transfer / SSE через него приходит пакетом в конце, а не
 * стримом. Хук работает корректно, но "живая" выдача появится после перевода
 * прокси на streaming (это отдельная задача за пределами модуля maps).
 * До этого UI показывает все события сразу как только бэкенд закроет соединение.
 */

import { useEffect, useState } from 'react';

import type { CompanyOut } from '@/src/services/api/maps';

export interface StreamProgress {
  stage?: string;
  source?: string;
  companies_processed?: number;
  companies_total?: number;
  processed?: number;
  total?: number;
  // Бэкенд (maps/tasks.py) шлёт saved/expected — фронт обрабатывает все варианты.
  saved?: number;
  expected?: number;
}

export interface StreamState {
  companies: Array<Partial<CompanyOut> & { company_id: number; position?: number | null }>;
  progress: StreamProgress | null;
  done: boolean;
  error: string | null;
  /** Сколько раз подряд SSE-соединение разрывалось без `done`. До 3-х
   *  попыток подряд UI считает это сетевым блипом и не показывает ошибку. */
  reconnectAttempt: number;
}

const INITIAL: StreamState = {
  companies: [],
  progress: null,
  done: false,
  error: null,
  reconnectAttempt: 0,
};

// Экспоненциальный backoff между попытками: 1.5с → 4с → 10с. После
// MAX_RECONNECT поднимаем error и больше не пытаемся.
const RECONNECT_DELAYS_MS = [1500, 4000, 10000];
const MAX_RECONNECT = RECONNECT_DELAYS_MS.length;

export function useSearchStream(searchId: number | null): StreamState {
  const [state, setState] = useState<StreamState>(INITIAL);

  useEffect(() => {
    if (searchId == null) {
      setState(INITIAL);
      return;
    }

    setState(INITIAL);

    let es: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;
    let attempt = 0;

    const connect = () => {
      if (cancelled) return;

      // EventSource ходит через тот же origin — Next.js proxy инжектит Authorization
      // из httpOnly cookie на сервере (см. frontend/app/api/v1/[...path]/route.ts).
      const url = `/api/v1/maps/search/${searchId}/stream`;
      es = new EventSource(url);

      const onCompany = (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          setState((s) => {
            // Если компания уже есть (повторный bootstrap + live) — обновляем поля
            const idx = s.companies.findIndex((c) => c.company_id === data.company_id);
            if (idx >= 0) {
              const next = [...s.companies];
              next[idx] = { ...next[idx], ...data };
              return { ...s, companies: next };
            }
            return { ...s, companies: [...s.companies, data] };
          });
        } catch {
          /* ignore malformed */
        }
      };

      const onCompanyUpdated = (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          setState((s) => ({
            ...s,
            companies: s.companies.map((c) =>
              c.company_id === data.company_id ? { ...c, ...data } : c
            ),
          }));
        } catch {
          /* ignore */
        }
      };

      const onProgress = (e: MessageEvent) => {
        try {
          setState((s) => ({ ...s, progress: JSON.parse(e.data) }));
        } catch {
          /* ignore */
        }
      };

      const onDone = () => {
        setState((s) => ({ ...s, done: true, error: null }));
        if (es) {
          es.close();
          es = null;
        }
      };

      const onError = (_e: Event) => {
        // EventSource сам уходит в readyState=CONNECTING при первой ошибке
        // и повторяет коннект. Но мы хотим контролируемый backoff и
        // лимит попыток — поэтому закрываем и переподключаемся вручную.
        if (es) {
          es.close();
          es = null;
        }
        attempt += 1;
        if (attempt > MAX_RECONNECT) {
          setState((s) => ({
            ...s,
            error: s.error ?? 'Соединение с сервером прервано',
            reconnectAttempt: attempt,
          }));
          return;
        }
        setState((s) => ({ ...s, reconnectAttempt: attempt }));
        const delay = RECONNECT_DELAYS_MS[attempt - 1] ?? 10000;
        reconnectTimer = setTimeout(connect, delay);
      };

      es.addEventListener('company', onCompany as EventListener);
      es.addEventListener('company_updated', onCompanyUpdated as EventListener);
      es.addEventListener('progress', onProgress as EventListener);
      es.addEventListener('done', onDone);
      es.addEventListener('error', onError);

      // Если коннект открылся успешно — сбрасываем счётчик попыток и
      // убираем стойкую плашку об ошибке. open срабатывает через TCP-ack,
      // первый event может прийти позже.
      es.onopen = () => {
        attempt = 0;
        setState((s) =>
          s.error || s.reconnectAttempt > 0
            ? { ...s, error: null, reconnectAttempt: 0 }
            : s,
        );
      };
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (es) {
        es.close();
        es = null;
      }
    };
  }, [searchId]);

  return state;
}
