"""
Database connection and session management.

Использует SQLAlchemy 2.0+ async для работы с PostgreSQL.
"""

import sys
from typing import AsyncGenerator

from sqlalchemy import create_engine
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import Session, declarative_base, sessionmaker
from sqlalchemy.pool import NullPool

from app.core.config import settings

# В Celery-воркере каждая задача делает `asyncio.run(...)` со свежим event loop,
# а asyncpg-коннекшены прибиты к event loop'у. Если оставить обычный пул, второй
# таск переиспользует «мёртвый» коннекшен прошлой задачи и получает
# `cannot perform operation: another operation is in progress`.
# Поэтому в Celery — NullPool (свежий коннекшен на каждую сессию). В FastAPI/uvicorn
# одноразовый event loop живёт всё время процесса — там пул работает корректно и нужен.
_IS_CELERY = any("celery" in (arg or "").lower() for arg in (sys.argv or []))

# Create async engine. Use NullPool in test env to avoid "another operation in progress" with pytest.
engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,  # Log SQL queries in debug mode
    future=True,
    poolclass=NullPool if (settings.ENVIRONMENT == "test" or _IS_CELERY) else None,
)

# Create async session factory
AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)

# Base class for models
Base = declarative_base()


# Sync engine + session — для редких мест где async невозможен
# (например чтение ключей провайдеров в sync __init__). Создаётся лениво.
_sync_engine = None
_sync_session_factory = None


def get_sync_session_factory():
    """Lazy-init sync engine. DATABASE_URL_SYNC обязателен в .env."""
    global _sync_engine, _sync_session_factory
    if _sync_session_factory is None:
        sync_url = settings.DATABASE_URL_SYNC
        if not sync_url:
            raise RuntimeError("DATABASE_URL_SYNC must be set for sync DB access")
        _sync_engine = create_engine(sync_url, pool_pre_ping=True, future=True)
        _sync_session_factory = sessionmaker(
            _sync_engine, class_=Session, expire_on_commit=False, autocommit=False
        )
    return _sync_session_factory


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    Dependency для получения async database session.
    
    Yields:
        AsyncSession: Async database session
    
    Usage:
        @router.get("/users")
        async def get_users(db: AsyncSession = Depends(get_db)):
            ...
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()


async def init_db() -> None:
    """
    Инициализация базы данных.
    
    Создает все таблицы из моделей (если не существуют).
    Используется при старте приложения.
    """
    # Import models here to ensure they are registered with Base
    # from app.models import User, Organization, ...
    
    async with engine.begin() as conn:
        # Create all tables
        await conn.run_sync(Base.metadata.create_all)


async def close_db() -> None:
    """Закрытие подключения к базе данных."""
    await engine.dispose()
