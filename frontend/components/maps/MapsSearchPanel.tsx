'use client';

/**
 * MapsSearchPanel — корневой компонент режима «По картам» на /app/leads.
 *
 * Состояние через локальный useState:
 *   - mode: 'idle' | 'searching' | 'results'
 *   - searchId: number | null — id текущего поиска
 *   - filters: MapSearchFilter — фильтры панели результатов
 *
 * Поддержка ?map_search_id=N в URL — открывает существующий поиск
 * (для перехода со страницы «История»).
 */

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

import { MapsSearchForm } from '@/components/maps/MapsSearchForm';
import { MapsSearchResults } from '@/components/maps/MapsSearchResults';
import { getMapSearch, type MapSearchOut } from '@/src/services/api/maps';
import type { UserPresetOut } from '@/src/services/api/user-presets';

type Mode = 'idle' | 'searching' | 'results';

export function MapsSearchPanel() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialId = searchParams?.get('map_search_id');

  const [mode, setMode] = useState<Mode>('idle');
  const [search, setSearch] = useState<MapSearchOut | null>(null);
  const [loadingExisting, setLoadingExisting] = useState<boolean>(
    Boolean(initialId),
  );
  // Если на форме выбрали user-пресет с ai_prompt — пробрасываем сюда, чтобы
  // Results-страница активировала AI-плашку и автозапустила анализ как только
  // выдача загрузится.
  const [pendingAiPreset, setPendingAiPreset] = useState<UserPresetOut | null>(null);

  // Если в URL ?map_search_id=N — грузим поиск и сразу показываем результаты.
  // Используется со страницы «История» для открытия конкретного поиска.
  useEffect(() => {
    if (!initialId) return;
    const id = Number(initialId);
    if (!Number.isFinite(id) || id <= 0) {
      setLoadingExisting(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const s = await getMapSearch(id);
        if (cancelled) return;
        setSearch(s);
        setMode(
          s.status === 'completed' || s.status === 'from_cache'
            ? 'results'
            : 'searching',
        );
      } catch {
        // Поиск не найден или нет доступа — просто остаёмся в idle.
      } finally {
        if (!cancelled) setLoadingExisting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialId]);

  function handleStarted(s: MapSearchOut, aiPreset?: UserPresetOut | null) {
    setSearch(s);
    setPendingAiPreset(aiPreset ?? null);
    setMode(s.status === 'from_cache' ? 'results' : 'searching');
  }

  function handleNewSearch() {
    setSearch(null);
    setPendingAiPreset(null);
    setMode('idle');
    // Чистим ?map_search_id из URL чтобы при обновлении страницы не
    // открыло старый поиск снова.
    if (initialId) {
      router.replace('/app/leads');
    }
  }

  if (loadingExisting) {
    return (
      <div className="py-12 text-center text-sm" style={{ color: 'hsl(var(--muted))' }}>
        Загружаю поиск…
      </div>
    );
  }

  if (mode !== 'idle' && search) {
    return (
      <MapsSearchResults
        search={search}
        initialMode={mode === 'searching' ? 'searching' : 'results'}
        initialAiPreset={pendingAiPreset}
        onNewSearch={handleNewSearch}
      />
    );
  }

  return <MapsSearchForm onStarted={handleStarted} />;
}
