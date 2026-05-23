# Reviews AI pipeline

**Дата:** 2026-05-22

AI-часть модуля `maps` — автоматическая классификация «болей» клиентов из
отзывов. Цель: вместо плоского списка компаний показать **«вот компания, и вот
3 вещи, на которые клиенты жалуются»**, чтобы основатель Colaba (или его
клиент) мог написать целевое cold-письмо с конкретным поводом.

Не путать с sentiment-классификацией — sentiment отвечает только на вопрос
«позитив/негатив», pain-теги отвечают «о чём именно жалуются».

---

## 1. Жизненный цикл отзыва

```
parse_company_reviews (Celery, queue=maps_reviews)
   │
   │  save_reviews_batch:
   │     sentiment = derive_sentiment_from_rating(rating)
   │     embedding = NULL
   │     ai_processed_at = NULL
   │
   ▼
analyze_reviews_for_company.delay(company_id)
   │  ставится в конец parse_company_reviews, queue=maps_ai
   │
   ▼
process_reviews_pipeline(db, review_ids):
   │
   ├─ compute_sentiment        → LLM (Claude Haiku) → reviews.sentiment + score
   │                              fallback при недоступном LLM: derived остаётся
   │
   ├─ compute_embeddings       → OpenAI text-embedding-3-small → reviews.embedding
   │                              fallback при пустом OPENAI_API_KEY: NULL
   │
   ├─ match_reviews_to_pain_tags
   │     для каждого review с embedding:
   │        cosine_similarity(review.embedding, pain_tag.centroid) >= 0.78
   │        ↓
   │        UPSERT review_pain_tags(similarity)
   │        INC   company_pain_scores.mention_count
   │
   └─ update reviews.ai_processed_at = NOW

(параллельно, раз в сутки в 4:00)
recluster_popular_niches (Celery cron, queue=maps_ai)
   │  top-30 (niche, city) комбинаций по reviews_count
   │
   ▼
recluster_pains_for_niche_task.delay(niche, city)
   │  HDBSCAN(min_cluster_size=8) по всем embeddings ниши+города
   │  для каждого кластера:
   │     - centroid = mean(embeddings)
   │     - sample до 10 текстов
   │     - LLM-naming (Claude Sonnet) → {label, description}
   │     - UPSERT PainTag(centroid, examples)
   │  старые active PainTag этой ниши, не в новом наборе → status='archived'
   │  очистка review_pain_tags / company_pain_scores этой ниши
   │  заново match_reviews_to_pain_tags(все_отзывы_ниши)
```

---

## 2. Промпты

### 2.1. Sentiment

Из `backend/app/modules/reviews_ai/prompts.py`:

```
Определи тональность каждого отзыва из списка.

Верни ТОЛЬКО JSON-массив, без пояснений и markdown-обёрток:
[{"id": <review_id>, "sentiment": "positive|negative|neutral", "score": <0.0-1.0>}, ...]

score — уверенность модели в классификации (1.0 — полная уверенность).

Отзывы:
{reviews_json}
```

`reviews_json` — массив `[{"id": int, "text": str}]`, текст обрезается до 1500
символов (LLM-bill control).

### 2.2. Cluster naming

```
Тебе дано {count} отзывов клиентов о бизнесах в нише "{niche}".
Эти отзывы попали в один кластер по семантической близости.

Определи общую тему отзывов одним коротким label (2-5 слов на русском)
и опиши её одним предложением.

Верни ТОЛЬКО JSON, без пояснений и markdown:
{
  "label": "...",
  "description": "..."
}

Отзывы:
{reviews_sample}
```

`reviews_sample` — до 10 текстов из кластера, каждый обрезан до 300 символов.

---

## 3. Threshold cosine similarity

`REVIEWS_AI_PAIN_MATCH_THRESHOLD=0.78` (env). Эмпирический — для
`text-embedding-3-small` пороги:

