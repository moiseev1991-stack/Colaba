"""
Organization models for multi-tenancy support.
"""

from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Table, Enum
from sqlalchemy.orm import relationship
import enum

from app.core.database import Base


class OrganizationRole(str, enum.Enum):
    """Organization user roles."""
    OWNER = "OWNER"  # Full access, can delete organization
    ADMIN = "ADMIN"  # Can manage users and settings
    MEMBER = "MEMBER"  # Can view and create searches


# Association table for many-to-many relationship between User and Organization
user_organizations = Table(
    "user_organizations",
    Base.metadata,
    Column("user_id", Integer, ForeignKey("users.id"), primary_key=True),
    Column("organization_id", Integer, ForeignKey("organizations.id"), primary_key=True),
    Column("role", Enum(OrganizationRole), default=OrganizationRole.MEMBER, nullable=False),
    Column("created_at", DateTime, default=datetime.utcnow, nullable=False),
)


class Organization(Base):
    """Organization model."""
    __tablename__ = "organizations"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, onupdate=datetime.utcnow)

    # Relationships
    users = relationship(
        "User",
        secondary=user_organizations,
        back_populates="organizations",
        lazy="dynamic"
    )
    searches = relationship("Search", back_populates="organization", cascade="all, delete-orphan")
