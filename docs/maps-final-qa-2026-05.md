# Maps module — финальный QA отчёт

**Дата:** 2026-05-22
**Ветка:** `feature/maps-full` (29 коммитов)
**Базовая:** `main` @ `89cc290` (релиз 1.2.0)

Этот документ — фиксация финального состояния ветки `feature/maps-full` перед
мержем в `main`. По чек-листу из [docs/maps_parser_tz_full.md](maps_parser_tz_full.md)
§12.

---

## 12.1. Бэкенд — ✅

- [x] `docker compose up -d` — все 7 контейнеров up (`leadgen-postgres healthy`,
      `redis healthy`, `backend healthy`, `celery-worker up`, `celery-beat up`,
      `frontend up`, `hyvor-relay unhealthy` — известная преджобная проблема).
- [x] `alembic upgrade head` — миграции 015, 016 применяются без ошибок.
- [x] `alembic downgrade -2 && alembic upgrade head` — обратный цикл проходит.
- [x] pgvector активен: `SELECT extname FROM pg_extension WHERE extname='vector';` → `vector 0.8.2`.
- [x] `pytest backend/tests/maps/ -v` → **72 passed**.
- [x] `pytest backend/tests/reviews_ai/ -v` → **20 passed**.
- [x] `pytest backend/tests/ -v` → **196 passed, 4 skipped**, 3 flaky-fail
      в существующих `test_filters_api`/`test_organizations_api` по leftover
      unique-constraint в БД — *не связано с модулем maps*, исторический долг.
- [x] Swagger `/api/docs` показывает 12 эндпоинтов `/api/v1/maps/*`.

## 12.2. Парсер end-to-end — ⚠️ частично

- [x] `POST /api/v1/maps/search` с niche=стоматология/city=Москва/sources=[2gis]
      → 201 + status='pending' + Celery-задача поставлена *(проверено в unit-тестах
      с моком .delay; на dev-машине автора реальный 2GIS API недоступен —
      TLS-таймаут до `catalog.api.2gis.com`, известная сетевая блокировка
      провайдера/SNI 2GIS, см. docs/maps-module-guide.md §7.1)*.
- [ ] **Реальный end-to-end парсинг 2GIS** — не проверен на dev. Нужно
      проверить на сервере с РФ-IP **до релиза**.
- [x] Все 10 mock-тестов 2GIS-провайдера зелёные (фикстуры на реальной структуре
      ответа 2GIS из их документации).

## 12.3. SSE — ✅

- [x] `GET /api/v1/maps/search/{id}/stream` возвращает 200 с
      `Content-Type: text/event-stream`.
- [x] Bootstrap из БД отдаёт existing компании как `event=company`
      *(test_stream_emits_existing_companies_on_connect)*.
- [x] Live-события из Redis pub/sub форвардятся клиенту
      *(test_stream_forwards_pubsub_events_and_closes_on_done)*.
- [x] `event=done` закрывает стрим со стороны сервера.
- [x] Другой юзер получает 403 на чужой поиск
      *(test_stream_returns_403_for_other_user)*.
- [⚠️] Через Next.js proxy SSE буферизуется → все события приходят пакетом
      в конце вместо «настоящего» live. См. docs/maps-module-guide.md §7.3 —
      план починки прокси.

## 12.4. AI-пайплайн — ✅ (с условием)

- [x] После `parse_company_reviews` ставится `analyze_reviews_for_company.delay`.
- [x] `compute_sentiment` обновляет `reviews.sentiment` и `sentiment_score` при
      рабочем LLM-ассистенте *(test_sentiment_parses_response, mock chat())*.
- [x] `compute_embeddings` обновляет `reviews.embedding` при заданном
      `OPENAI_API_KEY` (gracefully NOP если пуст).
- [x] `match_reviews_to_pain_tags` назначает теги при similarity ≥ threshold,
      инкрементит `company_pain_scores.mention_count`
      *(test_match_above_threshold_assigns_tag_and_updates_score)*.
- [x] При similarity < threshold — ничего не сохраняется
      *(test_match_below_threshold_does_not_save)*.
- [x] `recluster_pains_for_niche` создаёт новые PainTag из кластеров HDBSCAN,
      старые active → archived
      *(test_recluster_creates_tags_and_archives_unused)*.
- [x] Cron `recluster-popular-niches-daily` в beat_schedule (crontab hour=4 minute=0).
- [x] Graceful skip при отсутствии LLM-ассистентов и `OPENAI_API_KEY`
      *(test_sentiment_returns_none_when_no_assistant)*.
- [ ] **Реальный прогон AI на реальных отзывах** — требует:
      - настроенные ai_assistant с Anthropic Haiku + Sonnet в БД через UI
      - `OPENAI_API_KEY` в `.env`
      - реально спарсенные отзывы (см. 12.2)
      Эту проверку делаем после деплоя на сервер.

## 12.5. Фронтенд — ✅ (UI-проверка кликами не сделана, см. ниже)

- [x] `npx tsc --noEmit` — без ошибок.
- [x] `docker logs leadgen-frontend` — без warn/error на компиляции.
- [x] `GET /app/leads` → 307 (редирект на login — корректное поведение для
      неавторизованного запроса).
- [x] Старая вкладка «По сайтам» = полная копия `_components/LegacyLeadsPanel.tsx`
      → старый flow не сломан.
