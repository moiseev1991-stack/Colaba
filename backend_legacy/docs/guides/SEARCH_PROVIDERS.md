# Поисковые провайдеры

Проект поддерживает несколько поисковых провайдеров. Вы можете выбрать провайдер при создании поиска.

## Доступные провайдеры

### 1. DuckDuckGo (по умолчанию) ✅ Бесплатный, без API ключа

**Преимущества:**
- ✅ Полностью бесплатный
- ✅ Не требует API ключа
- ✅ Работает сразу после установки библиотеки
- ✅ Нет лимитов запросов
- ✅ Приватный поиск (не отслеживает пользователей)

**Недостатки:**
- ⚠️ Может быть медленнее чем платные API
- ⚠️ Результаты могут отличаться от Яндекс/Google

**Использование:**
```bash
# Создать поиск с DuckDuckGo (по умолчанию)
curl -X POST http://localhost:8000/api/v1/searches \
  -H 'Content-Type: application/json' \
  -d '{
    "query": "ремонт окон Москва",
    "num_results": 50,
    "search_provider": "duckduckgo"
  }'
```

**Установка:**
Библиотека уже добавлена в `requirements.txt`.

- **Локально:** `pip install -r requirements.txt`
- **Docker:** пересоберите образы backend и celery-worker (в них ставится `pip install -r requirements.txt` при сборке):
  ```bash
  docker compose up -d --build
  ```
  Без пересборки пакет `duckduckgo-search` в контейнерах не будет, и поиск через DuckDuckGo выдаст ошибку.

### 2. Яндекс XML API (опционально) ⚠️ Требует ключи

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

### 3. Яндекс HTML (бесплатный, парсинг) ✅ Новый

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

### 4. Google HTML (бесплатный, парсинг) ✅ Новый

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

### 5. SerpAPI (deprecated) ❌ Устарел

**Статус:** Устарел, не рекомендуется к использованию. Используйте DuckDuckGo, Яндекс XML или HTML провайдеры.

## Выбор провайдера

### По умолчанию

Если не указать `search_provider`, используется **DuckDuckGo** (бесплатный).

### При создании поиска

Вы можете указать провайдер в запросе:

```json
{
  "query": "ремонт окон Москва",
  "num_results": 50,
  "search_provider": "duckduckgo"  // или "yandex_xml"
}
```

### Доступные значения

- `"duckduckgo"` - DuckDuckGo (бесплатный, по умолчанию)
- `"yandex_xml"` - Яндекс XML API (требует ключи)
- `"yandex_html"` - Яндекс HTML парсинг (бесплатный, новый)
- `"google_html"` - Google HTML парсинг (бесплатный, новый)
- `"serpapi"` - SerpAPI (deprecated, не рекомендуется)

## Сравнение провайдеров

| Провайдер | Бесплатный | Требует ключи | Лимиты | Регион |
|-----------|------------|---------------|--------|--------|
| DuckDuckGo | ✅ Да | ❌ Нет | Нет | ru-RU, en-US и др. |
| Яндекс XML | ⚠️ Зависит от тарифа | ✅ Да | Да | Россия (регионы) |
| SerpAPI | ❌ Нет | ✅ Да | Да | Разные |

## Рекомендации

### Для разработки и тестирования
- Используйте **DuckDuckGo** - работает сразу, бесплатно, без настройки, низкий риск блокировок

### Для production (если нужны результаты Яндекса)
- **Приоритет 1:** Используйте **Яндекс XML API** - официальный API, стабильный, без риска блокировок
- **Приоритет 2:** Используйте **Яндекс HTML** - бесплатный, но может быть заблокирован при частых запросах
- Получите ключи на https://yandex.ru/dev/xml/ для XML API
- Настройте прокси для HTML провайдера (опционально)

### Для production (если нужны результаты Google)
- Используйте **Google HTML** - бесплатный, но высокий риск блокировок
- **Обязательно** настройте прокси для снижения риска блокировок
- Рекомендуется использовать с fallback на DuckDuckGo

### Для production (универсальное решение)
- Используйте **DuckDuckGo** как основной провайдер - бесплатно, без лимитов, работает стабильно
- Настройте fallback на Яндекс HTML или Google HTML для разнообразия результатов

## Примеры использования

### Пример 1: Поиск с DuckDuckGo (по умолчанию)

```bash
curl -X POST http://localhost:8000/api/v1/searches \
  -H 'Content-Type: application/json' \
  -d '{"query":"ремонт окон Москва","num_results":50}'
```

### Пример 2: Поиск с Яндекс XML API

```bash
curl -X POST http://localhost:8000/api/v1/searches \
  -H 'Content-Type: application/json' \
  -d '{
    "query": "ремонт окон Москва",
    "num_results": 50,
    "search_provider": "yandex_xml"
  }'
```

### Пример 3: Frontend

```typescript
// Создание поиска с DuckDuckGo
const response = await fetch('/api/v1/searches', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    query: 'ремонт окон Москва',
    num_results: 50,
    search_provider: 'duckduckgo'  // опционально, по умолчанию
  })
});
```

## Troubleshooting

### Проблема: "Библиотека duckduckgo-search не установлена"

**Решение:**
```bash
pip install duckduckgo-search
# или
pip install -r requirements.txt
```

### Проблема: DuckDuckGo возвращает мало результатов

**Причина:** DuckDuckGo может ограничивать количество результатов

**Решение:**
- Уменьшите `num_results` (например, до 20-30)
- Или используйте Яндекс XML API для большего количества результатов

### Проблема: Яндекс XML возвращает ошибку

**Решение:**
1. Проверьте ключи в `.env`
2. Проверьте лимиты вашего тарифа
3. Используйте DuckDuckGo как fallback

## Дополнительная информация

- DuckDuckGo библиотека: https://github.com/deedy5/duckduckgo_search
- Яндекс XML API: https://yandex.ru/dev/xml/
- Настройка Яндекс XML: `docs/guides/YANDEX_XML_SETUP.md`
- HTML провайдеры (детали): `docs/guides/HTML_SEARCH_PROVIDERS.md`
- **Настройки провайдеров** (прокси, ключи, «Проверить»): `docs/guides/PROVIDERS_SETTINGS.md` — страница `/settings/providers`
- **Обход капчи** (AI Vision, 2captcha, Anti-captcha): `docs/guides/CAPTCHA_BYPASS.md` — страница `/settings/captcha`