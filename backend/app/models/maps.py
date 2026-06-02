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

    def __repr__(self) -> str:
        return f"<Company #{self.id} {self.name!r} ({self.source})>"


class Review(Base):
    """Отзыв на компанию. embedding заполняется AI-пайплайном (модуль reviews_ai)."""

    __tablename__ = "reviews"
    __table_args__ = (UniqueConstraint("company_id", "text_hash", name="ux_reviews_company_text_hash"),)

    id = Column(BigInteger, primary_key=True)
    company_id = Column(BigInteger, ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True)

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
