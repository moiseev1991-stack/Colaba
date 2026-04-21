"""Synchronous read of EmailConfig for IMAP (imaplib) and Celery."""

from typing import Optional

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings
from app.models.email_config import EmailConfig

_engine = None
_SessionLocal: Optional[sessionmaker] = None


def _get_session() -> Session:
    global _engine, _SessionLocal
    if _engine is None:
        _engine = create_engine(
            settings.DATABASE_URL_SYNC,
            pool_pre_ping=True,
        )
        _SessionLocal = sessionmaker(bind=_engine, autocommit=False, autoflush=False)
    assert _SessionLocal is not None
    return _SessionLocal()


def get_email_config_sync() -> Optional[EmailConfig]:
    """Load singleton row id=1 or None."""
    session = _get_session()
    try:
        return session.query(EmailConfig).filter(EmailConfig.id == 1).first()
    finally:
        session.close()
