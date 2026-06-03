'use client';

/**
 * Leaflet-карта со всеми видимыми компаниями выдачи. Подключается через
 * dynamic import без SSR в MapsSearchResults — Leaflet трогает window и
 * Next.js SSR падал бы. Тайлы — OpenStreetMap (бесплатно, без API-key).
 *
 * Цвет маркера:
 *   - если есть AI-оценка → шкала фиолет/жёлтый/зелёный по score 0..10
 *   - иначе по рейтингу (низкий красный → средний жёлтый → высокий зелёный)
 *   - без рейтинга и без AI → серый
 *
 * Клик по маркеру открывает поп-ап с именем + кнопкой «Открыть карточку»,
 * которая вызывает onOpenCompany(id) — родитель открывает drawer.
 */

import { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';

import type { CompanyOut } from '@/src/services/api/maps';
import type { CompanyAnalysisOut } from '@/src/services/api/reviews-ai';

import 'leaflet/dist/leaflet.css';

interface Props {
  companies: CompanyOut[];
  aiAnalyses?: Map<number, CompanyAnalysisOut>;
  onOpenCompany: (id: number) => void;
}

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

export default function MapsCompaniesMap({ companies, aiAnalyses, onOpenCompany }: Props) {
  const withCoords = useMemo(() => companies.filter(hasCoords), [companies]);
  const points = useMemo<Array<[number, number]>>(
    () => withCoords.map((c) => [c.lat, c.lng] as [number, number]),
    [withCoords],
  );

  // Дефолтный центр — Москва, если ни одной точки. После первого fit карта
  // сама перейдёт к bounds компаний; этот центр виден только в пустой выдаче.
  const initialCenter: [number, number] = points[0] ?? [55.7558, 37.6173];

  if (withCoords.length === 0) {
    return (
      <div className="rounded-v2-sm border border-[color:var(--signal-warm)]/30 bg-[var(--signal-warm-bg)] px-4 py-6 text-sm text-[color:var(--signal-warm)]">
        У этих компаний не сохранены координаты — карту построить не из чего.
        Это бывает у старых поисков (до миграции координат в API). Сделай новый
        поиск — у свежих компаний координаты есть.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-md border border-slate-200" style={{ height: 560 }}>
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
  );
}
