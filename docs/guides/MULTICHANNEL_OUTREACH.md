# Multichannel outreach: Email + Telegram + WhatsApp + MAX

**Добавлено:** 2026-07-05, миграция `046`
**Ветка:** `feature/multichannel-outreach`

После AI-анализа болей компании отправляем КП через несколько каналов.
Сейчас поддерживаются: **Email** (3 провайдера с fallback), **WhatsApp**
(Green-API), **Telegram** (warm-бот). **MAX** — early-stage, заложен UI
+ routing, реальная отправка ждёт выхода публичного API (Q1-Q2 2026).

## Стратегия cadence (best practice B2B)

Не «постучаться во все каналы сразу», а последовательность с эскалацией:

```
День 0:  Email #1 (КП + AI-анализ болей) — основной канал
День 3:  Email #2 (follow-up, новый аргумент)
День 5:  Telegram warm-msg (ЕСЛИ лид в боте)
День 7:  Cold call (high-intent)
День 10: Email #3 (break-up)
```

**Почему multichannel обязателен:** reply-rate cold-email упал с 5.1%
(2024) до ~3.1% (2026) — фильтры Gmail/Outlook, насыщение. Multichannel
даёт ~2x конверсию (SalesHive, Outreach 2026).

## Каналы: что и как

### Email (основной) ✅
См. `docs/guides/EMAIL_PROVIDERS.md` — 3 провайдера с авто-fallback
(Postbox/SES/Hyvor), цена за письмо в `api_call_log`.

### Telegram (warm) ✅
**Архитектура: Bot API** — официальный способ. ВАЖНО: бот НЕ может написать
пользователю первым, пока тот не нажал `/start`. Это warm-channel.

**Флоу:**
1. Юзер (лид) получает КП на email → в письме ссылка на бота.
2. Лид открывает бота, нажимает `/start`.
3. Бот присылает welcome + кнопку «📱 Поделиться контактом».
4. Лид шарит контакт → его `phone` сохраняется в `telegram_subscribers`.
5. Дальше КП-конвейер при отправке на эту компанию находит chat_id через
   `company.phone → telegram_subscribers.phone` и шлёт КП в Telegram.

**Связь с компанией:** `kp_send_service.collect_telegram_chat_ids()` ищет
по `phone` (приоритет) или `email`. Если совпадения нет — строка КП
помечается `skipped(no_telegram_chat_id)`.

**Setup:**
1. Создать бота: `@BotFather` → `/newbot` → получить токен.
2. В `/app/settings/channels` → карточка Telegram → ввести токен →
   «Проверить» (должно вернуть `@username` бота).
3. Webhook: `POST /api/v1/outreach/setup-webhook` с `{public_url: "https://your-domain.com"}`
   (нужен публичный HTTPS).
4. На dev (localhost) — webhook не работает (нет публичного URL). Тест
   только через ручной ввод chat_id в `KpSend.recipient`.

**Бесплатно** (Bot API не тарифицируется), но warm-only.

### WhatsApp (Green-API) ✅
Неофициальный WABA через Green-API. cold-DM работает (как обычный
аккаунт). Риск блокировки номера — обязателен warm-up.

⚠️ **РФ-нюанс:** Meta признана экстремистской, РКН блокирует WhatsApp
постепенно. Канал угасающий, не вкладывать как основной.

Setup: `/app/settings/channels` → карточка WhatsApp → instance_id +
api_token из [green-api.com](https://green-api.com). Тариф Developer
~1500₽/мес.

### MAX (early-stage) ⏳
Российский мессенджер от VK (март 2025). Публичного API для рассылок
пока нет (Q1-Q2 2026). Сейчас канал помечен `coming-soon`, в КП-конвейере
всегда `skipped(channel_unavailable)`. Когда API появится — добавим
`_send_one_max` по образцу telegram.

## Юридика (важно!)

**ФЗ-38 «О рекламе», ст. 18** (поправки от 29.12.2025, вступили в силу
01.09.2025):
- Массовая реклама (Telegram/WhatsApp/email) — только с **согласия**
  получателя.
- Обязательна **маркировка** (токен, erid) и **отчётность в ЕРИР**.
- Штрафы: **100 000 – 500 000 ₽** для юрлица.
- Личная переписка / service-сообщения (не реклама) — без маркировки.

**Consent:** пользователь сам нажал `/start` в боте = согласие на
получение сообщений от бота. Для cold-email/cold-WA — нужно отдельное
согласие (форма на сайте, галочка).

**Opt-out:** в каждом канале должна быть возможность отписаться.

UI выводит предупреждение о ФЗ-38 на странице `/app/settings/channels`.

## Архитектура

### Таблицы
- **`channel_config`** (singleton-per-channel) — настройки telegram/
  whatsapp/max. Конфиги в JSONB (гибко под разные схемы).
- **`telegram_subscribers`** — реестр chat_id'ов лидов, нажавших /start.
  Связь с компанией по phone/email.

### Backend-файлы
- `backend/app/modules/outreach/telegram_bot.py` — Bot API клиент
  (`send_text_message`, `get_bot_info`, `setup_webhook`).
- `backend/app/modules/outreach/telegram_router.py` — webhook handler
  (приём `/start`, `/contact`).
- `backend/app/modules/outreach/channels_service.py` + `channels_router.py`
  — CRUD настроек каналов + test.
- `backend/app/modules/outreach/kp_send_service.py` —
  `collect_telegram_chat_ids()` + ветка `channel == "telegram"`.
- `backend/app/modules/outreach/tasks.py` — `_send_one_telegram` +
  `_compose_telegram_text` (HTML, лимит 4000).

### Frontend
- `/app/settings/channels` — единая страница настроек (Email-ссылка +
  3 карточки каналов).
- Sidebar: «Каналы рассылки» в настройках всех модулей.
- `kp-jobs/[id]/page.tsx` — `CHANNEL_DEFS.telegram.working = true`,
  `eligible = !!recipient_telegram`.

## API эндпоинты (требуют superuser)

- `GET /api/v1/outreach/channels-settings` — все 3 канала.
- `GET /api/v1/outreach/channels-settings/status` — бейджи.
- `PUT /api/v1/outreach/channels-settings/{id}` — сохранить конфиг.
- `POST /api/v1/outreach/channels-settings/{id}/test` — тест подключения.
- `POST /api/v1/outreach/setup-webhook` — установить TG-webhook.
- `POST /api/v1/outreach/webhook` — приём Updates от Bot API (публичный).

## Что НЕ вошло (намеренно)

- **Telegram userbot для cold-DM** — высокий риск банов + ФЗ-38.
- **Официальный WABA (Cloud API)** — недоступен для РФ-юрлица.
- **Telegram Ads (click-to-message)** — это рекламный кабинет, не код.
- **LinkedIn** — заблокирован в РФ.
- **Cold-call / Speech Analytics** — отдельная большая задача.
- **Полная интеграция `recipient_telegram` в backend `list_job_items`** —
  пока UI проверяет поле, но backend не проставляет его автоматически в
  каждой строке (нужен JOIN с `telegram_subscribers`). TODO: добавить
  JOIN когда наберётся база подписчиков.

## См. также

- `docs/guides/EMAIL_PROVIDERS.md` — детали email-провайдеров.
- `docs/guides/COST_TRACKING.md` — учёт стоимости отправки.
- `docs/audit-2026-07-03.md` §9.
