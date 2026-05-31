'use client';

/**
 * MapsSearchPanel — корневой компонент режима «По картам» на /app/leads.
 *
 * Состояние через локальный useState:
 *   - mode: 'idle' | 'searching' | 'results'
 *   - searchId: number | null — id текущего поиска
 *   - filters: MapSearchFilter — фильтры панели результатов
 *
 * В этой итерации (Шаг 13 ТЗ) — только каркас с формой. Подключение
 * useSearchStream / фильтров / списка / drawer добавляется в шагах 14-16.
 */

import { useState } from 'react';

import { MapsSearchForm } from '@/components/maps/MapsSearchForm';
import { MapsSearchResults } from '@/components/maps/MapsSearchResults';
import type { MapSearchOut } from '@/src/services/api/maps';
import type { UserPresetOut } from '@/src/services/api/user-presets';

type Mode = 'idle' | 'searching' | 'results';

export function MapsSearchPanel() {
  const [mode, setMode] = useState<Mode>('idle');
  const [search, setSearch] = useState<MapSearchOut | null>(null);
  // Если на форме выбрали user-пресет с ai_prompt — пробрасываем сюда, чтобы
  // Results-страница активировала AI-плашку и автозапустила анализ как только
  // выдача загрузится.
  const [pendingAiPreset, setPendingAiPreset] = useState<UserPresetOut | null>(null);

  function handleStarted(s: MapSearchOut, aiPreset?: UserPresetOut | null) {
    setSearch(s);
    setPendingAiPreset(aiPreset ?? null);
    setMode(s.status === 'from_cache' ? 'results' : 'searching');
  }

  function handleNewSearch() {
    setSearch(null);
    setPendingAiPreset(null);
    setMode('idle');
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
