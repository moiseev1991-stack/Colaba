# Мульти-источниковые компании — план реализации

**Дата:** 2026-06-03
**Ветка:** `feat/multi-source-companies`
**ТЗ:** 2026-06-03 в Slack от Димы

## Цель

Сейчас одна и та же компания (например, «Глобал Дент») присутствует в БД дважды: одна
строка `companies` с `source='2gis'`, вторая с `source='yandex_maps'`. Контакты разные —
их нельзя смерджить в одну запись (потеряем данные одного источника).

Цель — одна логическая компания (`companies`), у неё N **источниковых профилей**
(`company_sources`). Отзывы и контакты привязаны к источниковому профилю.

## Фазы (каждая мержится отдельно)

### Phase 1 — структура + аддитивная миграция данных ← **этот коммит**

- Alembic 028: создать `company_sources` и `company_contacts`.
- Backfill: для каждой существующей `companies`-записи создать ровно один
  `company_sources` с её данными (rating, reviews_count, source, external_id),
  и `company_contacts` записями из `companies.phone / website / emails / contacts_extra`.
- **Существующие поля `companies.*` остаются** — старый код продолжает работать.
- `reviews.company_id` НЕ меняется в Phase 1 (FK на companies остаётся).
- Добавить опциональный `reviews.company_source_id` (nullable, заполним в Phase 2).
- Не трогать ни одного существующего API endpoint / провайдер парсинга / UI.

**Результат Phase 1:** прод работает как раньше. Структура готова к дедупу.

### Phase 2 — дедупликация существующих 2GIS+Я.Карты пар

- Скрипт находит пары «(2gis-компания, yandex_maps-компания)» которые на самом деле одна
  компания. Якоря: нормализованный телефон / координаты в радиусе 100м / совпадение
  нормализованного названия в одном городе.
- Для каждого матча: переподцепить `company_sources` младшей записи к старшей `company_id`,
  переподцепить `reviews.company_id` и `reviews.company_source_id`, удалить
  дубликат-`companies` запись.
- Скрипт идемпотентен, dry-run + apply режимы.

### Phase 3 — дедупликация при парсинге (новые компании)

- В save-функции компании: перед `INSERT` искать в `company_sources` по якорям —
  если матч с уверенностью > threshold, прикрепить новый источниковый профиль
  к существующему `company_id`. Иначе — создать новую `companies` + `company_sources`.
- `match_confidence` в `company_sources` для ручного аудита.

### Phase 4 — агрегация для шапки + API

- При изменении `company_sources` (вставке/обновлении rating/reviews_count) —
  пересчитывать агрегаты в `companies` (`canonical_rating`, `total_reviews`,
  `total_negative`, `sources` массив). Триггер или background-таска.
- API возвращает компанию с массивом `sources[]` (каждый со своими метриками и
  contacts[]). Endpoint отзывов поддерживает фильтр `?source=2gis|yandex_maps`.
- Существующие плоские поля `companies.rating/.reviews_count/.phone/.website` сохраняются
  как denormalized для текущих фильтров (обратная совместимость).

### Phase 5 — Frontend

- В списке: мульти-бейдж источников (`2GIS + Я.Карты`).
- Drawer: вкладки отзывов «Все / 2GIS / Я.Карты», раздельные контактные блоки.
- Метрики по источникам (мини-таблица в drawer).
- Темная тема для новых блоков.

### Phase 6 — pain_tags per source (опционально)

- Pain-теги по объединённым отзывам остаются, но в цитатах виден source.
- Опц. тоггл «боли только по 2GIS».

## Не делать (из ТЗ §5)

- Не схлопывать контакты между источниками — показывать раздельно.
- Не перетирать данные одного источника другим.
- Не ломать выдачу для компаний с одним источником (пустые вкладки не показывать).
- Не менять стек.

## Бэкап перед миграцией

Перед Phase 1 на проде:
```bash
docker exec colaba-postgres-1 pg_dump -U leadgen_user -d leadgen_db -Fc -f /tmp/colaba-pre-multisource.dump
docker cp colaba-postgres-1:/tmp/colaba-pre-multisource.dump /opt/colaba/backups/
```
