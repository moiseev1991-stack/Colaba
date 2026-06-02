'use client';

/**
 * Leaflet-карта с тепловым слоем (блок 5 ТЗ 2026-06-02).
 *
 * Получает точки {lat, lng, weight} от /api/v1/maps/heatmap, рендерит
 * через leaflet.heat. Селектор слоя позволяет переключать смысл «тепла»:
 *   density — плотность компаний (где густо/пусто)
 *   pain    — концентрация боли (mention_count тегов)
 *   website — где пакетно продавать сайты (website_lead_score)
 *   rating  — где слабый сервис (низкий рейтинг)
 *   wealth  — платёжеспособность (через temperature, до Блока 2/legal)
 *
 * dynamic import без SSR (Leaflet трогает window).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet.heat';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';

import { apiClient } from '@/client';

import 'leaflet/dist/leaflet.css';

export type HeatmapLayer =
  | 'density'
  | 'pain'
  | 'website'
  | 'rating'
  | 'wealth';

interface HeatmapPoint {
  lat: number;
  lng: number;
  weight: number;
}

interface ApiResponse {
  layer: HeatmapLayer;
  points: HeatmapPoint[];
  count: number;
}

interface Props {
  searchId: number;
  /** Координаты любых имеющихся компаний — для fitBounds. */
  fallbackCenter?: { lat: number; lng: number };
}

const LAYER_LABELS: { value: HeatmapLayer; label: string; hint: string }[] = [
  { value: 'density', label: 'Плотность',  hint: 'где густо/пусто (компаний ниши)' },
  { value: 'pain',    label: 'Боль',       hint: 'где много жалоб клиентов' },
  { value: 'website', label: 'Нужен сайт', hint: 'где пакетно продавать сайты' },
  { value: 'rating',  label: 'Слабый сервис', hint: 'где низкий рейтинг' },
  { value: 'wealth',  label: 'Платёжеспособные', hint: 'где «живые» бизнесы' },
];


function HeatLayer({ points }: { points: HeatmapPoint[] }) {
  const map = useMap();
  const layerRef = useRef<L.Layer | null>(null);

  useEffect(() => {
    if (layerRef.current) {
      map.removeLayer(layerRef.current);
      layerRef.current = null;
    }
    if (points.length === 0) return;

    // leaflet.heat принимает [lat, lng, intensity]. intensity 0..1.
    const data: [number, number, number][] = points.map((p) => [
      p.lat,
      p.lng,
      Math.max(0, Math.min(1, p.weight)),
    ]);

    // @ts-expect-error — типы leaflet.heat не идеальны, но рантайм-API есть.
    const heat = L.heatLayer(data, {
      radius: 30,
      blur: 25,
      maxZoom: 17,
      // Палитра огня: синий → жёлтый → красный.
      gradient: {
        0.2: '#3b82f6',
        0.45: '#fbbf24',
        0.7: '#f97316',
        1.0: '#dc2626',
      },
    }).addTo(map);
    layerRef.current = heat;

    // FitBounds на первой загрузке.
    const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number]));
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [30, 30] });
    }

    return () => {
      if (layerRef.current) {
        map.removeLayer(layerRef.current);
        layerRef.current = null;
      }
    };
  }, [map, points]);

  return null;
}


export default function MapsCompaniesHeatmap({ searchId, fallbackCenter }: Props) {
  const [layer, setLayer] = useState<HeatmapLayer>('density');
  const [points, setPoints] = useState<HeatmapPoint[]>([]);
  const [count, setCount] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    apiClient
      .get<ApiResponse>(`/maps/heatmap?search_id=${searchId}&layer=${layer}`)
      .then((res) => {
        if (cancelled) return;
        setPoints(res.data.points);
        setCount(res.data.count);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const msg =
          e instanceof Error
            ? e.message
            : 'Не удалось загрузить тепловую карту';
        setError(msg);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [searchId, layer]);

  const center = useMemo<[number, number]>(() => {
    if (points.length > 0) return [points[0].lat, points[0].lng];
    if (fallbackCenter) return [fallbackCenter.lat, fallbackCenter.lng];
    return [55.751244, 37.618423]; // Москва по умолчанию
  }, [points, fallbackCenter]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
          Слой тепла:
        </span>
        {LAYER_LABELS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setLayer(opt.value)}
            title={opt.hint}
            className={
              layer === opt.value
                ? 'rounded-md bg-slate-900 px-2.5 py-1 text-xs font-medium text-white dark:bg-slate-100 dark:text-slate-900'
                : 'rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
            }
          >
            {opt.label}
          </button>
        ))}
        {isLoading && (
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Загружаю…
          </span>
        )}
        {count !== null && !isLoading && (
          <span className="text-xs text-slate-500 dark:text-slate-400">
            точек: {count}
          </span>
        )}
        {error && (
          <span className="text-xs text-rose-600 dark:text-rose-400">
            {error}
          </span>
        )}
      </div>

      <div className="h-[560px] overflow-hidden rounded-md border border-slate-200 dark:border-slate-700">
        <MapContainer
          center={center}
          zoom={11}
          style={{ height: '100%', width: '100%' }}
          scrollWheelZoom
        >
          <TileLayer
            attribution='&copy; OpenStreetMap'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <HeatLayer points={points} />
        </MapContainer>
      </div>

      {/* Легенда: что означает выбранный слой */}
      <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] text-slate-600 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-300">
        {LAYER_LABELS.find((o) => o.value === layer)?.hint ?? ''} ·
        холодный (синий) → горячий (красный).
      </div>
    </div>
  );
}
