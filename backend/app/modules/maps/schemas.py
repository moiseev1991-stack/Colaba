"""Pydantic-схемы модуля maps.

Промежуточные схемы для провайдеров (CompanyRaw, ReviewRaw) — отдают
providers/*.py, читает service.save_*_batch. Out-схемы — для API.

NB: НЕ используем `from __future__ import annotations` — Pydantic + FastAPI
ломаются на ForwardRef в Query/Body. Python 3.11 нативно поддерживает
union-синтаксис без future-импорта.
"""

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


Source = Literal["2gis", "yandex_maps"]


class CompanyRaw(BaseModel):
    """Сырые данные компании, отдаваемые провайдером карты.

    Все поля кроме source/external_id/name опциональны — провайдер может не отдать,
    например, координаты или сайт. Сервис нормализует и сохраняет в models.Company.
    """

    model_config = ConfigDict(extra="ignore")

    source: Source
    external_id: str
    name: str

    niche: str | None = None
    city: str | None = None
    address: str | None = None
    lat: float | None = None
    lng: float | None = None
    phone: str | None = None
    website: str | None = None

    rating: float | None = None
    reviews_count: int = 0

    # Контакты, которые провайдер карты отдал сразу в response (без отдельного
    # обогащения через краулинг сайта). Совпадают по семантике с Company.emails
    # и Company.contacts_extra — если провайдер отдал, сохраняем сразу;
    # enrich_company_contacts (краулинг website) дозальёт остальное.
    emails: list[str] | None = None
    contacts_extra: dict[str, Any] | None = None

    raw_data: dict[str, Any] | None = Field(default=None, description="Полный ответ источника")


class ReviewRaw(BaseModel):
    """Сырой отзыв от провайдера. company_id заполняется сервисом перед save."""

    model_config = ConfigDict(extra="ignore")

    source: Source
    external_id: str | None = None
    author_masked: str | None = None
    rating: int | None = None
    raw_text: str | None = None
    source_url: str | None = None
    posted_at: datetime | None = None
    has_owner_reply: bool = False


SortBy = Literal[
    "rating_asc",
    "rating_desc",
    "reviews_desc",
    "negative_desc",
    "pain_desc",
    # Блок 3 ТЗ 2026-06-02: сортировка по кэшированному lead_temperature
    # (companies.lead_temperature). NULL-значения уходят в конец.
    "temperature_desc",
    # Блок 4 ТЗ 2026-06-02: сортировка по website_lead_score. NULL =
    # у компании есть свой сайт (она не website-лид), уходит в конец.
    "website_score_desc",
]


class MapSearchFilter(BaseModel):
    """Фильтры для get_search_results / списка компаний в API.

    pain_tag_ids — фильтр по AI-тегам болей; работает только после миграции 016
    (модуль reviews_ai). До миграции 016 фильтр игнорируется (NB не падает —
    просто молча не накладывается).
    """

    model_config = ConfigDict(extra="ignore")

    min_rating: float | None = None
    max_rating: float | None = None
    min_reviews: int | None = None
    min_negative: int | None = None
    has_owner_replies: bool | None = None
    # True — только компании с непустым website. False — только без сайта.
    # Полезно для веб-студий (без сайта = потенциальный клиент).
    has_website: bool | None = None
    pain_tag_ids: list[int] | None = None
    min_pain_mentions: int = 1
    sort_by: SortBy = "rating_desc"

    # Текстовые фильтры по отзывам: компания включается в выдачу, только если
    # у неё есть хотя бы один отзыв, который ILIKE %contains% / NOT ILIKE %excludes%.
    # Single-форма (legacy) и массив-форма работают совместно: при поиске
    # contains_any список объединяется OR-ом (любое из слов даёт мэтч).
    # excludes_any — компанию выкидываем, если хоть один отзыв содержит
    # ХОТЬ ОДНО из exclude-слов.
    review_text_contains: str | None = None
    review_text_excludes: str | None = None
    review_text_contains_any: list[str] | None = None
    review_text_excludes_any: list[str] | None = None

    # Блок 2 ТЗ 2026-06-02: фильтр «Платёжеспособные» через company_legal.
    # min_revenue в рублях, min_age_years — полных лет с регистрации.
    # Если включены, компания должна иметь связанную CompanyLegal со
    # status='ok' и удовлетворять обоим (когда оба заданы).
    min_revenue: float | None = None
    min_age_years: int | None = None

    # Multi-source фильтр (ТЗ 2026-06-04): глобальный переключатель
    # в шапке выдачи «Все · 2GIS · Я.Карты». EXISTS-фильтр по company_sources.
    # 'all'/None — без фильтра. '2gis'/'yandex_maps' — только компании с
    # соответствующим source-профилем (склеенные мульти-компании остаются).
    source_filter: Literal["all", "2gis", "yandex_maps"] | None = None


