# Настройки провайдеров поиска

Единая страница и API для настройки всех поисковых провайдеров: DuckDuckGo, Yandex HTML, Google HTML, Yandex XML, SerpAPI. Конфиг хранится в БД с подстановкой значений из env при отсутствии в БД.

---

## Назначение

- **Страница «Провайдеры»** (`/settings/providers`) — формы по `settings_schema` для каждого провайдера, кнопки «Проверить» и «Сохранить».
- **API `/api/v1/providers`** — список, детали, обновление конфига, тестовый поиск.
- **`get_provider_config(provider_id, db)`** — слияние конфига из БД и переменных окружения; используется в `fetch_search_results` и при тесте провайдера.

---

## Модель БД: `SearchProviderConfig`

Один ряд на `provider_id` (глобальные настройки на инстанс).

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | int | PK |
| `provider_id` | str, unique | duckduckgo, yandex_html, google_html, yandex_xml, serpapi |
| `config` | JSONB | Ключи по `settings_schema`: region, use_proxy, proxy_url, proxy_list, use_mobile, folder_id, api_key, … |
| `updated_at` | datetime | Время обновления |

Миграция: `backend/alembic/versions/004_add_search_provider_config.py`.

---

## Реестр: `PROVIDER_REGISTRY`

Файл: `backend/app/modules/providers/registry.py`.

Для каждого провайдера:

- `id` — идентификатор
- `name` — отображаемое имя
- `type` — `free` или `paid`
- `description` — краткое описание
- `settings_schema` — массив полей: `key`, `label`, `type` (string, bool), `required`, `secret`, `description`

### Провайдеры и поля

| provider_id   | type  | Поля settings_schema |
|---------------|-------|----------------------|
| duckduckgo    | free  | region (string, optional) |
| yandex_html   | free  | use_proxy (bool), proxy_url (string), proxy_list (string), use_mobile (bool) |
| google_html   | free  | use_proxy (bool), proxy_url (string), proxy_list (string) |
| yandex_xml    | paid  | folder_id (required), api_key (required, secret) — Yandex Cloud Search API |
| serpapi       | paid  | api_key (required, secret) |

---

## Подстановка из env: `get_provider_config`

Файл: `backend/app/modules/providers/service.py`.

Логика слияния (если в `config` из БД пусто):

- **yandex_html, google_html:**  
  `use_proxy` ← `settings.USE_PROXY`;  
  `proxy_url` ← `settings.PROXY_URL`;  
  `proxy_list` ← `settings.PROXY_LIST`.

- **yandex_xml:**  
  `folder_id` ← `settings.YANDEX_XML_FOLDER_ID`;  
  `api_key` ← `settings.YANDEX_XML_KEY`.

- **serpapi:**  
  `api_key` ← `settings.SERPAPI_KEY`.

Переменные задаются в `app/core/config.py` и `.env`.

---

## API: `/api/v1/providers`

Роутер: `backend/app/modules/providers/router.py`. Префикс: `/providers`.

| Метод | Путь | Описание | Доступ |
|-------|------|----------|--------|
| GET | `/providers` | Список: реестр + config из БД (секреты замаскированы), `configured` | auth |
| GET | `/providers/{provider_id}` | Один провайдер: `settings_schema` и config (маскировано) | auth |
| PUT | `/providers/{provider_id}` | Обновить config. Секреты `***` не перезаписываются. Валидация по `settings_schema` | superuser |
| POST | `/providers/{provider_id}/test` | Тест: `fetch_search_results(provider=..., query=body.query or "кофе москва", num_results=5, enable_fallback=False, provider_config=..., db=db)`. Ответ: `{ok, result_count?} | {ok: false, error}` | superuser |

Схемы: `ProviderConfigUpdate`, `ProviderTestBody`, `ProviderTestResponse` в `backend/app/modules/providers/schemas.py`.

---

## Сервис

Файл: `backend/app/modules/providers/service.py`.

