"""SQLAdmin views для модуля maps.

Регистрируются в backend/app/admin/main.py — см. setup_admin().
PainTag будет добавлен в ШАГе 7-11 (миграция 016).
"""

from sqladmin import ModelView

from app.models.maps import (
    Company,
    MapSearch,
    MapSearchCache,
    Review,
)
from app.models.pain_tag import PainTag


class CompanyAdmin(ModelView, model=Company):
    name = "Компания"
    name_plural = "Компании"
    icon = "fa-solid fa-building"

    column_list = [
        Company.id, Company.name, Company.niche, Company.city,
        Company.rating, Company.reviews_count, Company.reviews_negative_count,
        Company.has_owner_replies, Company.source, Company.created_at,
    ]
    column_searchable_list = [Company.name, Company.phone, Company.website, Company.external_id]
    column_sortable_list = [
        Company.rating, Company.reviews_count, Company.reviews_negative_count,
        Company.created_at,
    ]
    column_default_sort = ("created_at", True)
    page_size = 50

    column_labels = {
        Company.name: "Название",
        Company.niche: "Ниша",
        Company.city: "Город",
        Company.rating: "Рейтинг",
        Company.reviews_count: "Отзывов",
        Company.reviews_negative_count: "Негатив",
        Company.has_owner_replies: "Отвечают",
        Company.source: "Источник",
        Company.created_at: "Создано",
    }


class ReviewAdmin(ModelView, model=Review):
    name = "Отзыв"
    name_plural = "Отзывы"
    icon = "fa-solid fa-comment"

    column_list = [
        Review.id, Review.company_id, Review.author_masked, Review.rating,
        Review.sentiment, Review.has_owner_reply, Review.posted_at,
        Review.raw_text_purged_at, Review.ai_processed_at,
    ]
    column_sortable_list = [
        Review.posted_at, Review.rating, Review.sentiment, Review.created_at,
    ]
    column_default_sort = ("posted_at", True)
    page_size = 100

    column_labels = {
        Review.company_id: "Компания",
        Review.author_masked: "Автор",
        Review.rating: "Оценка",
        Review.sentiment: "Тональность",
        Review.has_owner_reply: "Ответ владельца",
        Review.posted_at: "Опубликовано",
        Review.raw_text_purged_at: "Текст затёрт",
        Review.ai_processed_at: "AI обработан",
    }


class MapSearchAdmin(ModelView, model=MapSearch):
    name = "Поиск (карты)"
    name_plural = "Поиски (карты)"
    icon = "fa-solid fa-map"

    column_list = [
        MapSearch.id, MapSearch.user_id, MapSearch.niche, MapSearch.city,
        MapSearch.sources, MapSearch.status, MapSearch.ai_progress,
        MapSearch.companies_found, MapSearch.reviews_found,
        MapSearch.error_type, MapSearch.created_at,
    ]
    column_sortable_list = [
        MapSearch.created_at, MapSearch.status, MapSearch.companies_found,
    ]
    column_default_sort = ("created_at", True)
    page_size = 50

    column_labels = {
        MapSearch.user_id: "Пользователь",
        MapSearch.niche: "Ниша",
        MapSearch.city: "Город",
        MapSearch.sources: "Источники",
        MapSearch.status: "Статус",
        MapSearch.ai_progress: "AI прогресс",
        MapSearch.companies_found: "Компаний",
        MapSearch.reviews_found: "Отзывов",
        MapSearch.error_type: "Тип ошибки",
        MapSearch.created_at: "Создано",
    }


class PainTagAdmin(ModelView, model=PainTag):
    name = "Боль (тег)"
    name_plural = "Боли (теги)"
    icon = "fa-solid fa-bullseye"

    column_list = [
        PainTag.id, PainTag.niche, PainTag.city, PainTag.label,
        PainTag.occurrences_count, PainTag.cluster_size, PainTag.status,
        PainTag.created_at, PainTag.updated_at,
    ]
    column_searchable_list = [PainTag.label, PainTag.niche, PainTag.description]
    column_sortable_list = [
        PainTag.occurrences_count, PainTag.cluster_size,
        PainTag.created_at, PainTag.updated_at,
    ]
    column_default_sort = ("occurrences_count", True)
    page_size = 50

    column_labels = {
        PainTag.niche: "Ниша",
        PainTag.city: "Город",
        PainTag.label: "Метка",
        PainTag.occurrences_count: "Упоминаний",
        PainTag.cluster_size: "Размер кластера",
        PainTag.status: "Статус",
        PainTag.created_at: "Создан",
        PainTag.updated_at: "Обновлён",
    }


class MapSearchCacheAdmin(ModelView, model=MapSearchCache):
    name = "Кэш карт"
    name_plural = "Кэш карт"
    icon = "fa-solid fa-database"

    column_list = [
        MapSearchCache.id, MapSearchCache.niche, MapSearchCache.city,
        MapSearchCache.source, MapSearchCache.companies_count,
        MapSearchCache.reviews_count, MapSearchCache.parsed_at, MapSearchCache.expires_at,
    ]
    column_sortable_list = [MapSearchCache.parsed_at, MapSearchCache.expires_at]
    column_default_sort = ("parsed_at", True)
    page_size = 50

    column_labels = {
        MapSearchCache.niche: "Ниша",
        MapSearchCache.city: "Город",
        MapSearchCache.source: "Источник",
        MapSearchCache.companies_count: "Компаний",
        MapSearchCache.reviews_count: "Отзывов",
        MapSearchCache.parsed_at: "Спарсено",
        MapSearchCache.expires_at: "Истекает",
    }
