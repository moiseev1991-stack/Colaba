"""AI-обработка отзывов: sentiment, embeddings, кластеризация болей, теги болей.

Зависит от модуля maps (модели Review, Company) и от ai_assistants (LLM-вызовы
через chat()). Векторный поиск — pgvector (миграции 015/016).

См. docs/maps_parser_tz_full.md §5.
"""
