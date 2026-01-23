"""
Search models.
"""

from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, JSON, ForeignKey, DateTime
from sqlalchemy.orm import relationship

from app.core.database import Base


class Search(Base):
    """Search model."""
    __tablename__ = "searches"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    query = Column(String(500), nullable=False)
    search_provider = Column(String(50), default="duckduckgo")
    num_results = Column(Integer, default=50)
    status = Column(String(50), default="pending")
    result_count = Column(Integer, default=0)
    config = Column(JSON, default={})
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, onupdate=datetime.utcnow)

    # Relationships
    user = relationship("User", back_populates="searches")
    results = relationship("SearchResult", back_populates="search", cascade="all, delete-orphan")


class SearchResult(Base):
    """Search result model."""
    __tablename__ = "search_results"

    id = Column(Integer, primary_key=True, index=True)
    search_id = Column(Integer, ForeignKey("searches.id"), nullable=False, index=True)
    position = Column(Integer, nullable=False)
    title = Column(String(500), nullable=False)
    url = Column(Text, nullable=False)
    snippet = Column(Text)
    domain = Column(String(255))
    # SEO and contact fields
    seo_score = Column(Integer)  # 0-100
    phone = Column(String(50))
    email = Column(String(255))
    contact_status = Column(String(50))  # 'found', 'no_contacts', 'failed'
    outreach_subject = Column(Text)  # Generated outreach email subject
    outreach_text = Column(Text)  # Generated outreach email text
    extra_data = Column(JSON, default={})  # Additional data (crawl info, audit details)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    search = relationship("Search", back_populates="results")
