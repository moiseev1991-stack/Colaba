# Обход капчи

Настройки и сервис решения капчи при парсинге HTML поиска (Яндекс, Google): **image-captcha** через AI Vision и **reCAPTCHA v2/v3** через 2captcha и Anti-captcha.

---

## Назначение

При детектировании капчи или reCAPTCHA в HTML ответе поискового провайдера:

1. **Картинка (image-captcha)** — из HTML извлекается `img` капчи, скачивается в base64, отправляется в AI с `supports_vision=true`; полученный текст подставляется в форму и выполняется повторный запрос.
2. **reCAPTCHA** — из HTML извлекаются `data-sitekey`, `data-action` (v3); токен запрашивается у 2captcha или Anti-captcha; подставляется в `g-recaptcha-response` (или аналог) и форма отправляется.

Если решить не удалось или сервисы не настроены, поиск завершается с ошибкой (без автоматического fallback на другой провайдер по желанию продукта).

---

## Модель БД: `CaptchaBypassConfig`

Один конфиг на инстанс (одна строка в таблице или lazy init).

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | int | PK |
| `ai_assistant_id` | int, FK→ai_assistant.id, nullable | AI-ассистент с Vision для image-captcha |
| `external_services` | JSONB | `{"2captcha": {"enabled": bool, "api_key": str}, "anticaptcha": {"enabled": bool, "api_key": str}}` |
| `updated_at` | datetime | Время обновления |

Миграция: `backend/alembic/versions/006_add_captcha_bypass_config.py`.

---

## API: `/api/v1/captcha-config`

Роутер: `backend/app/modules/captcha/router.py`. Префикс: `/captcha-config`.

| Метод | Путь | Описание | Доступ |
|-------|------|----------|--------|
| GET | `/captcha-config` | Конфиг: `ai_assistant_id`, `external_services` с замаскированными `api_key` | auth |
| PUT | `/captcha-config` | Обновить. Секреты `***` не перезаписываются | superuser |
| POST | `/captcha-config/test-2captcha` | Проверка 2captcha: запрос balance. `api_key` из body или из конфига | superuser |
| POST | `/captcha-config/test-ai` | Проверка AI Vision на 1×1 PNG. `ai_assistant_id` из body или из конфига | superuser |

Схема обновления: `CaptchaConfigUpdate` в `backend/app/modules/captcha/schemas.py`.

---

## Сервис конфига

Файл: `backend/app/modules/captcha/service.py`.

- **`get_captcha_config(db)`** — конфиг для API: `ai_assistant_id`, `external_services` с маскировкой `api_key` → `***`, `updated_at`.
- **`get_captcha_config_raw(db)`** — внутренний вариант без маскирования (для `solver` и `test-2captcha`).
- **`upsert_captcha_config(db, ai_assistant_id=..., external_services=...)`** — создать или обновить единственную запись; при слиянии `external_services` значение `***` для `api_key` не перезаписывает существующий ключ.

---

## Решатель капчи: `captcha/solver.py`

### Image-captcha: `solve_image_captcha(html_content, page_url, provider, db, cookies=..., headers=...) -> str | None`

1. Берёт `ai_assistant_id` из `get_captcha_config_raw(db)`; если нет — возвращает `None`.
2. Парсит HTML (BeautifulSoup), ищет `img` по селекторам:
   - `captcha`, `showcaptcha`, `checkcaptcha`, `simplecaptcha`, `yandex*captcha`, `google*captcha` в `src`;
   - `id`/`class` с `captcha`/`capcha`;
   - fallback: любой `img` с `captcha` или `showcaptcha` в `src`.
3. Извлекает `src`; если data-URI — base64 из `data:image/...;base64,...`; если URL — скачивает с `page_url` (относительные и `//` приводятся к абсолютным), в base64.
4. Вызывает `vision(ai_assistant_id, image_b64, "Напиши только текст с картинки...", db)` из `app.modules.ai_assistants.client`.
5. Возвращает распознанный текст или `None` при ошибке.

