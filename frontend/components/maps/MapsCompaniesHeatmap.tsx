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
 * leaflet.heat подгружается с CDN (unpkg) в useEffect, чтобы не
 * требовать npm-зависимости — иначе CI ломается на `npm ci` из-за
 * рассинхрона package-lock.json (см. PR с CI fail 256).
 *
 * dynamic import без SSR (Leaflet трогает window).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';

import { apiClient } from '@/client';

import 'leaflet/dist/leaflet.css';


// leaflet.heat — статика frontend/public/leaflet-heat.js (vendored).
// Грузим с same-origin /leaflet-heat.js — не зависим от CDN (unpkg/jsdelivr
// иногда блокируются в РФ-сетях). Плагин ищет global window.L —
// поэтому перед загрузкой скрипта явно ставим window.L = L.
let _heatLoadPromise: Promise<void> | null = null;

function ensureLeafletHeatLoaded(): Promise<void> {
  if (_heatLoadPromise) return _heatLoadPromise;
  _heatLoadPromise = new Promise<void>((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('window undefined'));
      return;
    }
    (window as unknown as { L: typeof L }).L = L;
    // @ts-expect-error — heatLayer добавляется как side-effect
    if (typeof L.heatLayer === 'function') {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = '/leaflet-heat.js';
    script.async = true;
    script.onload = () => {
      // @ts-expect-error — heatLayer добавляется как side-effect
      if (typeof L.heatLayer === 'function') {
        resolve();
      } else {
        reject(new Error('leaflet.heat loaded but L.heatLayer missing'));
      }
    };
    script.onerror = () => reject(new Error('leaflet.heat /leaflet-heat.js load failed'));
    document.head.appendChild(script);
  });
  return _heatLoadPromise;
}

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

const LAYER_LABELS: { value: HeatmapLayer; label: string; hint: string; long: string }[] = [
  {
    value: 'density',
    label: 'Плотность',
    hint: 'где густо/пусто (компаний ниши)',
    long: 'Красные пятна — кварталы, где много компаний ниши (конкуренция, нужен сильный оффер). Синие — там почти никого (можно занять рынок).',
  },
  {
    value: 'pain',
    label: 'Боль',
    hint: 'где много жалоб клиентов',
    long: 'Сумма упоминаний болей по отзывам всех компаний района. Красное — район, где клиенты регулярно жалуются. Эти компании горячие лиды для SERM / автоматизации / новой команды.',
  },
  {
    value: 'website',
    label: 'Нужен сайт',
    hint: 'где пакетно продавать сайты',
    long: 'Где сидят компании БЕЗ сайта, но при этом «живые» (отзывы, рейтинг, телефон). Красное — район для веб-студии: можно за день обойти 5-10 компаний.',
  },
  {
    value: 'rating',
    label: 'Слабый сервис',
    hint: 'где низкий рейтинг',
    long: 'Концентрация компаний с рейтингом <4. Красное — район, где сервис плохой. Эти компании сами знают что у них проблема — горячие лиды для репутации / обучения / CRM.',
  },
  {
    value: 'wealth',
    label: 'Платёжеспособные',
    hint: 'где «живые» бизнесы',
    long: 'Прокси «у бизнеса есть деньги» — через температуру лида (рейтинг × отзывы × свежесть × контакты). Красное — район «живых» бизнесов с бюджетом. Когда подключим юр.данные DaData, заменим на реальный оборот.',
  },
];


function HeatLayer({ points }: { points: HeatmapPoint[] }) {
  const map = useMap();
  const layerRef = useRef<L.Layer | null>(null);
  const [heatReady, setHeatReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    ensureLeafletHeatLoaded()
      .then(() => {
        if (!cancelled) setHeatReady(true);
      })
      .catch(() => {
        /* CDN unreachable — UI покажет точки только на TileLayer без heat. */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!heatReady) return;
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

    // @ts-expect-error — heatLayer добавляется CDN-скриптом в рантайме.
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
  }, [map, points, heatReady]);

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

      {/* Легенда: что означает выбранный слой + градиентная шкала.
          Юзер регулярно путался «что красное значит» — теперь есть
          и подпись слоя, и визуальная шкала цвета. */}
      <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] text-slate-700 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-200">
        <div>
          <span className="font-medium">
            {LAYER_LABELS.find((o) => o.value === layer)?.label}:
          </span>{' '}
          <span className="text-slate-600 dark:text-slate-300">
            {LAYER_LABELS.find((o) => o.value === layer)?.long}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-slate-500 dark:text-slate-400">Шкала:</span>
          <div
            className="h-2 flex-1 rounded-full"
            style={{
              background:
                'linear-gradient(to right, #3b82f6 0%, #fbbf24 45%, #f97316 70%, #dc2626 100%)',
            }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-slate-500 dark:text-slate-400">
          <span>холодный · мало / нет</span>
          <span>тёплый · средне</span>
          <span>горячий · много</span>
        </div>
      </div>
    </div>
  );
}
