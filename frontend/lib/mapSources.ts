/** Человеческие названия источников карт для подписей в интерфейсе. */
export const MAP_SOURCE_LABELS: Record<string, string> = {
  yandex_maps: 'Яндекс.Карты',
  '2gis': '2GIS',
  google_maps: 'Google Maps',
};

/** «yandex_maps,2gis» → «Яндекс.Карты, 2GIS». Неизвестные значения — как есть. */
export function formatMapSources(raw: string | null | undefined): string {
  if (!raw) return '';
  return raw
    .split(/[,\s]+/)
    .filter(Boolean)
    .map((s) => MAP_SOURCE_LABELS[s.toLowerCase()] ?? s)
    .join(', ');
}