### reCAPTCHA: `_extract_sitekey_and_action(html_content) -> (sitekey?, action?, version)`

- Ищет `data-sitekey`, `data-action` (при наличии — v3), иначе `version="v2"`.

### reCAPTCHA: `solve_recaptcha(sitekey, pageurl, version="v2", action=None, db) -> str | None`

1. Читает `get_captcha_config_raw(db)["external_services"]`.
2. Сначала пробует **2captcha**: `in.php` (method `userrecaptcha`, для v3 — `action`, `version=v3`) → цикл `res.php` (getresult) до 24×5 сек.
3. Если нет успеха — **Anti-captcha**: `createTask` (`RecaptchaV2TaskProxyless` / `RecaptchaV3TaskProxyless`, для v3 — `pageAction`, `minScore`) → `getTaskResult` до готовности.
4. Возвращает токен или `None`.

---

## Интеграция в поисковые провайдеры

### Детектирование блокировки

В `app/modules/searches/providers/common.py`:

- **`detect_blocking(response, html_content=...)`** — по коду, заголовкам и HTML выявляет блокировку и тип: `block_type in ("captcha", "recaptcha", ...)`. При `block_type=="captcha"` вызывающий код может передать `response`/HTML в провайдер для запуска solver’а.

### Yandex HTML

В `yandex_html.py`:

- При детектировании **image-captcha** и наличии `db`: вызывается `solve_image_captcha(html, page_url, "yandex_html", db, cookies, headers)`.
- При успехе — `_try_submit_yandex_captcha_form`: поиск формы (поле `rep` и др.), POST с решением; при успешном ответе `html_to_parse` берётся с новой страницы и парсинг продолжается.

### Google HTML

В `google_html.py`:

- При **reCAPTCHA** (есть `sitekey` из `_extract_sitekey_and_action`): `solve_recaptcha(...)` → `_try_submit_google_recaptcha_form` (подстановка `g-recaptcha-response` и отправка формы).
- При **image-captcha** (нет sitekey): `solve_image_captcha(...)` → `_try_submit_google_captcha_form`.

Для работы solver’а в `fetch_search_results` и в HTML-провайдеры передаётся `db` (из `kwargs` или из `_fetch_page`).

---

## Передача `db` в поиск

- `fetch_search_results(..., db=db)` и вызовы HTML-провайдеров получают `db` через `kwargs`.
- `_fetch_page` в `yandex_html` и `google_html` принимает `db` и передаёт его в `solve_image_captcha` и `solve_recaptcha`.
- В `queue/tasks.py` и в роутере `providers` при тесте провайдера в `fetch_search_results` передаётся `db=db`.

---

## Frontend

- **Страница:** `frontend/app/settings/captcha/page.tsx`
- **API-клиент:** `frontend/src/services/api/captcha_config.ts`
- **Ссылки:** TopBar, `/settings` → «Обход капчи», путь `/settings/captcha`

Элементы: выбор AI-ассистента с Vision, блоки 2captcha и Anti-captcha (enabled, api_key), «Сохранить», «Проверить 2captcha», «Проверить AI».

---

## Внешние сервисы

- **2captcha:** `https://2captcha.com` — in.php / res.php (getbalance, getresult). Ключ в `external_services.2captcha.api_key`.
- **Anti-captcha:** `https://api.anti-captcha.com` — createTask / getTaskResult. Ключ в `external_services.anticaptcha.api_key`.

---

## См. также

- [AI_ASSISTANTS.md](AI_ASSISTANTS.md) — настройка AI с Vision для image-captcha
- [PROVIDERS_SETTINGS.md](PROVIDERS_SETTINGS.md) — провайдеры поиска и прокси (снижение блокировок)
- [HTML_SEARCH_PROVIDERS.md](HTML_SEARCH_PROVIDERS.md) — парсинг Yandex/Google HTML
