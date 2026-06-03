"""Maps module ORM models.

Соответствует миграции 015. Стиль — классический Column(), как в остальном проекте.
"""

from datetime import datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    BigInteger,
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship

from app.core.database import Base


class Company(Base):
    """Компания-лид, спарсенная с карт (2GIS / Я.Карты).

    Уникальность по (source, external_id) — одна и та же компания из одного источника
    не дублируется. Между источниками возможен дубликат (одно и то же ИП в 2ГИС и Я.Картах
    как две строки) — это сознательное решение: дедуп между источниками сложен,
    а UI всё равно показывает оба варианта с пометкой источника.
    """

    __tablename__ = "companies"
    __table_args__ = (UniqueConstraint("source", "external_id", name="uq_companies_source_external_id"),)

    id = Column(BigInteger, primary_key=True)
    organization_id = Column(Integer, ForeignKey("organizations.id", ondelete="SET NULL"), nullable=True, index=True)

    source = Column(String(20), nullable=False)         # '2gis' | 'yandex_maps'
    external_id = Column(String(255), nullable=False)
    name = Column(String(500), nullable=False)
    niche = Column(String(100))
    city = Column(String(100))
    address = Column(String(500))
    lat = Column(Numeric(9, 6))
    lng = Column(Numeric(9, 6))
    phone = Column(String(50))
    website = Column(String(500))

    rating = Column(Numeric(3, 2))
    reviews_count = Column(Integer, nullable=False, default=0)
    reviews_positive_count = Column(Integer, nullable=False, default=0)
    reviews_negative_count = Column(Integer, nullable=False, default=0)
    reviews_neutral_count = Column(Integer, nullable=False, default=0)
    has_owner_replies = Column(Boolean, nullable=False, default=False)
    owner_replies_count = Column(Integer, nullable=False, default=0)

    rating_history = Column(JSONB)
    last_review_at = Column(DateTime(timezone=True))
    raw_data = Column(JSONB)

    # Lead temperature (0-100) — кэш скоринга «горячести» лида.
    # Пересчитывается lead_temperature.recompute_for_company после изменений
    # карточки (новые отзывы / новые контакты / новый рейтинг). nullable
    # для свеже-спарсенных компаний; в выдаче сортируем NULLS LAST.
    lead_temperature = Column(SmallInteger)
    # Website lead score (0-100) — отдельный профиль скоринга под продажу
    # создания сайтов (блок 4 ТЗ 2026-06-02). NULL у компаний с активным
    # собственным сайтом (они не website-лиды). Сортировка NULLS LAST.
    website_lead_score = Column(SmallInteger)
    # AI-описание компании (блок 4C ТЗ 2026-06-02). 1-2 предложения для
    # hero/SEO будущего сайта. Генерируется в фоне Celery-таском по
    # запросу при экспорте Excel; нулл — ещё не генерировалось.
    ai_description = Column(Text)
    ai_description_generated_at = Column(DateTime(timezone=True))

    # Контакты, обогащённые краулером сайта компании (миграция 018).
    # emails — список email-адресов, найденных на сайте.
    # contacts_extra — доп. телефоны / vk / telegram / whatsapp (если найдены).
    # contacts_enriched_at — когда обогащение прогонялось последний раз
    # (NULL = не обогащали; ставится даже при пустом результате, чтобы
    # не дёргать сайт повторно при каждом поиске).
    emails = Column(JSONB)
    contacts_extra = Column(JSONB)
    contacts_enriched_at = Column(DateTime(timezone=True))

    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    reviews = relationship("Review", back_populates="company", cascade="all, delete-orphan", lazy="raise")
    # Источниковые профили компании — 2GIS, Я.Карты и т.п. Phase 1 заполняет их 1-к-1
    # по существующим компаниям (одна company = один company_sources). После Phase 2
    # (дедуп) у одной компании может быть несколько источников. См. docs/multi-source-companies-plan.md.
    sources_profiles = relationship(
        "CompanySource", back_populates="company", cascade="all, delete-orphan", lazy="raise",
    )
    contacts = relationship(
        "CompanyContact", back_populates="company", cascade="all, delete-orphan", lazy="raise",
    )

    def __repr__(self) -> str:
        return f"<Company #{self.id} {self.name!r} ({self.source})>"


