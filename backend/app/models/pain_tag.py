"""ORM-модели для AI-таблиц модуля reviews_ai.

Соответствует миграции 016. Стиль — классический Column(), как у остальных моделей.
"""

from datetime import datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    BigInteger,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship

from app.core.database import Base


class PainTag(Base):
    """Автоматически созданный «тег боли» по кластеру отзывов в нише+городе.

    centroid — средняя точка кластера в пространстве embeddings (для матчинга
    новых отзывов через cosine similarity).
    examples — 3-5 sample отзывов из кластера, для UI tooltip / отладки.
    status: 'active' для актуальных, 'archived' для снятых после recluster.
    """

    __tablename__ = "pain_tags"
    __table_args__ = (
        UniqueConstraint("niche", "city", "label", name="uq_pain_tags_niche_city_label"),
    )

    id = Column(Integer, primary_key=True)
    niche = Column(String(100), nullable=False)
    city = Column(String(100), nullable=True)  # NULL = глобальный
    label = Column(String(200), nullable=False)
    description = Column(Text)

    centroid = Column(Vector(1536))

    occurrences_count = Column(Integer, nullable=False, default=0)
    cluster_size = Column(Integer)
    examples = Column(JSONB)

    status = Column(String(20), nullable=False, default="active")

    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    def __repr__(self) -> str:
        return f"<PainTag #{self.id} {self.niche!r}/{self.city!r} → {self.label!r}>"


class ReviewPainTag(Base):
    """M:N связь reviews ↔ pain_tags. similarity 0..1 — cosine similarity
    отзыва с центроидом тега в момент назначения."""

    __tablename__ = "review_pain_tags"

    review_id = Column(BigInteger, ForeignKey("reviews.id", ondelete="CASCADE"), primary_key=True)
    pain_tag_id = Column(Integer, ForeignKey("pain_tags.id", ondelete="CASCADE"), primary_key=True)
    similarity = Column(Numeric(4, 3))

    def __repr__(self) -> str:
        return f"<ReviewPainTag review={self.review_id} tag={self.pain_tag_id} sim={self.similarity}>"


class CompanyPainScore(Base):
    """Денормализация: сколько раз тег боли упомянут в отзывах компании.
    Используется для фильтрации компаний по болям без многократного JOIN reviews.

    top_quote — самая яркая цитата клиента (по cosine similarity к centroid'у
    тега) среди отзывов этой компании. Заполняется во время match_reviews_to_pain_tags.
    Это «доказательство» под тегом боли в UI карточки компании.
    """

    __tablename__ = "company_pain_scores"

    company_id = Column(BigInteger, ForeignKey("companies.id", ondelete="CASCADE"), primary_key=True)
    pain_tag_id = Column(Integer, ForeignKey("pain_tags.id", ondelete="CASCADE"), primary_key=True)
    mention_count = Column(Integer, nullable=False, default=0)
    first_mention_at = Column(DateTime(timezone=True))
    last_mention_at = Column(DateTime(timezone=True))

    top_quote = Column(Text)
    top_quote_review_id = Column(BigInteger, ForeignKey("reviews.id", ondelete="SET NULL"))
    top_quote_similarity = Column(Numeric(4, 3))

    def __repr__(self) -> str:
        return f"<CompanyPainScore company={self.company_id} tag={self.pain_tag_id} count={self.mention_count}>"
