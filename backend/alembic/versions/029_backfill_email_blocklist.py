"""backfill: вычищаем placeholder-email из companies.emails и company_contacts

Revision ID: 029
Revises: 028
Create Date: 2026-06-05

Дополнение к фиксу `fix(maps): фильтр placeholder-email 2GIS` (commit d61a297).
Тот PR починил парсер 2GIS — теперь новые компании сохраняются без
`help@2gis.ru` и компании из EMAIL_DOMAIN_BLOCKLIST. Но уже сохранённые
записи в БД остались с мусором — захламляли drawer, csv-экспорт и outreach.

Чистим два места:
1. `companies.emails` (JSONB array of strings) — фильтруем массив, NULL'им
   опустевшие.
2. `company_contacts` WHERE type='email' (отдельные строки) — DELETE.

Блоклист синхронизирован с `app/modules/maps/enrich.py`:
- _EMAIL_EXACT_BLOCKLIST: help@2gis.ru, info@2gis.com, support@2gis.ru, noreply@2gis.ru
- _EMAIL_DOMAIN_BLOCKLIST: 2gis.ru, 2gis.com, sentry.io, wixpress.com, wordpress.com,
  godaddy.com, tilda.cc, tildacdn.com, tinkoff.ru, example.com, test.com, domain.com

Downgrade — no-op: удалённые данные не восстановить, да и они были мусором.
"""

from __future__ import annotations

from alembic import op


revision = "029"
down_revision = "028"
branch_labels = None
depends_on = None


# Источник истины — enrich.py. Если там расширят блоклист — обновить здесь и
# при следующем деплое миграция почистит свежий мусор.
EXACT_BLOCKLIST = (
    "help@2gis.ru",
    "info@2gis.com",
    "support@2gis.ru",
    "noreply@2gis.ru",
)

DOMAIN_BLOCKLIST = (
    "2gis.ru", "2gis.com",
    "sentry.io", "wixpress.com", "wordpress.com", "godaddy.com",
    "tilda.cc", "tildacdn.com", "tinkoff.ru",
    "example.com", "test.com", "domain.com",
)


def _sql_in_list(values: tuple[str, ...]) -> str:
    """Сериализует ('a', 'b') → "'a', 'b'" для inline-подстановки в SQL.
    Безопасно — значения литералы из кода, не user input."""
    return ", ".join(f"'{v}'" for v in values)


def upgrade() -> None:
    exact_in = _sql_in_list(EXACT_BLOCKLIST)
    domain_in = _sql_in_list(DOMAIN_BLOCKLIST)

    # 1) companies.emails — JSONB array. Фильтруем массив, опустевшие → NULL.
    op.execute(f"""
        UPDATE companies
        SET emails = COALESCE(
            NULLIF(
                (
                    SELECT jsonb_agg(e)
                    FROM jsonb_array_elements_text(emails) AS e
                    WHERE lower(e) NOT IN ({exact_in})
                      AND split_part(lower(e), '@', 2) NOT IN ({domain_in})
                ),
                '[]'::jsonb
            ),
            NULL
        )
        WHERE emails IS NOT NULL
          AND jsonb_typeof(emails) = 'array';
    """)

    # 2) company_contacts (Phase 3 multi-source) — отдельные строки.
    op.execute(f"""
        DELETE FROM company_contacts
        WHERE type = 'email'
          AND (
            lower(value) IN ({exact_in})
            OR split_part(lower(value), '@', 2) IN ({domain_in})
          );
    """)


def downgrade() -> None:
    # No-op: удалённые placeholder-адреса не восстановить, да и не нужно —
    # фильтр в провайдерах больше их не пропустит.
    pass
