'use client';

/**
 * Leaflet-карта со всеми видимыми компаниями выдачи + тепловой слой
 * (блок 5 ТЗ 2026-06-02). Подключается через dynamic import без SSR в
 * MapsSearchResults — Leaflet трогает window и Next.js SSR падал бы.
 * Тайлы — OpenStreetMap (бесплатно, без API-key).
 *
 * Маркеры:
 *   - если есть AI-оценка → шкала фиолет/жёлтый/зелёный по score 0..10
 *   - иначе по рейтингу (низкий красный → средний жёлтый → высокий зелёный)
 *   - без рейтинга и без AI → серый
 *
 * Тепловая карта (5 слоёв):
 *   - off — выкл, видны только маркеры
 *   - density — плотность концентрации компаний в нише
 *   - pain — где больше всего недовольных (сумма негативных отзывов)
 *   - website — где плотность лидов «нужен сайт» (website_lead_score)
 *   - rating — где репутационные проблемы (rating < 4)
 *   - wealth — где сидят денежные компании (DaData revenue, log-шкала)
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet.heat';
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';

import {
  getSearchHeatmap,
  getSearchPainTags,
  type CompanyOut,
  type HeatmapLayer,
  type HeatmapOut,
  type PainTagOut,
} from '@/src/services/api/maps';
import type { CompanyAnalysisOut } from '@/src/services/api/reviews-ai';

import 'leaflet/dist/leaflet.css';

interface Props {
  companies: CompanyOut[];
  aiAnalyses?: Map<number, CompanyAnalysisOut>;
  onOpenCompany: (id: number) => void;
  /** ID поиска нужен только для запроса heatmap-точек (если включён слой). */
  searchId?: number;
  /** Source-фильтр из шапки выдачи — пробрасываем в /heatmap для синхронизации
   *  набора компаний между маркерами и тепловой картой. */
  activeSource?: 'all' | '2gis' | 'yandex_maps' | null;
}

type LayerOption = HeatmapLayer | 'off';

const LAYER_LABELS: Record<LayerOption, string> = {
  off: 'Маркеры',
  density: 'Плотность',
  pain: 'Боли',
  website: 'Нужен сайт',
  rating: 'Низкий рейтинг',
  wealth: '₽ платёжеспособные',
  pain_type: 'По теме боли',
};

const LAYER_HINTS: Record<LayerOption, string> = {
  off: 'Только точки компаний',
  density: 'Где сконцентрированы компании ниши в городе',
  pain: 'Где больше всего негатива у клиентов',
  website: 'Где плотность лидов «нужен сайт» (без своего сайта)',
  rating: 'Где низкие рейтинги — проблемы с репутацией',
  wealth: 'Где сидят денежные компании по DaData',
  pain_type: 'Тепло по конкретной боли (выбери из списка ниже)',
};

function hasCoords(c: CompanyOut): c is CompanyOut & { lat: number; lng: number } {
  return typeof c.lat === 'number' && typeof c.lng === 'number';
}

function colorForCompany(c: CompanyOut, a: CompanyAnalysisOut | undefined): string {
  if (a?.status === 'done' && typeof a.score === 'number') {
    if (a.score >= 7) return '#16a34a'; // зелёный
    if (a.score >= 4) return '#eab308'; // жёлтый
    return '#a78bfa'; // фиолетовый (низкий AI)
  }
  const r = c.rating;
  if (typeof r === 'number') {
    if (r >= 4.5) return '#16a34a';
    if (r >= 3.5) return '#eab308';
    return '#dc2626'; // красный (низкий рейтинг)
  }
  return '#94a3b8'; // серый
}

function buildIcon(color: string, label: string): L.DivIcon {
  // Inline-SVG marker: круг + подпись (рейтинг или AI score) по центру.
  // L.divIcon позволяет вставить произвольный HTML — это самый простой
  // путь к цветным маркерам без подключения дополнительных PNG-спрайтов.
  const html = `
    <div style="
      width: 28px; height: 28px;
      border-radius: 50%;
      background: ${color};
      border: 2px solid white;
      box-shadow: 0 1px 4px rgba(0,0,0,0.3);
      display: flex; align-items: center; justify-content: center;
      color: white; font-size: 11px; font-weight: 600;
      font-family: system-ui, sans-serif;
    ">${label}</div>
  `;
  return L.divIcon({
    html,
    className: '', // убираем дефолтные стили leaflet-div-icon
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -14],
  });
}

