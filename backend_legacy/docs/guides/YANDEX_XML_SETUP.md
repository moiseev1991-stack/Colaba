# Настройка «Яндекс XML» (Yandex Cloud Search API)

Провайдер **Яндекс XML** использует **Yandex Cloud Search API**: `folder_id` + API-ключ сервисного аккаунта.  
Документация: [yandex.cloud/ru/docs/search-api/quickstart](https://yandex.cloud/ru/docs/search-api/quickstart)

## 1. Yandex Cloud: каталог и сервисный аккаунт

1. Войдите в [Yandex Cloud](https://console.cloud.yandex.ru/), выберите или создайте **каталог**.
2. **folder_id** — в карточке каталога («Идентификатор»), например `b1g4eq1r2ab3cd4ef5`.
3. **Сервисный аккаунт** в этом каталоге: Управление доступом → Сервисные аккаунты → Создать. Имя — любое.
4. **Роль на каталог**: в каталоге → Права доступа → Назначить роль → выберите этот сервисный аккаунт, роль **«Редактор»** (или «Владелец», для AI/ML иногда нужна **«ai.editor»**). Без роли на каталог будет **Permission denied**.
5. **Search API**: в [консоли Yandex Cloud](https://console.cloud.yandex.ru/) проверьте, что сервис «Yandex Search API» или «Поиск» подключён/включён для этого каталога (или облака), если есть такая опция.
6. **API-ключ**: откройте сервисный аккаунт → вкладка «API-ключи» → **«Создать API-ключ»** (именно API-ключ, не «Статический ключ доступа» — тот для S3). Скопируйте ключ (формат `AQVN...`) — он показывается один раз.

## 2. Настройка в проекте

### Через Провайдеры (рекомендуется)

**Конфигурация → Провайдеры → Яндекс XML**:

- **Идентификатор каталога** — `folder_id` из п.1
- **API-ключ** — ключ сервисного аккаунта из п.1

### Через .env

```env
YANDEX_XML_FOLDER_ID=b1gxxxxxxxxxx
YANDEX_XML_KEY=AQVNxxxxxxxxxxxxxxxxxxxx
```

## 3. Перезапуск

```bash
docker compose restart backend celery-worker
```

## Как это работает

Поиск идёт через `yandex_cloud_ml_sdk`: `YCloudML(folder_id=..., auth=api_key)` → `search_api.web(search_type="ru")` → `run_deferred(query, format="xml", page=...)` → разбор XML в результаты. Параметр `search_type="ru"` — поиск по русскому интернету.

## Ошибки

- **«Yandex Cloud Search API не настроен»** — не указаны `folder_id` или `api_key` в провайдере или .env.
- **«Yandex Cloud Search API error …»** — неверный ключ, нет доступа к Search API или лимиты. Проверьте роль сервисного аккаунта и квоты в Yandex Cloud.
- **«Permission denied» (gRPC / searchapi.api.cloud.yandex.net)** — отказ в доступе. Частые причины:
  1. **Не тот тип ключа** — нужен **«Создать API-ключ»** (вкладка API-ключи у СА). Не подходят: «Статический ключ доступа» (для S3), ключ от старого `yandex.ru/search/xml`, OAuth- или IAM-токен. Ключ должен быть формата `AQVN...`.
  2. **Нет роли на каталог** — сервисному аккаунту на **этот** каталог: **«Редактор»**, **«Владелец»** или **«ai.editor»**. Каталог → Права доступа → Назначить роль → СА + роль.
  3. **folder_id не совпадает** — «Идентификатор каталога» = ID каталога, где создан СА и назначена роль (например `b1g4eq1r2ab3cd4ef5`).
  4. **Search API не включён** — в консоли Yandex Cloud для каталога/облака должен быть доступен Yandex Search API. При необходимости подключите/активируйте сервис.
  5. **«Проверить»** — использует данные из формы. Введите folder_id и API-ключ → «Проверить»; при успехе → «Сохранить».

## Ссылки

- [Quickstart Yandex Cloud Search API](https://yandex.cloud/ru/docs/search-api/quickstart)
- [yandex-cloud-ml-sdk на PyPI](https://pypi.org/project/yandex-cloud-ml-sdk/)