# ---------------------------------------------------------------------------
# API request/response schemas
# ---------------------------------------------------------------------------


SearchMode = Literal["city", "radius"]


class MapSearchCreate(BaseModel):
    """Тело POST /api/v1/maps/search.

    Режимы:
    - mode='city' (default): обязательны niche + city. Старое поведение.
    - mode='radius': обязательны niche + address + radius_meters. city будет
      автоматически выставлен из геокодинга адреса (для pain_tags).
    """

    model_config = ConfigDict(extra="ignore")

    niche: str = Field(..., min_length=2, max_length=100)
    city: str = Field(default="", max_length=100)
    sources: list[Source] = Field(default_factory=lambda: ["2gis"])
    filters: MapSearchFilter | None = None

    mode: SearchMode = "city"
    address: str | None = Field(default=None, max_length=500)
    radius_meters: int | None = Field(default=None, ge=200, le=20000)


class PainTagShort(BaseModel):
    id: int
    label: str
    similarity: float | None = None


class CompanyPainOut(BaseModel):
    """Боль с привязкой к конкретной компании: + mention_count + цитата.

    Используется в карточке компании, чтобы под каждой болью показать
    «доказательство» — короткий фрагмент отзыва клиента.
    """

    model_config = ConfigDict(from_attributes=True)

    pain_tag_id: int
    label: str
    description: str | None = None
    mention_count: int = 0
    top_quote: str | None = None
    top_quote_similarity: float | None = None