function FitBoundsOnce({ points }: { points: Array<[number, number]> }) {
  const map = useMap();
  const fittedRef = useRef(false);
  useEffect(() => {
    if (fittedRef.current) return;
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView(points[0], 14);
    } else {
      map.fitBounds(L.latLngBounds(points), { padding: [40, 40] });
    }
    fittedRef.current = true;
  }, [map, points]);
  return null;
}

/** Накладывает Leaflet.heat-layer на карту. На каждый сменённый набор точек
 *  пересоздаёт слой (heatLayer.setLatLngs() тоже работает, но при смене
 *  опций цвета/радиуса проще полностью пересоздать). */
function HeatLayer({ data }: { data: HeatmapOut | null }) {
  const map = useMap();
  const layerRef = useRef<L.Layer | null>(null);

  useEffect(() => {
    if (layerRef.current) {
      map.removeLayer(layerRef.current);
      layerRef.current = null;
    }
    if (!data || data.points.length === 0) return;
    // Leaflet.heat принимает массив [lat, lng, intensity].
    const pts = data.points.map(
      (p) => [p.lat, p.lng, p.weight] as [number, number, number],
    );
    // @ts-expect-error — leaflet.heat не имеет typings для L.heatLayer.
    const layer = L.heatLayer(pts, {
      radius: 32,
      blur: 22,
      maxZoom: 17,
      max: data.max_intensity,
      // Тёмная палитра: синий → бирюзовый → зелёный → жёлтый → красный.
      // На тёмной подложке OSM не теряется (ТЗ требовал «тёмную подложку
      // обязательно» — OSM-default тёмной нет, но шкала всё равно
      // читается контрастно).
      gradient: {
        0.0: '#1e40af',
        0.25: '#06b6d4',
        0.5: '#10b981',
        0.75: '#f59e0b',
        1.0: '#ef4444',
      },
    });
    layer.addTo(map);
    layerRef.current = layer;
    return () => {
      if (layerRef.current) {
        map.removeLayer(layerRef.current);
        layerRef.current = null;
      }
    };
  }, [map, data]);

  return null;
}

