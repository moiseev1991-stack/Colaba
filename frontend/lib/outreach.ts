/**
 * Отправка писем прямо из SpinLid (кампании, «Отправить КП», каналы рассылки, провайдеры email)
 * временно недоступна: сейчас SpinLid готовит письма, а отправляет их пользователь сам.
 * Интерфейс отправки показываем неактивным с пометкой «скоро»; позже его уберём или включим.
 *
 * Включить обратно — переменная NEXT_PUBLIC_OUTREACH_SENDING_ENABLED=true при сборке фронтенда.
 */
export const OUTREACH_SENDING_ENABLED = process.env.NEXT_PUBLIC_OUTREACH_SENDING_ENABLED === 'true';

export const SENDING_SOON_HINT =
  'Скоро. Отправка писем из SpinLid пока недоступна — скопируйте текст и отправьте со своей почты.';
