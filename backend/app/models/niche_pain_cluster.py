"""ORM: NichePainCluster — агрегированные боли по нише на уровне поиска.

Соответствует миграции 033. Заполняется Celery-таской
aggregate_niche_pain_clusters после parse_map_search.
"""

from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB

from app.core.database import Base


class NichePainCluster(Base):
    __tablename__ = "niche_pain_clusters"

    id = Column(BigInteger, primary_key=True)
    search_id = Column(
        BigInteger,
        ForeignKey("map_searches.id", ondelete="CASCADE"),
        nullable=False,
    )
    niche = Column(String(120), nullable=False)
    city = Column(String(120), nullable=True)
    cluster_label = Column(String(200), nullable=False)
    pain_tag_ids = Column(ARRAY(Integer), nullable=False, default=list)
    company_count = Column(Integer, nullable=False, default=0)
    # Хранится как 0..100 с двумя знаками после запятой (например 47.62).
    frequency_pct = Column(Numeric(5, 2), nullable=False, default=0)
    total_mentions = Column(Integer, nullable=False, default=0)
    # JSONB-список: [{"quote": "...", "company_name": "...", "posted_at": ISO?}]
    sample_quotes = Column(JSONB, nullable=False, default=list)
    generated_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint(
            "search_id", "cluster_label", name="uq_niche_pain_cluster_search_label"
        ),
    )