class PainTagOut(BaseModel):
    """Полная карточка тега боли для облака тегов / API."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    niche: str
    city: str | None = None
    label: str
    description: str | None = None
    occurrences_count: int = 0
    cluster_size: int | None = None
    examples: list[dict] | None = None
    status: str = "active"


class NichePainClusterSampleQuote(BaseModel):
    quote: str
    company_name: str | None = None
    posted_at: str | None = None


class NichePainClusterOut(BaseModel):
    """Один кластер «облака болей по нише» — фишка ТЗ 2026-06-08.

    Используется UI-вкладкой выдачи «Облако болей»: бар с % частоты,
    суммарным количеством упоминаний, и 2-3 цитатами как доказательство.
    """

    model_config = ConfigDict(from_attributes=True)

    cluster_label: str
    company_count: int
    frequency_pct: float
    total_mentions: int
    pain_tag_ids: list[int] = Field(default_factory=list)
    sample_quotes: list[NichePainClusterSampleQuote] = Field(default_factory=list)


class NichePainClustersOut(BaseModel):
    """Ответ /maps/search/{id}/pain-clusters."""

    model_config = ConfigDict(from_attributes=True)

    search_id: int
    niche: str
    city: str | None = None
    total_companies: int
    clusters: list[NichePainClusterOut]
    generated_at: datetime | None = None
    # 'ready' — данные есть; 'pending' — таска ещё не отработала;
    # 'empty' — поиск завершён, но pain-теги отсутствуют (нет негатива
    # или AI ещё не разобрал отзывы).
    status: str = "ready"


class CompanyContactOut(BaseModel):
    """Контакт компании с разметкой источника (миграция 028, Phase 4).

    На фронте используется для построения секций «По данным 2GIS» / «По данным
    Я.Карт» в drawer карточки. Дедуп между источниками НЕ делается — если телефон
    совпал в обоих источниках, это две записи с пометкой совпадения на UI.
    """

    model_config = ConfigDict(from_attributes=True)

    source: str           # '2gis' | 'yandex_maps'
    type: str             # 'phone' | 'email' | 'website' | 'telegram' | 'whatsapp' | 'vk' | ...
    value: str
    is_primary: bool = False


class CompanySourceOut(BaseModel):
    """Один источниковый профиль компании (миграция 028, Phase 4).

    Компания может присутствовать в 2GIS И в Я.Картах. Каждый источник даёт свои
    rating/reviews_count/contacts — этот объект агрегирует их per-source без смешивания.
    """

    model_config = ConfigDict(from_attributes=True)

    source: str                    # '2gis' | 'yandex_maps'
    external_id: str
    source_url: str | None = None  # deeplink на карточку в этом источнике
    rating: float | None = None
    reviews_count: int = 0
    reviews_positive_count: int = 0
    reviews_negative_count: int = 0
    reviews_neutral_count: int = 0
    has_owner_replies: bool = False
    owner_replies_count: int = 0
    contacts: list[CompanyContactOut] = Field(default_factory=list)


class CompanyOut(BaseModel):
    """Карточка компании в выдаче. pain_tags пустой до ШАГов 7-11."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    niche: str | None = None
    city: str | None = None
    address: str | None = None
    # Координаты от 2GIS/Я.Карт. Нужны UI-карте на странице результатов
    # (Leaflet-маркеры). У старых записей могут быть None.
    lat: float | None = None
    lng: float | None = None
    phone: str | None = None
    website: str | None = None
    rating: float | None = None
    reviews_count: int = 0
    reviews_positive_count: int = 0
    reviews_negative_count: int = 0
    reviews_neutral_count: int = 0
    has_owner_replies: bool = False
    owner_replies_count: int = 0
    last_review_at: datetime | None = None
    source: str
    # Lead temperature 0-100 — кэшированный скор «горячести» лида.
    # NULL = пересчёт ещё не прогонялся (например свеже-спарсенная компания
    # до завершения reviews/contacts).
    lead_temperature: int | None = None
    # Website lead score 0-100 — скор под продажу создания сайта.
    # NULL = у компании есть собственный активный сайт (не website-лид).
    website_lead_score: int | None = None
    # Юр.данные из DaData (блок 2 ТЗ 2026-06-02). null если не обогащались
    # или не нашлось матча.
    legal: "CompanyLegalOut | None" = None
    # external_id 2GIS/Я.Карт — нужен для deeplink в их карточки из
    # UI (например, https://2gis.ru/firm/{external_id}). Не nullable
    # в БД, но мы оставляем optional для бэк-совместимости со старыми
    # тестами/моками.
    external_id: str | None = None
    pain_tags: list[PainTagShort] = Field(default_factory=list)
    # Обогащённые контакты (миграция 018). Заполняются Celery-таском
    # enrich_company_contacts асинхронно — могут быть None на свежей компании.
    emails: list[str] | None = None
    contacts_extra: dict[str, Any] | None = None
    # Топ-боли с цитатами клиентов под каждой. Заполняется опционально
    # сервисом (attach_top_pains_for_companies) для маршрутов, где это нужно.
    top_pains: list[CompanyPainOut] = Field(default_factory=list)
    # Fallback-цитаты: 1-2 куска негативных отзывов когда AI ещё не разобрал
    # компанию на pain_tags (или вообще не нашёл match с тегами ниши).
    # Юзер видит «о чём негатив» сразу, без ожидания reviews_ai пайплайна.
    negative_snippets: list[str] = Field(default_factory=list)
    # Multi-source (миграция 028, Phase 4). Список источниковых профилей этой
    # компании — у одноисточниковых компаний длина 1, у склеенных 2gis+yandex 2.
    # Пустой массив = провайдер ещё не заполнил эти таблицы (для очень старых
    # тестов/моков). Для списка прогружается batch'ем через attach_sources_for_companies,
    # для детали — single-shot.
    sources_profiles: list[CompanySourceOut] = Field(default_factory=list)


class ReviewOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    author_masked: str | None = None
    rating: int | None = None
    raw_text: str | None = None
    sentiment: str | None = None
    sentiment_score: float | None = None
    posted_at: datetime | None = None
    has_owner_reply: bool = False
    source_url: str | None = None
    pain_tags: list[PainTagShort] = Field(default_factory=list)
    # multi-source (миграция 028): чтобы UI мог группировать отзывы в вкладки
    # «Все / 2GIS / Я.Карты». Тождественно reviews.source, отдаём явно.
    source: str | None = None


class DecisionMakerOut(BaseModel):
    """ЛПР с сайта компании (ТЗ A.2 2026-06-04). Из company_decision_makers."""

    model_config = ConfigDict(from_attributes=True)

    name: str
    post: str | None = None
    source: str  # 'website_team' | 'website_about' | 'website_contacts'
    source_url: str | None = None
    confidence: float | None = None
    is_decision_maker: bool = True


class CompanyDetailOut(CompanyOut):
    recent_reviews: list[ReviewOut] = Field(default_factory=list)
    # ТЗ A.2 2026-06-04: список ЛПР, извлечённых LLM-ом со страниц сайта.
    # Параллельно с CompanyLegalOut.director_name (DaData) — там единственный
    # директор «по ЕГРЮЛ», здесь — все лица найденные на /команда /о-нас.
    # Пустой массив = краулер ещё не отработал или сайт без явных страниц команды.
    decision_makers: list[DecisionMakerOut] = Field(default_factory=list)


class MapSearchOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    niche: str
    city: str
    sources: str
    status: str
    ai_progress: str
    companies_found: int = 0
    reviews_found: int = 0
    error: str | None = None
    error_type: str | None = None
    created_at: datetime
    started_at: datetime | None = None
    finished_at: datetime | None = None
    # Сохранённые фильтры из payload createMapSearch — нужны, чтобы при
    # открытии страницы результатов сразу применить пресет, который юзер
    # выбрал на форме поиска.
    filters: dict[str, Any] | None = None
    # radius-режим (миграция 019)
    mode: str = "city"
    address: str | None = None
    point_lat: float | None = None
    point_lng: float | None = None
    radius_meters: int | None = None


class SourceCountsOut(BaseModel):
    """Счётчики по источникам в шапке выдачи (ТЗ 2026-06-04 §2.2).

    Считаются на ВСЕЙ выборке поиска (до пагинации, без фильтра по source).
    `both` — компании, имеющие профили обоих источников (склеенные Phase 2/3).
    """

    total: int = 0
    twogis: int = 0          # с профилем 2gis
    yandex_maps: int = 0     # с профилем yandex_maps
    both: int = 0            # с обоими (мультисурсовые)


class CompaniesListOut(BaseModel):
    items: list[CompanyOut]
    total: int
    limit: int
    offset: int


class HeatmapPoint(BaseModel):
    """Одна точка для Leaflet.heat: [lat, lng, intensity 0..1]."""

    lat: float
    lng: float
    weight: float = 1.0


class HeatmapOut(BaseModel):
    """Ответ /maps/search/{id}/heatmap.

    layer — какой именно слой тепла отрисовать (density/pain/website/rating/wealth).
    Frontend Leaflet.heat принимает массив `[[lat, lng, weight], ...]`,
    serializer этого не делает (Pydantic не любит anon-кортежи), поэтому
    отдаём список объектов и фронт его маппит.
    """

    layer: str
    points: list[HeatmapPoint]
    # Подсказка фронту: рекомендуемая интенсивность max (для шкалы цвета).
    # Без неё Leaflet.heat сам нормализует, что иногда даёт «всё красное».
    max_intensity: float = 1.0
    # Сколько компаний было всего в поиске под текущим source-фильтром;
    # сколько из них реально дали ненулевой вклад в этот слой (для UI-подписи
    # «найдено 73 компаний · 31 на heatmap pain»).
    total_companies: int = 0
    contributing: int = 0
    # Multi-source (ТЗ 2026-06-04): счётчики для сегмент-переключателя
    # «Все · 2GIS · Я.Карты» в шапке списка. None у легаси-клиентов.
    source_counts: SourceCountsOut | None = None


class ReviewsListOut(BaseModel):
    items: list[ReviewOut]
    total: int
    limit: int
    offset: int


