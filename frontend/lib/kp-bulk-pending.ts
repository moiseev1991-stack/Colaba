/**
 * Передача snapshot'а выбранных company_ids между вкладками для bulk-генерации
 * КП. Используется в паре: писатель — MapsSearchResults (кнопка «Сформировать
 * КП» в выдаче), читатель — /app/leads/kp-jobs/new (setup-страница).
 *
 * Почему localStorage, а не URL:
 *   - sessionStorage у новой вкладки отдельный — не подходит.
 *   - URL-параметр ?ids=1,2,... режется длинными списками (лимит ~4-8KB) и
 *     загромождает адресную строку.
 *   - localStorage шарится между вкладками одного origin и легко чистится
 *     по TTL.
 */

const KEY_PREFIX = 'kp-bulk-pending-';
const TTL_MS = 5 * 60 * 1000; // 5 минут — больше юзеру не нужно

/** Кладёт snapshot company_ids и возвращает одноразовый ref-ключ. */
export function storeBulkKpPending(ids: number[]): string {
  const ref =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const payload = JSON.stringify({ ids, ts: Date.now() });
  try {
    localStorage.setItem(`${KEY_PREFIX}${ref}`, payload);
  } catch {
    // localStorage полный / выключен — fallback ляжет на caller'е (URL ?ids=).
  }
  return ref;
}

/** Читает snapshot по ref-ключу. Возвращает null если ключ отсутствует,
 *  невалиден или TTL вышел. */
export function readBulkKpPending(ref: string): number[] | null {
  try {
    const raw = localStorage.getItem(`${KEY_PREFIX}${ref}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { ids?: number[]; ts?: number };
    if (!parsed.ids || !Array.isArray(parsed.ids)) return null;
    if (parsed.ts && Date.now() - parsed.ts > TTL_MS) {
      localStorage.removeItem(`${KEY_PREFIX}${ref}`);
      return null;
    }
    return parsed.ids.filter((n) => Number.isFinite(n));
  } catch {
    return null;
  }
}

/** Удаляет snapshot по ref-ключу — вызывать после успешного старта job'а. */
export function clearBulkKpPending(ref: string): void {
  try {
    localStorage.removeItem(`${KEY_PREFIX}${ref}`);
  } catch {
    // ignore
  }
}
