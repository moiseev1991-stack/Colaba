"""SQLAlchemy models for database tables."""

from app.models.search import Search, SearchResult
from app.models.filter import Filter, BlacklistDomain

__all__ = ["Search", "SearchResult", "Filter", "BlacklistDomain"]
