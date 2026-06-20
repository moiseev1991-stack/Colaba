/**
 * Утилиты для работы с телефонами лидов (РФ-кейс).
 *
 * `companies.phone` приходит из 2GIS как угодно: "+7 (495) 123-45-67",
 * "8 495 1234567", "8(495)123-45-67 доб. 100" и т.п. Для wa.me/{phone}
 * нужен чистый international digits-only (например 74951234567), иначе
 * WhatsApp Web показывает «invalid phone number» вместо чата.
 *
 * Используется в [id]/page.tsx — fallback-кнопка «WhatsApp» для строк
 * без email, и в потенциально других местах (карточка лида, drawer
 * leads/[id]).
 */

const MIN_DIGITS = 10; // 10 — без кода страны (российский без 7/8)
const MAX_DIGITS = 15; // E.164 потолок

/**
 * digits-only телефон в формате wa.me, или null если телефон битый.
 *
 * Правила:
 *  - всё, кроме цифр, отрезается
 *  - leading 8 → 7 (РФ legacy → international)
 *  - если 10 цифр и начинается на 9 (мобильный РФ без кода) → prepend 7
 *  - меньше 10 или больше 15 цифр → null (мусорный телефон)
 *  - «доб. 100» / extension часть теряется (wa.me её не понимает)
 */
export function normalizePhoneForWa(raw: string | null | undefined): string | null {
  if (!raw) return null;

  // Если в строке несколько телефонов через запятую/слэш — берём первый.
  const firstPart = raw.split(/[,;/]/)[0] ?? raw;

  let digits = firstPart.replace(/\D/g, '');
  if (!digits) return null;

  // Российский legacy: 8XXXXXXXXXX → 7XXXXXXXXXX
  if (digits.length === 11 && digits.startsWith('8')) {
    digits = '7' + digits.slice(1);
  }

  // 10-значный мобильный РФ без кода страны (начинается с 9) → +7
  if (digits.length === 10 && digits.startsWith('9')) {
    digits = '7' + digits;
  }

  if (digits.length < MIN_DIGITS || digits.length > MAX_DIGITS) return null;
  return digits;
}

/**
 * Полная wa.me-ссылка с пред-заполненным текстом, или null если
 * телефон битый/пустой.
 *
 * Text трюм'аем до 1024 символов — WhatsApp Web дальше всё равно
 * не показывает в pre-filled поле, и URL становится непомерно длинным.
 */
export function buildWhatsappLink(
  phone: string | null | undefined,
  message?: string | null,
): string | null {
  const digits = normalizePhoneForWa(phone);
  if (!digits) return null;
  const base = `https://wa.me/${digits}`;
  if (!message) return base;
  const trimmed = message.length > 1024 ? message.slice(0, 1024) : message;
  return `${base}?text=${encodeURIComponent(trimmed)}`;
}

/**
 * Человекочитаемый формат для UI (не для wa.me!).
 * Принимает digits-only из normalizePhoneForWa и возвращает
 * +7 (495) 123-45-67 для российских номеров, иначе как пришло с +.
 */
export function formatPhoneForDisplay(rawOrDigits: string | null | undefined): string {
  const digits = normalizePhoneForWa(rawOrDigits);
  if (!digits) return rawOrDigits || '';
  if (digits.length === 11 && digits.startsWith('7')) {
    return `+7 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7, 9)}-${digits.slice(9, 11)}`;
  }
  return `+${digits}`;
}
