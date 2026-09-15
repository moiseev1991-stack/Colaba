/** Понятные тексты ошибок входа и регистрации — без технических деталей вроде «запустите backend». */

type AuthAction = 'login' | 'register';

const KNOWN_DETAILS: Array<[RegExp, string]> = [
  [/already registered|already exists/i, 'Этот email уже зарегистрирован — войдите в аккаунт.'],
  [/incorrect email or password|invalid credentials|not authenticated/i, 'Неверный email или пароль.'],
  [/inactive|disabled/i, 'Аккаунт отключён. Напишите в поддержку: support@spinlid.ru.'],
];

export function authErrorMessage(err: unknown, action: AuthAction): string {
  const e = err as {
    code?: string;
    message?: string;
    response?: { status?: number; data?: { detail?: unknown } };
  };
  if (e?.code === 'ERR_NETWORK' || e?.message?.includes('Network Error')) {
    return 'Сервис временно недоступен. Попробуйте через минуту.';
  }

  const status = e?.response?.status;
  const detail = e?.response?.data?.detail;
  if (typeof detail === 'string') {
    for (const [re, text] of KNOWN_DETAILS) if (re.test(detail)) return text;
    // Сообщения бэкенда на русском написаны для пользователя — показываем как есть.
    if (/[а-яё]/i.test(detail)) return detail;
  }

  if (status === 429) return 'Слишком много попыток. Подождите минуту и попробуйте снова.';
  if (status === 401 || (action === 'login' && status === 400)) return 'Неверный email или пароль.';
  if (status === 422) {
    return action === 'register'
      ? 'Проверьте email и пароль: пароль — минимум 8 символов.'
      : 'Проверьте email и пароль.';
  }
  if (status && status >= 500) return 'Ошибка на сервере. Попробуйте ещё раз через минуту.';
  return action === 'register'
    ? 'Не получилось зарегистрироваться. Попробуйте ещё раз.'
    : 'Не получилось войти. Попробуйте ещё раз.';
}