- `0.85+` — почти идентичные тексты (мало совпадений, узкие теги)
- `0.78–0.85` — семантически похожие, разные слова (рекомендуемый)
- `0.70–0.78` — широко (много false positives)
- `<0.70` — почти всё подряд

Можно настроить отдельно для нишы через будущий `pain_tags.threshold_override`
(пока в схеме нет — нужно если у разных ниш разное распределение).

---

## 4. HDBSCAN параметры

В `recluster_pains_for_niche`:

- `min_cluster_size=settings.REVIEWS_AI_MIN_CLUSTER_SIZE` (default 8) — кластер
  меньшего размера считается шумом. Снижение даёт больше теги, повышение —
  только «массовые» темы.
- `min_samples=4` — насколько «плотным» должен быть кластер.
- `metric='euclidean'` — для нормализованных embeddings эквивалентно cosine.
- `cluster_selection_method='eom'` — Excess of Mass; обычно даёт более
  стабильные кластеры чем 'leaf'.

---

## 5. Стоимость (порядок)

OpenAI tarrifs 2026-04 (subject to change):

| Операция | Модель | Цена | На один отзыв |
|---|---|---|---|
| Embedding | `text-embedding-3-small` | $0.02 / 1M токенов | ~10 токенов → $0.0000002 = **~0.001 ₽** |
| Sentiment | Claude Haiku 4.5 | input $0.25 / 1M, output $1.25 / 1M | батч 20, ~30 токенов на штуку → **~0.001 ₽** |
| Cluster naming | Claude Sonnet 4.6 | input $3 / 1M, output $15 / 1M | один вызов на кластер → **~0.5 ₽ за тег** |

При 100 компаний × 50 отзывов × 2 источника = 10000 отзывов:
- Embeddings: ~10 ₽
- Sentiment: ~10 ₽
- Recluster раз в сутки: ~50 тегов × 0.5 ₽ = 25 ₽

Итого ~45 ₽ на «полный прогон одной ниши». Это укладывается в free-tier OpenAI
для разработки и в любой разумный бюджет для продакшна.

---

## 6. Graceful degradation

При любом «нет настройки» pipeline продолжает работать, просто без AI-части:

| Что пусто | Что не работает | Что работает |
|---|---|---|
| `OPENAI_API_KEY` | embeddings, match_reviews_to_pain_tags | sentiment (если есть LLM), парсер, фильтры |
| Все ai_assistants | sentiment-LLM (остаётся derived from rating), naming кластеров (fallback "Кластер N") | парсер, embeddings, match (если уже есть PainTag-и) |
| Нет PainTag в БД для (niche, city) | match → пустой результат | всё остальное; теги создадутся после ночного recluster |

UI в `PainTagsCloud` показывает понятное сообщение: «AI-теги ещё не созданы
для этой ниши».

---

## 7. Что НЕ реализовано (на будущее)

- **Yandex Embeddings provider** — переменная `REVIEWS_AI_EMBEDDING_PROVIDER=yandex`
  заложена в Settings, но `llm.embed_texts` пока поддерживает только OpenAI.
  Yandex имеет 256-dim вектор → потребуется отдельная миграция с
  `ALTER TABLE reviews ALTER COLUMN embedding TYPE vector(256)` (deconstructive).
- **OpenAI / Anthropic Batch API** — сейчас batch отправляется одним промптом
  c JSON-массивом, не настоящим Batch API. Это проще, надёжнее и достаточно
  для нашего объёма (≤100 отзывов в одном запросе LLM).
- **Адаптивный threshold** — `REVIEWS_AI_PAIN_MATCH_THRESHOLD` сейчас глобальный.
  Для разнородных ниш стоит хранить per-PainTag override.
- **A/B-выбор LLM-провайдера** — auto-pick идёт по подсказке в `model.name`.
  Можно сделать через приоритет в БД (`ai_assistant.priority`).
