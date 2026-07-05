# Провайдеры email: Postbox / SES / Hyvor с fallback

**Добавлено:** 2026-07-05, миграция `045_email_provider_config`
**Ветка:** `feature/email-providers-fallback`

Система поддерживает 3 канала отправки email с автоматическим переходом
на резервный при сбое основного. Стоимость каждого письма задаётся в UI
и учитывается в `api_call_log` (см. `docs/guides/COST_TRACKING.md`).

## 3 провайдера

| Канал | Назначение | Цена/письмо | Доставляемость |
|---|---|---|---|
| **Yandex Cloud Postbox** (основной) | РФ-ящики | ~0.039₽ | №1 в Mail.ru/Yandex |
| **Amazon SES** (резервный) | Зарубежные | ~0.009₽ | Слабая в РФ, хорошая в Gmail |
| **Hyvor Relay** (собственный сервер) | Полный контроль IP | 0₽ (self-hosted) | Зависит от вашей репутации |

### Как работает fallback

`send_email()` перебирает включённые+настроенные провайдеры по приоритету
(0 → 1 → 2). При сбое очередного (`EmailServiceError`) переходит к
следующему без поднятия ошибки. Если все упали — `EmailServiceError`
с текстом «All email providers failed».

Пример: при сбое Postbox (538 auth error) письмо автоматически уйдёт
через SES, а если упал и SES — через Hyvor.

## UI настроек

**Страница:** `/app/settings/email-providers` (в Sidebar всех модулей).

3 карточки, каждая содержит:
- Имя + бейдж статуса («Готов к отправке» / «Включён, но не настроен» / «Отключён»).
- Чекбокс **«Включён»** — добавляет канал в fallback-цепочку.
- Кнопки ↑/↓ — приоритет (Основной/Резервный/Дополнительный).
- Поля кредентиалов (динамически из реестра): SMTP host/port/user/password,
  API keys, from_email, from_name, region.
- **Поле «Цена за письмо (₽)»** — сколько стоит одна отправка через этот канал.
- Кнопки **«Проверить»** (реальный SMTP-connect тест) и **«Сохранить»**.

Секреты маскируются как `***` в ответе; сохранение пустого значения или
`***` не перезаписывает уже сохранённое.

## Где задаётся стоимость отправки

**Прямой ответ на «где мне задавать стоимость отправки писем»:** в каждой
карточке провайдера на странице `/app/settings/email-providers` есть поле
**«Цена за письмо (₽)»**. Значение сохраняется в
`email_provider_config.cost_per_mail` и используется трекером
`api_call_log.log_call(provider_id, amount_rub=cost_per_mail)` при каждой
успешной отправке. Смотреть итог — в `/api/v1/monitor/summary?period=month`
и `/monitor/by-search/{map_search_id}` (как для всех остальных API).

## Настройка Yandex Cloud Postbox

1. Зарегистрироваться в [console.yandex.cloud](https://console.yandex.cloud).
2. Создать сервис Postbox, получить SMTP-кредентиалы.
3. Подтвердить домен отправителя (SPF/DKIM/DMARC записи появятся в консоли).
4. В `/app/settings/email-providers` → карточка Postbox:
   - SMTP host: `postbox.cloud.yandex.net` (по умолчанию)
   - Port: `587` (STARTTLS)
   - SMTP user: ваш from-email
   - SMTP password: пароль приложения Postbox
   - From email: адрес на подтверждённом домене
5. Включить чекбокс «Включён», нажать «Проверить» — должно вернуть OK.
6. Сохранить.

## Настройка Amazon SES

1. AWS Console → SES → Verified identities (подтвердить домен).
2. Создать IAM SMTP credentials.
3. В карточке SES:
   - SMTP endpoint: `email-smtp.{region}.amazonaws.com`
   - Port: 587 (STARTTLS)
   - SMTP username/password из IAM
   - Region: совпадает с endpoint
   - From email: верифицированный домен
4. Если аккаунт в sandbox — сначала вывести из sandbox (запрос в AWS).

## Настройка Hyvor Relay

Self-hosted контейнер `leadgen-hyvor-relay` уже в docker-compose.
Достаточно указать:
- API URL: `http://hyvor-relay:8000`
- API key: Bearer-токен из переменной `HYVOR_RELAY_API_KEY`
- Webhook secret: для проверки подписи (опционально)

## API эндпоинты (требуют superuser, кроме /status)

- `GET /api/v1/email/providers-settings` — все 3 провайдера.
- `GET /api/v1/email/providers-settings/status` — бейджи (для любого юзера).
- `PUT /api/v1/email/providers-settings/{id}` — сохранить конфиг.
- `PUT /api/v1/email/providers-settings/{id}/priority` — сменить приоритет.
- `POST /api/v1/email/providers-settings/{id}/test` — реальный тест подключения.

## Обратная совместимость

Старая таблица `email_config` (миграция 013/039) НЕ удалена — она хранит
IMAP-настройки (приём ответов), подпись КП, лого, brand-color. Старый
endpoит `GET /email/settings` по-прежнему работает для этих полей.

Поле `email_config.provider_type` больше не используется как селектор канала
(вместо него — fallback-цепочка из новой таблицы). Если в новой таблице все
3 провайдера отключены — `send_email` откатывается к старой логике
(`provider_type` → hyvor/smtp), чтобы не сломать существующие настройки.

## См. также

- `docs/guides/COST_TRACKING.md` — система учёта стоимости (api_call_log).
- `docs/audit-2026-07-03.md` §8 — описание фичи.
