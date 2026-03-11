# Поисковые провайдеры

Проект поддерживает несколько поисковых провайдеров. Вы можете выбрать провайдер при создании поиска.

## Доступные провайдеры

### 1. Яндекс XML API (по умолчанию) ⚠️ Требует ключи

**Преимущества:**
- ✅ Официальный API Яндекса
- ✅ Результаты из Яндекс поиска
- ✅ Поддержка регионов России

**Недостатки:**
- ❌ Требует регистрацию и API ключи
- ❌ Может быть платным (зависит от тарифа)
- ❌ Ограничения по количеству запросов

**Использование:**
1. Получите ключи на https://yandex.ru/dev/xml/
2. Добавьте в `.env`:
   ```env
   YANDEX_XML_FOLDER_ID=идентификатор_каталога
   YANDEX_XML_KEY=API-ключ_сервисного_аккаунта
   ```
3. Создайте поиск:
   ```bash
   curl -X POST http://localhost:8000/api/v1/searches \
     -H 'Content-Type: application/json' \
     -d '{
       "query": "ремонт окон Москва",
       "num_results": 50,
       "search_provider": "yandex_xml"
     }'
   ```

**Подробнее:** См. `docs/guides/YANDEX_XML_SETUP.md`

### 2. Яндекс HTML (бесплатный, парсинг) ✅

**Преимущества:**
- ✅ Полностью бесплатный
- ✅ Не требует API ключа
- ✅ Результаты из обычного поиска Яндекса
- ✅ Поддержка регионов России

**Недостатки:**
- ⚠️ Парсинг HTML (может сломаться при изменении структуры страницы)
- ⚠️ Возможны блокировки при частых запросах
- ⚠️ Может показывать капчу

**Использование:**
```bash
curl -X POST http://localhost:8000/api/v1/searches \
  -H 'Content-Type: application/json' \
  -d '{
    "query": "ремонт окон Москва",
    "num_results": 50,
    "search_provider": "yandex_html"
  }'
```

**Защита от блокировок:**
- Автоматическая ротация User-Agent
- Случайные задержки между запросами
- Поддержка прокси и use_mobile (настройка на `/settings/providers` или через .env)
- Обход капчи (настройка на `/settings/captcha`): image-captcha через AI Vision; **Yandex SmartCaptcha** через 2captcha (`method=yandex`); reCAPTCHA через 2captcha или Anti-captcha. См. [CAPTCHA_BYPASS.md](CAPTCHA_BYPASS.md)
- Автоматический fallback на другие провайдеры при блокировке

**Настройка:** конфиг (прокси, use_mobile) — через страницу [Настройки провайдеров](PROVIDERS_SETTINGS.md) (`/settings/providers`) или переменные USE_PROXY, PROXY_URL, PROXY_LIST в .env.

### 3. Google HTML (бесплатный, парсинг) ✅

**Преимущества:**
- ✅ Полностью бесплатный
- ✅ Не требует API ключа
- ✅ Результаты из обычного поиска Google
- ✅ Поддержка разных языков и стран

**Недостатки:**
- ⚠️ Парсинг HTML (может сломаться при изменении структуры страницы)
- ⚠️ Высокий риск блокировок (Google активно блокирует ботов)
- ⚠️ Часто показывает капчу

**Использование:**
```bash
curl -X POST http://localhost:8000/api/v1/searches \
  -H 'Content-Type: application/json' \
  -d '{
    "query": "ремонт окон Москва",
    "num_results": 50,
    "search_provider": "google_html"
  }'
```

**Защита от блокировок:**
- Автоматическая ротация User-Agent
- Случайные задержки между запросами
- Поддержка прокси (рекомендуется для Google; настройка на `/settings/providers` или .env)
- Обход капчи: AI Vision, 2captcha, Anti-captcha (настройка на `/settings/captcha`). См. [CAPTCHA_BYPASS.md](CAPTCHA_BYPASS.md)
- Автоматический fallback на другие провайдеры при блокировке

