/**
 * SSE-хук для прогрессивной выдачи поиска по картам.
 *
 * Подключается к /api/v1/maps/search/{id}/stream, накапливает компании
 * (event=company), отслеживает прогресс (event=progress) и завершение
 * (event=done или error). Закрывает соединение при unmount.
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
}

const INITIAL: StreamState = {
  companies: [],
  progress: null,
  done: false,
  error: null,
};

export function useSearchStream(searchId: number | null): StreamState {
  const [state, setState] = useState<StreamState>(INITIAL);

  useEffect(() => {
    if (searchId == null) {
      setState(INITIAL);
      return;
    }

    setState(INITIAL);

    // EventSource ходит через тот же origin — Next.js proxy инжектит Authorization
    // из httpOnly cookie на сервере (см. frontend/app/api/v1/[...path]/route.ts).
    const url = `/api/v1/maps/search/${searchId}/stream`;
    const es = new EventSource(url);

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
      setState((s) => ({ ...s, done: true }));
      es.close();
    };

    const onError = (_e: Event) => {
      setState((s) => ({
        ...s,
        error: s.error ?? 'Соединение с сервером прервано',
      }));
      es.close();
    };

    es.addEventListener('company', onCompany as EventListener);
    es.addEventListener('company_updated', onCompanyUpdated as EventListener);
    es.addEventListener('progress', onProgress as EventListener);
    es.addEventListener('done', onDone);
    es.addEventListener('error', onError);

    return () => {
      es.removeEventListener('company', onCompany as EventListener);
      es.removeEventListener('company_updated', onCompanyUpdated as EventListener);
      es.removeEventListener('progress', onProgress as EventListener);
      es.removeEventListener('done', onDone);
      es.removeEventListener('error', onError);
      es.close();
    };
  }, [searchId]);

  return state;
}
