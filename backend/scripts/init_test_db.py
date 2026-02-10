#!/usr/bin/env python3
"""
Initialize test database schema. Uses sync engine and psycopg2 for reliability in CI.
Creates tables and a test user (id=1) for API tests that use auth override.
Run from backend/ with: PYTHONPATH=. python scripts/init_test_db.py
"""
import sys
from datetime import datetime

from sqlalchemy import create_engine, text

# Load config and models before database module
from app.core.config import settings
import app.models  # noqa: F401 - register all models with Base.metadata
from app.core.database import Base
from app.core.security import hash_password


def main() -> int:
    engine = create_engine(settings.DATABASE_URL_SYNC)
    Base.metadata.create_all(bind=engine)
    # Create test user (id=1) for conftest's auth override - required for searches FK
    with engine.begin() as conn:
        conn.execute(text("""
            INSERT INTO users (id, email, hashed_password, is_active, is_superuser, created_at)
            SELECT 1, 'test@example.com', :pw, true, true, :now
            WHERE NOT EXISTS (SELECT 1 FROM users WHERE id = 1)
        """), {"pw": hash_password("test"), "now": datetime.utcnow()})
    engine.dispose()
    return 0


if __name__ == "__main__":
    sys.exit(main())