class ProvidersHealthOut(BaseModel):
    """Сводный health-check всех внешних провайдеров.

    Каждое поле — короткая строка: 'ok' | 'no_api_key' | 'no_proxy' | ...
    Дополнительно — счётчики из БД для запоминающих провайдеров (DaData).
    `details` — словарь произвольных pair'ов для UI/devops без жёсткой схемы
    (например count compleсtion, последний ошибочный запрос).
    """

    twogis: str
    yandex_maps: str
    # ТЗ 2026-06-07: дополнительные провайдеры — DaData (юр.данные),
    # LLM-шлюз (OpenAI/ProxyAPI/Anthropic), Sentry (error tracking).
    dadata: str = "unknown"
    llm: str = "unknown"
    sentry: str = "off"
    details: dict[str, Any] = Field(default_factory=dict)


class CompanyLegalOut(BaseModel):
    """Юр.данные компании из DaData (блок 2 ТЗ 2026-06-02)."""

    model_config = ConfigDict(from_attributes=True)

    inn: str | None = None
    ogrn: str | None = None
    legal_name: str | None = None
    legal_short_name: str | None = None
    registration_date: str | None = None
    revenue: float | None = None
    employee_count: int | None = None
    legal_status: str | None = None
    okved: str | None = None
    okved_name: str | None = None
    age_years: int | None = None
    match_confidence: float | None = None
    matched_by: str | None = None
    # ЛПР (ТЗ A.1 2026-06-04): ФИО руководителя + должность из DaData.
    director_name: str | None = None
    director_post: str | None = None


class OutreachDraftOut(BaseModel):
    """Ответ POST /maps/companies/{id}/draft-email."""

    model_config = ConfigDict(extra="ignore")

    company_id: int
    company_name: str
    subject: str
    body: str
    used_pains: list[CompanyPainOut] = Field(default_factory=list)
    suggested_to_emails: list[str] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Aha-moment / blok 1: outreach-draft с угольной логикой + кэшем
# ---------------------------------------------------------------------------


OutreachAngle = Literal["website", "reputation", "automation", "seo", "auto"]
OutreachTone = Literal["friendly", "official"]
OutreachLanguage = Literal["ru", "en"]


class OutreachDraftRequest(BaseModel):
    """Тело POST /maps/companies/{id}/outreach-draft.

    Все поля опциональны. По умолчанию: angle='auto' (сервер сам выбирает по
    сигналам), tone='friendly', language='ru', regenerate=False (если в
    кэше уже есть драфт под этим углом — отдаём кэш без вызова LLM).
    """

    model_config = ConfigDict(extra="ignore")

    angle: OutreachAngle = "auto"
    tone: OutreachTone = "friendly"
    language: OutreachLanguage = "ru"
    regenerate: bool = False


class OutreachDraftCachedOut(BaseModel):
    """Ответ POST /maps/companies/{id}/outreach-draft.

    angle_used — конкретный угол, который сервер реально использовал
    (если запрашивали 'auto' — будет, например, 'website').
    pains_used — какие pain-теги пошли в промпт; пусто = генерили без
    болей (по углу).
    cached — true если ответ отдан из company_outreach_drafts без вызова LLM.
    """

    model_config = ConfigDict(extra="ignore")

    company_id: int
    company_name: str
    subject: str
    body: str
    angle_used: str
    tone: str
    language: str
    pains_used: list[CompanyPainOut] = Field(default_factory=list)
    suggested_to_emails: list[str] = Field(default_factory=list)
    cached: bool = False


class CompanyDigestOut(BaseModel):
    """Краткая сводка отзывов компании за N дней.

    Для drawer'а — даёт юзеру одним взглядом понять «как сейчас себя
    чувствует компания»: упал ли рейтинг, что чаще всего критикуют,
    отвечает ли владелец.
    """

    model_config = ConfigDict(extra="ignore")

    company_id: int
    days: int = 30
    total_reviews: int = 0
    positive_count: int = 0
    negative_count: int = 0
    neutral_count: int = 0
    avg_rating: float | None = None
    owner_reply_rate: float | None = None  # 0..1, доля отзывов с ответом владельца
    top_pains: list[CompanyPainOut] = Field(default_factory=list)