- **`get_providers_list(db)`** — для каждого элемента реестра: `get_provider_config` → `_mask_secrets` по `settings_schema`, `_is_configured` (все `required` заполнены).
- **`get_provider_detail(provider_id, db)`** — реестр + config (маскировано) + `configured`.
- **`get_provider_config(provider_id, db)`** — объединённый конфиг (БД + env), без маскирования. Используется в поиске и в `test`.
- **`upsert_provider_config(provider_id, config, db)`** — создание/обновление `SearchProviderConfig`; для полей из `secret` значение `***` или пустое не перезаписывает существующее.
- **`_validate_config(config, schema)`** — проверка по `settings_schema`; для `required` и типов (в т.ч. bool); для secret `***`/omit не считаются ошибкой.
- **`_mask_secrets(config, schema)`** — поля с `secret: true` заменяются на `***`.

---

## Использование в поиске

- `fetch_search_results(..., provider_config=..., db=...)` — `provider_config` обычно получается через `get_provider_config(provider, db)` в вызывающем коде (например в `queue/tasks.py` или в роутере `providers` при тесте).
- В HTML-провайдерах (Yandex, Google) из `provider_config` берутся `use_proxy`, `proxy_url`, `proxy_list`, `use_mobile` (только Yandex) и передаются в `get_proxy_config(proxy_overrides)` и в `fetch_with_retry` (в т.ч. `referer`, мобильный URL для Yandex).

---

## `get_proxy_config` и `fetch_with_retry` (common.py)

**`get_proxy_config(proxy_overrides: dict | None) -> dict | None`**  

Файл: `app/modules/searches/providers/common.py`. Строит конфиг прокси для httpx. Если задан `proxy_overrides` с `use_proxy` и (`proxy_url` или `proxy_list`) — используются они; иначе `settings.USE_PROXY`, `PROXY_URL`, `PROXY_LIST`. Возвращает `{"http://": url, "https://": url}` или `None`. При `proxy_list` — случайный прокси из списка; приоритет `proxy_url` над `proxy_list`.

**`fetch_with_retry(..., referer=None, proxy_overrides=None)`**  

При `referer` в заголовки добавляется `Referer`. Yandex HTML передаёт `referer="https://yandex.ru/"`, Google HTML — `referer="https://www.google.com/"`. `proxy_overrides` — `{use_proxy, proxy_url, proxy_list}` из `provider_config`; внутри вызывается `get_proxy_config(proxy_overrides)`.

**`use_mobile` (только yandex_html)**  

При `use_mobile=true` в `provider_config` используется мобильный URL поиска: `https://yandex.ru/search/touch/?text=...` вместо `https://yandex.ru/search/?text=...`. Настраивается в форме провайдера на `/settings/providers`.

---

## Frontend

- **Страница:** `frontend/app/settings/providers/page.tsx`
- **API-клиент:** `frontend/src/services/api/providers.ts` (или эквивалент для `listProviders`, `getProvider`, `updateProvider`, `testProvider`)

Поведение:

- Проверка `tokenStorage.getAccessToken()` до `load`; при отсутствии — сообщение «Войдите для доступа к настройкам провайдеров» и ссылка на `/auth/login`, `loading=false`.
- Обработка ошибок 401/403/5xx и сети через `getErrorMessage(e, 'load'|'save'|'test')`.
- Формы строятся по `settings_schema` из ответа GET `/providers` или GET `/providers/{id}`.

**Ссылки:** TopBar, `/settings` → «Провайдеры», путь `/settings/providers`.

---

## Переменные окружения (кратко)

Для подстановки в `get_provider_config`:

- `USE_PROXY`, `PROXY_URL`, `PROXY_LIST` — для yandex_html, google_html
- `YANDEX_XML_FOLDER_ID`, `YANDEX_XML_KEY` — для yandex_xml (Yandex Cloud)
- `SERPAPI_KEY` — для serpapi

См. `.env.example` и `app/core/config.py`.

---

## См. также

- [SEARCH_PROVIDERS.md](SEARCH_PROVIDERS.md) — обзор провайдеров и выбора
- [HTML_SEARCH_PROVIDERS.md](HTML_SEARCH_PROVIDERS.md) — Yandex/Google HTML, прокси, блокировки
- [YANDEX_XML_SETUP.md](YANDEX_XML_SETUP.md) — настройка Yandex XML
- [CAPTCHA_BYPASS.md](CAPTCHA_BYPASS.md) — обход капчи при использовании HTML-провайдеров (image-captcha, Yandex SmartCaptcha через 2captcha, reCAPTCHA)
