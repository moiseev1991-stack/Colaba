"""
Deployment model for tracking deployment history.
"""

from datetime import datetime
from enum import Enum

from sqlalchemy import Column, Integer, String, DateTime, Text, Enum as SQLEnum

from app.core.database import Base


class DeploymentEnvironment(str, Enum):
    """Deployment environment."""
    STAGING = "staging"
    PRODUCTION = "production"


class DeploymentStatus(str, Enum):
    """Deployment status."""
    SUCCESS = "success"
    FAILED = "failed"
    ROLLED_BACK = "rolled_back"


class Deployment(Base):
    """Deployment history model."""
    __tablename__ = "deployments"

    id = Column(Integer, primary_key=True, index=True)
    version = Column(String(50), nullable=False)  # e.g., "1.2.3"
    git_sha = Column(String(50), nullable=False)  # e.g., "abc1234"
    environment = Column(
        SQLEnum(DeploymentEnvironment),
        default=DeploymentEnvironment.PRODUCTION,
        nullable=False
    )
    changelog = Column(Text, nullable=True)  # Generated changelog
    deployed_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    deployed_by = Column(String(255), nullable=True)  # GitHub actor
    status = Column(
        SQLEnum(DeploymentStatus),
        default=DeploymentStatus.SUCCESS,
        nullable=False
    )

    def __repr__(self):
        return f"<Deployment {self.version} ({self.environment})>"