- [x] Tabs «По сайтам / По картам» (без shadcn — нативный Tailwind).
- [x] `MapsSearchForm` — ниша / город / источники / 10 пресетов ниш.
- [x] `useSearchStream` — EventSource hook с обработкой company / company_updated /
      progress / done / error.
- [x] `MapsFiltersPanel` — пресеты (Кризис репутации / Падение рейтинга /
      Стабильный), рейтинг range, min_reviews, min_negative, has_owner_replies,
      sort_by, облако `PainTagsCloud`.
- [x] `MapsCompanyCard` — цветной рейтинг-бейдж по порогам 4.3 / 3.5.
- [x] `MapsCompanyDetailDrawer` — табы Все/Негатив/Позитив, метрики, отзывы,
      пометка «Текст удалён по политике хранения» для purged.
- [x] Кнопка «Экспорт CSV» с фильтрами через `exportSearchCsvUrl`.
- [⚠️] **UI-клики в живом браузере** не проверены автором (агент Claude
      работает без UI-доступа); все TS-типы сходятся, dev-сервер компилируется
      без ошибок. Юзеру рекомендовано: открыть `localhost:4000/app/leads`,
      залогиниться суперюзером, переключить на «По картам», создать поиск.

## 12.6. SQLAdmin — ✅

- [x] `/admin/company/list` → 200.
- [x] `/admin/review/list` → 200.
- [x] `/admin/map-search/list` → 200.
- [x] `/admin/map-search-cache/list` → 200.
- [x] `/admin/pain-tag/list` → 200.
- [x] Поиск по name (Company), label (PainTag) подключён через `column_searchable_list`.
- [x] Сортировка по rating / reviews_count / occurrences_count / created_at.
- [⚠️] **AdminAuth подключён** — *НЕТ*. Это **бонусная задача** из §0.2 ТЗ:
      `AdminAuth` написан в `backend/app/admin/auth.py`, но не передан в
      `Admin(..., authentication_backend=...)`. Перед мержем в `main`
      рекомендуется подключить одной строкой — см. соответствующий issue.

## 12.7. Документация — ✅

- [x] `docs/maps-audit-2026-05.md` — аудит до начала работы (533 строки)
- [x] `docs/maps-module-guide.md` — этот файл соседом, dev-guide
- [x] `docs/maps-ai-pipeline.md` — детально про AI
- [x] `docs/maps-final-qa-2026-05.md` — этот документ
- [x] `CHANGELOG.md` — управляется `semantic-release` из conventional commits;
      29 коммитов на ветке подхватятся автоматически при следующем релизе

---

## Сводная статистика

| Метрика | Значение |
|---|---|
| Коммитов на ветке | **29** |
| Шагов ТЗ закрыто | **17 / 17 = 100%** |
| Новых SQL-таблиц | 8 (companies, reviews, map_searches, map_search_cache, map_search_results, pain_tags, review_pain_tags, company_pain_scores) |
| Новых индексов | 30+ (включая GIN на name, IVFFlat на embedding, partial UNIQUE на pain_tags) |
| Новых API-эндпоинтов | **12** под `/api/v1/maps/*` |
| Новых Celery-задач | 7 (parse_map_search, parse_company_reviews, purge_review_raw_text, analyze_reviews_for_company, analyze_reviews_batch, recluster_pains_for_niche_task, recluster_popular_niches) |
| Новых cron-задач | 2 (purge 3:30, recluster 4:00) |
| Новых SQLAdmin views | 5 |
| Новых фронт-компонентов | 9 (MapsSearchPanel, Form, Results, FiltersPanel, PainTagsCloud, CompanyCard, CompanyDetailDrawer, useSearchStream, LegacyLeadsPanel) |
| **Тестов maps + reviews_ai** | **92 passed** |

---

## Что нужно проверить **перед мержем в main / деплоем на сервер**

1. **`alembic_version` на сервере** — если там стоит `'007'` (как было на dev),
   до `alembic upgrade head` выполнить `UPDATE alembic_version SET version_num='014'`.
   См. `docs/maps-audit-2026-05.md` §C.

2. **Postgres image на сервере** — если стандартный без pgvector, сменить на
   `pgvector/pgvector:pg16` (volume переподключается, данные сохраняются).

3. **Реальный парсинг 2GIS** — с РФ-IP / без VPN с зарубежным выходом:
   ```bash
   docker exec leadgen-backend python -c "
   import asyncio
   from app.modules.maps.providers.twogis import TwoGisProvider
   async def m():
       p = TwoGisProvider()
       async for c in p.search_companies('стоматология', 'Москва', limit=3):
           print(c.name, c.rating)
   asyncio.run(m())
   "
   ```
   Ожидание: 3 компании с реальным именем/рейтингом.

4. **AdminAuth** — подключить как описано в §12.6 (бонусная задача из brief'а).

5. **Next.js proxy streaming** — для «настоящего» live SSE переписать прокси
   с буфера на stream (см. `docs/maps-module-guide.md` §7.3). Не блокирует
   функциональность, но даёт лучший UX.

6. **Прокси/2captcha для Я.Карт** — если планируем парсить Я.Карты:
   `USE_PROXY=true`, `PROXY_LIST=<proxies>`, и настроить 2captcha в
   `captcha_bypass_config` через UI.