class CompanySource(Base):
    """Источниковый профиль компании (миграция 028).

    Одна компания может присутствовать в 2GIS И в Я.Картах одновременно — каждый
    источник даёт свои рейтинг/отзывы/контакты, и они могут отличаться. Эта таблица
    хранит данные именно конкретного источника, без смешивания с другими.

    Phase 1: каждой существующей companies-записи сопоставлен ровно один company_sources
    (1-к-1) — миграция аддитивная, не ломает существующее API.
    Phase 2 (дедуп существующих) и Phase 3 (дедуп при парсинге) свяжут несколько
    источников с одной companies-записью.

    match_confidence:
      - 1.00 — backfill из Phase 1 или новая компания без матча (свой company_id).
      - <1.00 — домерджен по фуззи-матчу к существующему company_id.
    """

    __tablename__ = "company_sources"
    __table_args__ = (
        UniqueConstraint("source", "external_id", name="uq_company_sources_source_external_id"),
    )

    id = Column(BigInteger, primary_key=True)
    company_id = Column(BigInteger, ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True)

    source = Column(String(20), nullable=False)         # '2gis' | 'yandex_maps' | 'google'
    external_id = Column(String(255), nullable=False)
    source_url = Column(String(500))                     # deeplink на карточку в источнике

    rating = Column(Numeric(3, 2))
    reviews_count = Column(Integer, nullable=False, default=0)
    reviews_positive_count = Column(Integer, nullable=False, default=0)
    reviews_negative_count = Column(Integer, nullable=False, default=0)
    reviews_neutral_count = Column(Integer, nullable=False, default=0)
    has_owner_replies = Column(Boolean, nullable=False, default=False)
    owner_replies_count = Column(Integer, nullable=False, default=0)
    last_review_at = Column(DateTime(timezone=True))

    match_confidence = Column(Numeric(3, 2), nullable=False, default=1.00)
    matched_by = Column(String(50))                     # 'phone' | 'coords' | 'name+city' | 'manual' | 'phase1_backfill'

    raw_data = Column(JSONB)
    last_parsed_at = Column(DateTime(timezone=True))

    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    company = relationship("Company", back_populates="sources_profiles")
    contacts = relationship(
        "CompanyContact", back_populates="source_profile", cascade="all, delete-orphan", lazy="raise",
    )

    def __repr__(self) -> str:
        return f"<CompanySource #{self.id} company={self.company_id} {self.source}/{self.external_id}>"


