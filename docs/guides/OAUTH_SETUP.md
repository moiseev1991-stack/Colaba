# Инструкция: включение входа через VK ID / Яндекс / Telegram + SMTP

> Код полностью готов (PR #269, 18.09). Осталось получить ключи и выставить
> переменные окружения. Время: ~30–40 минут на всё.

## Где что живёт (важно!)

| Слой                                     | Что настраиваем                                                  | Где                                                     |
| ---------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------- |
| Бэкенд-стек (colaba)                     | `VK_CLIENT_*`, `YANDEX_CLIENT_*`, `OAUTH_FRONTEND_URL`, `SMTP_*` | файл `/opt/colaba/.env` на сервере (SSH `spinlid-prod`) |
| Фронтенд (прода обслуживает **Coolify**) | `NEXT_PUBLIC_*` флаги                                            | Настройки приложения Coolify → Environment variables    |

`NEXT_PUBLIC_*` встраиваются в бандл **при сборке** — менять их в Coolify
обязательно с последующим Redeploy, недостаточно просто сохранить.

---

## 1. VK ID (главная кнопка, ~10 мин)

1. Зайди на **https://id.vk.ru/business/** под своим VK-аккаунтом.
2. «Создать приложение» → тип **Веб-сайт** → название `SpinLid`.
3. В настройках приложения:
   - **Redirect URI**: `https://www.spinlid.ru/auth/callback`
   - Доступы/скоупы: базовые (имя, email) — код запрашивает сам.
4. Скопируй:
   - **ID приложения** → `VK_CLIENT_ID`
   - **Секрет (service token / защищённый ключ)** → `VK_CLIENT_SECRET`
5. Если VK попросит подтвердить домен — добавь выданную TXT-запись в DNS
   `spinlid.ru` (у твоего DNS-провайдера).

## 2. Яндекс ID (~7 мин)

1. **https://oauth.yandex.ru/client/new** (аккаунт Яндекса).
2. Название `SpinLid`. Платформа: **Веб-сервисы**:
   - Redirect URI: `https://www.spinlid.ru/auth/callback`
3. Доступы: отметь **«Логин пользователя (login)»** и
   **«Адрес электронной почты (email)»** из блока «Яндекс ID» / «Паспорт».
4. Нажми «Создать приложение» → скопируй **ClientID** и **Client secret**.
5. Проверка домена: если Яндекс потребует — та же схема, TXT-запись в DNS
   (обычно требуется только для нестандартных скоупов).

## 3. Telegram Login (~5 мин)

Нужен бот. Можно существующий (тот, что уже в `TELEGRAM_BOT_TOKEN`)
или отдельный — лучше отдельный, чтобы не смешивать с рассылками:

1. В Telegram: **@BotFather** → `/newbot` → имя `SpinLid`, username
   например `spinlid_auth_bot` → получишь токен.
2. Там же: `/mybots` → выбрать бота → **Bot Settings → Domain Setup** →
   добавить домен: `spinlid.ru` (обязателен для Login Widget).
3. Итог:
   - токен бота → `TELEGRAM_BOT_TOKEN` в `/opt/colaba/.env` (если бот
     новый; старый оставить как есть);
   - username бота **без @** → `NEXT_PUBLIC_TELEGRAM_LOGIN_BOT` в Coolify.

## 4. SMTP — письма сброса пароля и верификации (~10 мин)

Подойдёт любая почта на твоём домене. Проще всего:

**Вариант А — Яндекс Почта для домена** (бесплатно до 5 ящиков):

1. https://360.yandex.ru → подключить домен `spinlid.ru` (подтверждение
   DNS-записью, 10–30 мин на обновление).
2. Создай ящик `noreply@spinlid.ru`.
3. В настройках ящика включи «Пароли приложений» (без 2FA — сначала
   включи 2FA → создай пароль приложения для «Почты»).
4. Переменные:
   ```
   SMTP_HOST=smtp.yandex.ru
   SMTP_PORT=465
   SMTP_USER=noreply@spinlid.ru
   SMTP_PASSWORD=<пароль приложения>
   ```

**Вариант Б — Timeweb/другой хостер почты** — аналогично, SMTP-данные
смотри в панели хостера.

---

## 5. Применение настроек

### 5.1 Бэкенд: `/opt/colaba/.env` (по SSH)

```
ssh spinlid-prod
nano /opt/colaba/.env
```

Добавь в конец (значения из шагов 1–4):

```
VK_CLIENT_ID=...
VK_CLIENT_SECRET=...
YANDEX_CLIENT_ID=...
YANDEX_CLIENT_SECRET=...
OAUTH_FRONTEND_URL=https://www.spinlid.ru
SMTP_HOST=smtp.yandex.ru
SMTP_PORT=465
SMTP_USER=noreply@spinlid.ru
SMTP_PASSWORD=...
```

Затем (аккуратно, на сервере 2 ядра):

```
cd /opt/colaba
docker compose -f docker-compose.prod.yml up -d backend
```

(Забрать изменения `.env` можно и деплоем из GitHub — следующий мерж
подтянет всё сам.)

### 5.2 Фронтенд: Coolify

1. Открой Coolify: `http://88.210.53.183:8000` → проект → приложение
   фронтенда → **Environment variables**.
2. Добавь:
   ```
   NEXT_PUBLIC_OAUTH_ENABLED=true
   NEXT_PUBLIC_OAUTH_VK=true
   NEXT_PUBLIC_OAUTH_YANDEX=true
   NEXT_PUBLIC_TELEGRAM_LOGIN_BOT=spinlid_auth_bot
   ```
3. **Redeploy** (кнопка «Deploy») — фронт пересоберётся с новыми флагами.

Включай провайдеров постепенно: можно начать с одного VK
(`NEXT_PUBLIC_OAUTH_VK=true`, остальные false).

---

## 6. Проверка (2 мин)

1. Открой **https://www.spinlid.ru/auth/login** в режиме инкогнито —
   должны появиться кнопки «Войти через VK ID» / «Войти через Яндекс» /
   Telegram-кнопка.
2. Кликни каждую → разрешение → редирект в кабинет `/app/leads`.
3. Сброс пароля: https://www.spinlid.ru/auth/forgot-password → на твой
   реальный email должно прийти письмо со ссылкой.

Если что-то не работает — проверь логи:

```
ssh spinlid-prod 'docker logs colaba-backend-1 --since 10m | grep -i oauth'
```

## 7. Юридический момент (152-ФЗ)

После включения соцвходов обнови Политику конфиденциальности
(`/policy` на сайте): добавь пункт «Аутентификация через внешние
ID-сервисы (VK ID, Яндекс ID, Telegram)» с перечнем передаваемых данных
(email, имя, avatar) и ссылкой на политики провайдеров. Согласие на
обработку ПДн уже берётся при регистрации — достаточно дополнить текст.

---

## Шпаргалка: где что взять

| Что                            | Где взять                      | Куда положить          |
| ------------------------------ | ------------------------------ | ---------------------- |
| VK_CLIENT_ID/SECRET            | id.vk.ru/business → приложение | `/opt/colaba/.env`     |
| YANDEX_CLIENT_ID/SECRET        | oauth.yandex.ru → приложение   | `/opt/colaba/.env`     |
| TELEGRAM_BOT_TOKEN             | @BotFather → /newbot           | `/opt/colaba/.env`     |
| NEXT_PUBLIC_TELEGRAM_LOGIN_BOT | username бота без @            | Coolify env            |
| NEXT_PUBLIC_OAUTH_*            | —                              | Coolify env + Redeploy |
| SMTP_*                         | Яндекс 360 / хостер            | `/opt/colaba/.env`     |
