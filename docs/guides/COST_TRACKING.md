# Учёт стоимости внешних API-вызовов (Cost Tracking)

**Добавлено:** 2026-07-05, миграция `044_api_call_log`
**Ветку фичи:** `feature/cost-tracking-api-log`

Система логирует каждый вызов внешнего платного API в таблицу `api_call_log`
и считает его стоимость в рублях по статичной таблице цен. Цель — видеть,
сколько стоил любой запрос пользователя (поиск лидов, AI-анализ, рассылка).

## Что трекается

| Провайдер | Тип | Где вызывается | Цена (₽) |
|---|---|---|---|
| `2gis` | per-request | `maps/providers/twogis.py` `_request()` | 0 (free tier) |
| `serpapi` (Google Maps) | per-request | `maps/providers/google_maps.py` `_request()` | 0.91 / вызов |
| `dadata` | per-request | `maps/legal_enrich.py` `_suggest()` | 0 (free tier) |
| `openai` | per-token | `ai_assistants/client.py` `_chat_openai`/`_vision_openai` | 0.0137/1K in, 0.0546/1K out |
| `anthropic` | per-token | `ai_assistants/client.py` `_chat_anthropic` | 0.073/1K in, 0.364/1K out |
| `openai_emb` | per-token | `reviews_ai/llm.py` `embed_texts()` | 0.0018/1K |
| `ollama`/`groq`/`together`/`openrouter`/`deepseek`/`xai` | per-token | `ai_assistants/client.py` `_chat_openai_compatible` | по cfg провайдера |
| `2captcha` | per-request | `captcha/solver.py` (опц., в этом заходе не интегрирован) | 0.09 |
| `anticaptcha` | per-request | (опц.) | 0.06 |
| `hyvor` | per-request | `email/service.py` `_send_via_hyvor` | 0 (self-hosted) |
| `smtp` | per-request | `email/service.py` `_send_via_smtp` | 0.039 (Yandex Postbox) |
| `yookassa` | commission | (опц.) | 2.8% |

Полный список цен — в `backend/app/core/provider_pricing.py`. **Цены
обновляются вручную** при изменении тарифов: правьте `PROVIDER_PRICING`
и обновляйте `LAST_UPDATED` в шапке файла.

## Архитектура

```
api_call_log (table, per-call)  ←  app.core.api_tracker.log_call()
        ↑                                 ↑
        |                                 |
   monitor/router.py              точки вызова внешних API
   (читает последние N,                  (_request / chat / _suggest / _send_via_*)
   summary, by-search)                   ↑
                                         |
                                  contextvars:
                                  current_user_id / map_search_id / company_id
                                  (set_call_context в celery tasks + middleware)
```

### Контекст вызова

Все записи автоматически привязываются к контексту:
- `user_id` — прокинутой через FastAPI middleware (читает Bearer-токен)
  или через `set_call_context(user_id=...)` в Celery.
- `map_search_id` — выставляется в `tasks.py: _parse_map_search_async`
  в начале поиска лидов.
- `company_id` — в `_parse_company_reviews_async` и других company-tasks.

Вне контекста (CLI, ручной вызов) — все три `null`, но вызов всё равно
логируется с `provider` и `cost_rub`.

### Fire-and-forget

`log_call()` пишет в собственную short-lived сессию (изолированную от
бизнес-транзакции). Любая ошибка записи логируется `warning` и **не
валирует бизнес-логику** — трекер никогда не должен уронить поиск лидов
или AI-анализ.

## API Endpoints (требуют авторизации)

- `GET /api/v1/monitor/requests?limit=50` — последние N вызовов (новые сверху).
- `GET /api/v1/monitor/summary?period=day|week|month|all` — агрегаты
  за период + breakdown по провайдерам.
- `GET /api/v1/monitor/by-search/{map_search_id}` — стоимость конкретного
  поиска (ответ на «сколько стоил этот запрос»).

Пример ответа `/summary`:
```json
{
  "period": "day",
  "total_cost_rub": 1.18,
  "total_calls": 7,
  "ok_calls": 6,
  "failed_calls": 1,
  "tokens": {"prompt_total": 7300, "completion_total": 500},
  "by_provider": [
    {"provider": "serpapi", "calls": 1, "cost_rub": 0.91, "ok_pct": 100.0},
    {"provider": "anthropic", "calls": 1, "cost_rub": 0.13, "ok_pct": 100.0}
  ]
}
```

## Настройки (env)

| Переменная | Дефолт | Описание |
|---|---|---|
| `EXTERNAL_API_TRACKING_ENABLED` | `True` | Включить/выключить логирование. |
| `EXTERNAL_API_TRACKING_SAMPLE_RATE` | `1.0` | Доля вызовов для логирования (0.0–1.0). |

## Как добавить нового провайдера

1. Добавить запись в `PROVIDER_PRICING` в `backend/app/core/provider_pricing.py`.
2. В точке вызова (где `httpx.get`/`client.post`) добавить:
   ```python
   from app.core.api_tracker import log_call
   await log_call(
       "new_provider", endpoint_url,
       method="POST", http_status=r.status_code,
       ok=r.is_success, latency_ms=latency_ms,
   )
   ```
3. Для per-token (LLM) — передать `prompt_tokens`/`completion_tokens`.

## Frontend

`frontend/components/RequestMonitorTable.tsx` показывает таблицу с колонками:
Provider, Endpoint, Method, Time, Cost (₽), OK. Auto-refresh каждые 4 сек.

## Что НЕ входит (MVP)

- Per-user квоты и лимиты по тарифам.
- Энфорсмент (блокировка при превышении).
- Связь платежей YooKassa с пользователем.
- TTL-чистка старых записей (таблица растёт; партиционирование отложено).
- Динамические цены от провайдеров.
- Интеграция `2captcha`/`anticaptcha`/`yookassa` в трекер (цены в таблице
  есть, но точки вызова не обёрнуты — добавить при необходимости).