class CompanyContact(Base):
    """Контакт компании, привязанный к конкретному источниковому профилю (миграция 028).

    Один и тот же телефон в 2GIS и в Я.Картах — это ДВЕ записи (с разным source).
    Это сознательно — UI показывает контакты раздельно, расхождение между источниками
    может быть ценным сигналом (если совпадают — компания однозначно идентифицирована).

    `is_primary` — отметка «основного» контакта своего типа в своём источнике.
    Используется UI для показа главного телефона/сайта в превью карточки.
    """

    __tablename__ = "company_contacts"
    __table_args__ = (
        UniqueConstraint(
            "company_source_id", "type", "value", name="uq_contact_per_source_type_value",
        ),
    )

    id = Column(BigInteger, primary_key=True)
    company_source_id = Column(
        BigInteger, ForeignKey("company_sources.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    # Денормализованно для быстрого фильтра «все контакты компании» без JOIN
    company_id = Column(BigInteger, ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True)
    source = Column(String(20), nullable=False, index=True)

    # 'phone' | 'email' | 'website' | 'telegram' | 'whatsapp' | 'vk' |
    # 'instagram' | 'facebook' | 'ok' | 'youtube'
    type = Column(String(20), nullable=False)
    value = Column(String(500), nullable=False)
    is_primary = Column(Boolean, nullable=False, default=False)

    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    source_profile = relationship("CompanySource", back_populates="contacts")
    company = relationship("Company", back_populates="contacts")

    def __repr__(self) -> str:
        return f"<CompanyContact #{self.id} {self.type}={self.value!r} src={self.source}>"


class Review(Base):
    """Отзыв на компанию. embedding заполняется AI-пайплайном (модуль reviews_ai)."""

    __tablename__ = "reviews"
    __table_args__ = (UniqueConstraint("company_id", "text_hash", name="ux_reviews_company_text_hash"),)

    id = Column(BigInteger, primary_key=True)
    company_id = Column(BigInteger, ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True)
    # Источниковый профиль (миграция 028). Phase 1 заполняет существующие отзывы
    # через backfill; новый код парсинга/импорта пишет сюда обязательно.
    # FK станет NOT NULL в одной из следующих миграций — после Phase 2.
    company_source_id = Column(
        BigInteger, ForeignKey("company_sources.id", ondelete="CASCADE"), nullable=True, index=True,
    )

    source = Column(String(20), nullable=False)
    external_id = Column(String(255))
    author_masked = Column(String(50))     # 'И. И.' — анонимизированно
    rating = Column(SmallInteger)
    raw_text = Column(Text)
    raw_text_purged_at = Column(DateTime(timezone=True))  # cron вычищает старые тексты

    sentiment = Column(String(10))         # 'positive' | 'negative' | 'neutral'
    sentiment_score = Column(Numeric(3, 2))

    source_url = Column(String(500))
    posted_at = Column(DateTime(timezone=True))
    has_owner_reply = Column(Boolean, nullable=False, default=False)

    text_hash = Column(String(64))
    embedding = Column(Vector(1536))       # OpenAI text-embedding-3-small
    ai_processed_at = Column(DateTime(timezone=True))

    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    company = relationship("Company", back_populates="reviews")

    def __repr__(self) -> str:
        return f"<Review #{self.id} company={self.company_id} rating={self.rating} sentiment={self.sentiment!r}>"


class MapSearchCache(Base):
    """TTL-кэш по (ниша, город, источник). Один раз спарсили — следующие N дней
    результаты собираются из existing companies через map_search_results."""

    __tablename__ = "map_search_cache"
    __table_args__ = (UniqueConstraint("niche", "city", "source", name="uq_map_search_cache_key"),)

    id = Column(Integer, primary_key=True)
    niche = Column(String(100), nullable=False)
    city = Column(String(100), nullable=False)
    source = Column(String(20), nullable=False)
    companies_count = Column(Integer, nullable=False, default=0)
    reviews_count = Column(Integer, nullable=False, default=0)
    parsed_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)

    def __repr__(self) -> str:
        return f"<MapSearchCache niche={self.niche!r} city={self.city!r} source={self.source!r}>"


class MapSearch(Base):
    """История поисков пользователя в режиме «по картам»."""

    __tablename__ = "map_searches"

    id = Column(BigInteger, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id", ondelete="SET NULL"), nullable=True)

    niche = Column(String(100), nullable=False)
    city = Column(String(100), nullable=False)
    sources = Column(String(100), nullable=False)         # '2gis' или '2gis,yandex_maps'
    status = Column(String(20), nullable=False, index=True)  # pending|running|completed|failed|from_cache
    filters = Column(JSONB)

    # Режим поиска (миграция 019). 'city' — старый, по region_id;
    # 'radius' — конкурентный режим, поиск в радиусе от точки.
    mode = Column(String(20), nullable=False, default="city")
    address = Column(String(500))               # исходный адрес юзера (для UI)
    point_lat = Column(Numeric(9, 6))           # геокодированные координаты центра
    point_lng = Column(Numeric(9, 6))
    radius_meters = Column(Integer)             # 500..15000

    companies_found = Column(Integer, nullable=False, default=0)
    reviews_found = Column(Integer, nullable=False, default=0)
    ai_progress = Column(String(20), nullable=False, default="pending")  # pending|running|done|skipped

    error = Column(Text)
    error_type = Column(String(50))

    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    started_at = Column(DateTime(timezone=True))
    finished_at = Column(DateTime(timezone=True))

    results = relationship(
        "MapSearchResult",
        back_populates="search",
        cascade="all, delete-orphan",
        lazy="raise",
    )

    def __repr__(self) -> str:
        return f"<MapSearch #{self.id} {self.niche!r}/{self.city!r} [{self.status}]>"


class MapSearchResult(Base):
    """Связка поиск ↔ компания, c позицией в выдаче источника."""

    __tablename__ = "map_search_results"

    map_search_id = Column(BigInteger, ForeignKey("map_searches.id", ondelete="CASCADE"), primary_key=True)
    company_id = Column(BigInteger, ForeignKey("companies.id", ondelete="CASCADE"), primary_key=True)
    position = Column(Integer)

    search = relationship("MapSearch", back_populates="results")
    company = relationship("Company")

    def __repr__(self) -> str:
        return f"<MapSearchResult search={self.map_search_id} company={self.company_id} pos={self.position}>"