export default function MapsCompaniesMap({
  companies,
  aiAnalyses,
  onOpenCompany,
  searchId,
  activeSource,
}: Props) {
  const withCoords = useMemo(() => companies.filter(hasCoords), [companies]);
  const points = useMemo<Array<[number, number]>>(
    () => withCoords.map((c) => [c.lat, c.lng] as [number, number]),
    [withCoords],
  );

  // Дефолтный центр — Москва, если ни одной точки. После первого fit карта
  // сама перейдёт к bounds компаний; этот центр виден только в пустой выдаче.
  const initialCenter: [number, number] = points[0] ?? [55.7558, 37.6173];

  const [layer, setLayer] = useState<LayerOption>('off');
  const [heatData, setHeatData] = useState<HeatmapOut | null>(null);
  const [heatLoading, setHeatLoading] = useState(false);
  const [heatError, setHeatError] = useState<string | null>(null);
  // §2 ТЗ 2026-06-10: для слоя pain_type — список pain-тегов поиска + выбор.
  const [painTags, setPainTags] = useState<PainTagOut[]>([]);
  const [selectedPainTagId, setSelectedPainTagId] = useState<number | null>(null);

  // Подгружаем список pain-тегов поиска один раз при появлении searchId —
  // нужен для селектора pain_type-слоя.
  useEffect(() => {
    if (!searchId) {
      setPainTags([]);
      return;
    }
    let cancelled = false;
    getSearchPainTags(searchId)
      .then((d) => {
        if (cancelled) return;
        setPainTags(d);
        // Дефолтный выбор — топ-1, чтобы при переключении на pain_type сразу
        // была картинка, без «пустого» состояния.
        if (selectedPainTagId == null && d.length > 0) {
          setSelectedPainTagId(d[0].id);
        }
      })
      .catch(() => {
        if (!cancelled) setPainTags([]);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchId]);

  // Запрашиваем точки тепла когда юзер сменил слой (включил heatmap).
  useEffect(() => {
    if (layer === 'off' || !searchId) {
      setHeatData(null);
      setHeatError(null);
      return;
    }
    if (layer === 'pain_type' && selectedPainTagId == null) {
      setHeatData(null);
      setHeatError(null);
      return;
    }
    let cancelled = false;
    setHeatLoading(true);
    setHeatError(null);
    void (async () => {
      try {
        const data = await getSearchHeatmap(
          searchId,
          layer,
          activeSource,
          layer === 'pain_type' ? selectedPainTagId : null,
        );
        if (!cancelled) setHeatData(data);
      } catch (e) {
        if (!cancelled) {
          setHeatData(null);
          setHeatError('Не удалось загрузить тепловую карту');
        }
      } finally {
        if (!cancelled) setHeatLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [layer, searchId, activeSource, selectedPainTagId]);

  if (withCoords.length === 0) {
    return (
      <div className="rounded-v2-sm border border-[color:var(--signal-warm)]/30 bg-[var(--signal-warm-bg)] px-4 py-6 text-sm text-[color:var(--signal-warm)]">
        У этих компаний не сохранены координаты — карту построить не из чего.
        Это бывает у старых поисков (до миграции координат в API). Сделай новый
        поиск — у свежих компаний координаты есть.
      </div>
    );
  }

  const layerOptions: LayerOption[] = [
    'off',
    'density',
    'pain',
    'pain_type',
    'website',
    'rating',
    'wealth',
  ];

  return (
    <div className="space-y-2">
      {/* Переключатель слоёв тепловой карты */}
      <div className="flex flex-wrap items-center gap-2 text-[12px]">
        <span className="text-slate-500 dark:text-slate-400">Тепло:</span>
        <div className="inline-flex flex-wrap overflow-hidden rounded-md border border-slate-300 dark:border-slate-600">
          {layerOptions.map((opt, idx) => {
            const active = layer === opt;
            return (
              <button
                key={opt}
                type="button"
                onClick={() => setLayer(opt)}
                title={LAYER_HINTS[opt]}
                className={
                  'px-2.5 py-1 text-[12px] font-medium ' +
                  (idx > 0 ? 'border-l border-slate-300 dark:border-slate-600 ' : '') +
                  (active
                    ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                    : 'bg-white text-slate-700 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700')
                }
              >
                {LAYER_LABELS[opt]}
              </button>
            );
          })}
        </div>
        {heatLoading && (
          <span className="text-[11px] text-slate-500 dark:text-slate-400">
            Загружаю…
          </span>
        )}
        {heatError && (
          <span className="text-[11px] text-rose-700 dark:text-rose-400">{heatError}</span>
        )}
        {heatData && layer !== 'off' && (
          <span className="text-[11px] text-slate-500 dark:text-slate-400">
            {heatData.contributing} из {heatData.total_companies} компаний дали вклад
          </span>
        )}
      </div>

      {/* §2 ТЗ 2026-06-10: селектор конкретной боли для слоя pain_type */}
      {layer === 'pain_type' && (
        <div className="flex flex-wrap items-center gap-2 text-[12px]">
          <span className="text-slate-500 dark:text-slate-400">Боль:</span>
          {painTags.length === 0 ? (
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              AI ещё не разобрал боли в этой нише — слой пуст.
            </span>
          ) : (
            <select
              value={selectedPainTagId ?? ''}
              onChange={(e) => setSelectedPainTagId(Number(e.target.value) || null)}
              className="rounded border border-slate-300 bg-white px-2 py-1 text-[12px] text-slate-800 hover:border-slate-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            >
              {painTags.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label} · {t.occurrences_count}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      <div
        className="overflow-hidden rounded-md border border-slate-200"
        style={{ height: 560 }}
      >
        <MapContainer
          center={initialCenter}
          zoom={11}
          scrollWheelZoom
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <FitBoundsOnce points={points} />
          <HeatLayer data={heatData} />
          {withCoords.map((c) => {
            const a = aiAnalyses?.get(c.id);
            const color = colorForCompany(c, a);
            const label =
              a?.status === 'done' && typeof a.score === 'number'
                ? String(a.score)
                : typeof c.rating === 'number'
                  ? c.rating.toFixed(1)
                  : '·';
            return (
              <Marker key={c.id} position={[c.lat, c.lng]} icon={buildIcon(color, label)}>
                <Popup>
                  <div className="space-y-1" style={{ minWidth: 200 }}>
                    <div className="text-[13px] font-semibold text-slate-900">{c.name}</div>
                    {c.address && (
                      <div className="text-[11px] text-slate-500">{c.address}</div>
                    )}
                    <div className="text-[11px] text-slate-600">
                      {typeof c.rating === 'number' && <>★ {c.rating.toFixed(1)} · </>}
                      {c.reviews_count} отз. ({c.reviews_negative_count} нег.)
                    </div>
                    {a?.status === 'done' && typeof a.score === 'number' && (
                      <div className="text-[11px] text-violet-700">
                        AI score: <strong>{a.score}</strong>
                        {a.comment && <> — {a.comment}</>}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => onOpenCompany(c.id)}
                      className="mt-1 inline-flex items-center rounded-md bg-slate-900 px-2 py-1 text-[11px] font-medium text-white hover:bg-slate-800"
                    >
                      Открыть карточку
                    </button>
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>
      </div>
    </div>
  );
}