**Настройка:** конфиг (прокси) — через [Настройки провайдеров](PROVIDERS_SETTINGS.md) (`/settings/providers`) или USE_PROXY, PROXY_URL, PROXY_LIST в .env.

### 4. SerpAPI (deprecated) ❌ Устарел

**Статус:** Устарел, не рекомендуется. Используйте Яндекс XML или HTML провайдеры.

**Примечание:** DuckDuckGo удалён из реестра провайдеров и из UI; в интерфейсе и API по умолчанию используется **Yandex XML**.

## Выбор провайдера

### По умолчанию

Если не указать `search_provider`, используется **yandex_xml** (Яндекс XML API). Настройте ключи в `/settings/providers` или в `.env` (см. [YANDEX_XML_SETUP.md](YANDEX_XML_SETUP.md)).

### При создании поиска

Укажите провайдер в запросе:

```json
{
  "query": "ремонт окон Москва",
  "num_results": 50,
  "search_provider": "yandex_xml"
}
```

### Доступные значения

- `"yandex_xml"` — Яндекс XML API (по умолчанию, требует ключи)
- `"yandex_html"` — Яндекс HTML парсинг (бесплатный)
- `"google_html"` — Google HTML парсинг (бесплатный)
- `"serpapi"` — SerpAPI (deprecated)

## Сравнение провайдеров

| Провайдер     | Бесплатный | Требует ключи | Лимиты | Регион           |
|---------------|------------|---------------|--------|------------------|
| Яндекс XML    | ⚠️ Зависит от тарифа | ✅ Да | Да     | Россия (регионы) |
| Яндекс HTML   | ✅ Да      | ❌ Нет        | Риск блокировок | Россия |
| Google HTML   | ✅ Да      | ❌ Нет        | Риск блокировок | Разные  |

## Рекомендации

### Для production (результаты Яндекса)
- **Приоритет 1:** **Яндекс XML API** — по умолчанию, стабильный, без риска блокировок. Настройте ключи в [YANDEX_XML_SETUP.md](YANDEX_XML_SETUP.md).
- **Приоритет 2:** **Яндекс HTML** — бесплатный, возможны блокировки; настройте прокси на `/settings/providers`.

### Для production (результаты Google)
- **Google HTML** — бесплатный, высокий риск блокировок; обязательно настройте прокси.

## Примеры использования

### Пример 1: Поиск по умолчанию (Yandex XML)

```bash
curl -X POST http://localhost:8000/api/v1/searches \
  -H 'Content-Type: application/json' \
  -d '{"query":"ремонт окон Москва","num_results":50}'
```

### Пример 2: Поиск с Яндекс HTML

```bash
curl -X POST http://localhost:8000/api/v1/searches \
  -H 'Content-Type: application/json' \
  -d '{
    "query": "ремонт окон Москва",
    "num_results": 50,
    "search_provider": "yandex_html"
  }'
```

### Пример 3: Frontend

```typescript
const response = await fetch('/api/v1/searches', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    query: 'ремонт окон Москва',
    num_results: 50,
    search_provider: 'yandex_xml'  // по умолчанию, можно не указывать
  })
});
```

## Troubleshooting

### Проблема: Яндекс XML возвращает ошибку

**Решение:**
1. Проверьте ключи в `/settings/providers` или в `.env` (YANDEX_XML_FOLDER_ID, YANDEX_XML_KEY).
2. Проверьте лимиты тарифа на https://yandex.ru/dev/xml/
3. Для бесплатного варианта без ключей используйте `yandex_html` (с прокси при необходимости)

## Дополнительная информация

- Яндекс XML API: https://yandex.ru/dev/xml/
- Настройка Яндекс XML: `docs/guides/YANDEX_XML_SETUP.md`
- HTML провайдеры (детали): `docs/guides/HTML_SEARCH_PROVIDERS.md`
- **Настройки провайдеров** (прокси, ключи, «Проверить»): `docs/guides/PROVIDERS_SETTINGS.md` — страница `/settings/providers`
- **Обход капчи** (AI Vision, 2captcha, Anti-captcha): `docs/guides/CAPTCHA_BYPASS.md` — страница `/settings/captcha`