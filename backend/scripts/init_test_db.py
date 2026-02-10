#!/usr/bin/env python3
"""
Initialize test database schema. Uses sync engine and psycopg2 for reliability in CI.
Run from backend/ with: PYTHONPATH=. python scripts/init_test_db.py
"""
import sys

from sqlalchemy import create_engine

# Load config and models before database module
from app.core.config import settings
import app.models  # noqa: F401 - register all models with Base.metadata
from app.core.database import Base

def main() -> int:
    engine = create_engine(settings.DATABASE_URL_SYNC)
    Base.metadata.create_all(bind=engine)
    engine.dispose()
    return 0

if __name__ == "__main__":
    sys.exit(main())
