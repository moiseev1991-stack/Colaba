"""
Social account model for OAuth providers.
"""

from datetime import datetime
from enum import Enum

from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Enum as SQLEnum
from sqlalchemy.orm import relationship

from app.core.database import Base


class OAuthProvider(str, Enum):
    """Supported OAuth providers."""
    GOOGLE = "google"
    YANDEX = "yandex"
    VK = "vk"
    TELEGRAM = "telegram"


class SocialAccount(Base):
    """Social account for OAuth authentication."""
    __tablename__ = "social_accounts"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    provider = Column(SQLEnum(OAuthProvider), nullable=False)
    provider_user_id = Column(String(255), nullable=False)  # ID from OAuth provider
    provider_email = Column(String(255), nullable=True)
    provider_name = Column(String(255), nullable=True)  # Display name from provider
    provider_avatar = Column(String(500), nullable=True)  # Avatar URL
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationship
    user = relationship("User", back_populates="social_accounts")

    def __str__(self):
        return f"#{self.id} - {self.provider.value}: {self.provider_email or self.provider_user_id}"

    def __repr__(self):
        return self.__str__()
