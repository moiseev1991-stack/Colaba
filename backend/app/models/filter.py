"""
Filter models.
"""

from datetime import datetime
from sqlalchemy import Column, Integer, String, JSON, ForeignKey, DateTime
from sqlalchemy.orm import relationship

from app.core.database import Base


class Filter(Base):
    """Filter model."""
    __tablename__ = "filters"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=False, index=True)
    name = Column(String(200), nullable=False)
    filter_type = Column(String(50), nullable=False)
    config = Column(JSON, default={})
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class BlacklistDomain(Base):
    """Blacklist domain model."""
    __tablename__ = "blacklist_domains"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    domain = Column(String(255), nullable=False, unique=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    user = relationship("User", back_populates="blacklist_domains")
