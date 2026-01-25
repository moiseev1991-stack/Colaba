# Обход капчи

Настройки и сервис решения капчи при парсинге HTML поиска (Яндекс, Google): **image-captcha** через AI Vision, **Yandex SmartCaptcha** через 2captcha и **reCAPTCHA v2/v3** через 2captcha и Anti-captcha.

---

## Назначение

При детектировании капчи в HTML ответе поискового провайдера:

1. **Картинка (image-captcha)** — из HTML извлекается `img` капчи, скачивается в base64, отправляется в AI с `supports_vision=true`; полученный текст подставляется в форму и выполняется повторный запрос.  
   **Ограничение:** работает только если в HTML есть тег `<img>` с captcha в `src`. **Yandex SmartCaptcha** (JS/iframe) не содержит такого изображения — для неё используется отдельный решатель (см. ниже).
2. **Yandex SmartCaptcha** — из HTML извлекается `data-sitekey`; токен запрашивается у **2captcha** (`method=yandex`, `sitekey`, `pageurl`); подставляется в поле `smart-token`, `captcha-token` или `g-recaptcha-response` и форма отправляется. Требуется 2captcha в настройках (`/settings/captcha`).
3. **reCAPTCHA v2/v3** — из HTML извлекаются `data-sitekey`, `data-action` (v3); токен запрашивается у 2captcha или Anti-captcha; подставляется в `g-recaptcha-response` (или аналог) и форма отправляется.

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
3. Если `img` не найден — возвращает `None` (типично для **Yandex SmartCaptcha** и reCAPTCHA: JS/iframe, без отдельного тега изображения). В `yandex_html` в этом случае вызывается `solve_yandex_smartcaptcha`.
4. Извлекает `src`; если data-URI — base64 из `data:image/...;base64,...`; если URL — скачивает с `page_url` (относительные и `//` приводятся к абсолютным), в base64.
5. Вызывает `vision(ai_assistant_id, image_b64, "Напиши только текст с картинки...", db)` из `app.modules.ai_assistants.client`.
6. Возвращает распознанный текст или `None` при ошибке.

### reCAPTCHA: `_extract_sitekey_and_action(html_content) -> (sitekey?, action?, version)`

- Ищет `data-sitekey`, `data-action` (при наличии — v3), иначе `version="v2"`.

### reCAPTCHA: `solve_recaptcha(sitekey, pageurl, version="v2", action=None, db) -> str | None`

1. Читает `get_captcha_config_raw(db)["external_services"]`.
2. Сначала пробует **2captcha**: `in.php` (method `userrecaptcha`, для v3 — `action`, `version=v3`) → цикл `res.php` (getresult) до 24×5 сек.
3. Если нет успеха — **Anti-captcha**: `createTask` (`RecaptchaV2TaskProxyless` / `RecaptchaV3TaskProxyless`, для v3 — `pageAction`, `minScore`) → `getTaskResult` до готовности.
4. Возвращает токен или `None`.

### Yandex SmartCaptcha: `_extract_yandex_smart_sitekey(html_content) -> str | None`

- Ищет `data-sitekey` или `"sitekey": "..."` в HTML. Используется только для Yandex SmartCaptcha.

### Yandex SmartCaptcha: `_solve_2captcha_yandex_smart(api_key, sitekey, pageurl) -> str | None`

- 2captcha: `in.php` с `method=yandex`, `sitekey`, `pageurl`, `json=1`; цикл `res.php` (get) до 24×5 сек. Возвращает токен.

### Yandex SmartCaptcha: `solve_yandex_smartcaptcha(html_content, pageurl, db) -> str | None`

1. Извлекает `sitekey` через `_extract_yandex_smart_sitekey(html_content)`; если нет — возвращает `None`.
2. Читает `get_captcha_config_raw(db)["external_services"]["2captcha"]` (enabled, api_key); если не настроен — `None`.
3. Вызывает `_solve_2captcha_yandex_smart(api_key, sitekey, pageurl)`.
4. Возвращает токен или `None`. Токен подставляется в поле `smart-token`, `captcha-token` или `g-recaptcha-response` в форме капчи.

---

## Интеграция в поисковые провайдеры

### Детектирование блокировки

В `app/modules/searches/providers/common.py`:

- **`detect_blocking(response, html_content=...)`** — по коду, заголовкам и HTML выявляет блокировку и тип: `block_type in ("captcha", "recaptcha", ...)`. При `block_type=="captcha"` вызывающий код может передать `response`/HTML в провайдер для запуска solver’а.

### Yandex HTML

В `yandex_html.py`:

- При детектировании капчи/блокировки (403, 429 или `block_type=="captcha"`) и наличии `db`:
  1. Вызывается **`solve_image_captcha`** (AI Vision). При успехе — **`_try_submit_yandex_captcha_form(..., solution=...)`**: поиск формы (поле `rep`, `captcha`, `answer` и т.п.), POST с текстом; при успешном ответе `html_to_parse` берётся с новой страницы.
  2. Если `solve_image_captcha` вернул `None` (нет `<img>` капчи — типично для **Yandex SmartCaptcha**): вызывается **`solve_yandex_smartcaptcha(html, pageurl, db)`** (2captcha, `method=yandex`). При получении токена — **`_try_submit_yandex_captcha_form(..., smart_token=token)`**: поиск input/textarea с `name` в `("smart-token", "captcha-token", "g-recaptcha-response")`, подстановка токена, hidden-поля, POST.
- Аналогичная цепочка используется в **second-chance** (0 результатов, solver ещё не вызывался): сначала `solve_image_captcha`, при `None` — `solve_yandex_smartcaptcha`; при успехе — `_try_submit_yandex_captcha_form` с `solution` или `smart_token`.
- **`_try_submit_yandex_captcha_form(html, page_url, solution=None, cookies, proxy_overrides, *, smart_token=None)`** поддерживает два режима: классическая image-captcha (`solution`) и SmartCaptcha (`smart_token`).

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
  - reCAPTCHA: `method=userrecaptcha`, `googlekey`, `pageurl` (для v3 — `action`, `version=v3`).  
  - **Yandex SmartCaptcha:** `method=yandex`, `sitekey`, `pageurl`; токен подставляется в `smart-token` / `captcha-token` / `g-recaptcha-response`.
- **Anti-captcha:** `https://api.anti-captcha.com` — createTask / getTaskResult. Ключ в `external_services.anticaptcha.api_key`. Поддерживает reCAPTCHA v2/v3; для Yandex SmartCaptcha используется только 2captcha.

---

## См. также

- [AI_ASSISTANTS.md](AI_ASSISTANTS.md) — настройка AI с Vision для image-captcha
- [PROVIDERS_SETTINGS.md](PROVIDERS_SETTINGS.md) — провайдеры поиска и прокси (снижение блокировок)
- [HTML_SEARCH_PROVIDERS.md](HTML_SEARCH_PROVIDERS.md) — парсинг Yandex/Google HTML
