"""company_sources + company_contacts (Phase 1 ТЗ multi-source 2026-06-03)

Revision ID: 028
Revises: 027
Create Date: 2026-06-03

Цель — разнести «одна компания может быть в нескольких источниках» (2GIS + Я.Карты)
на две сущности:
- companies (как «канонический» лид — name/address/coords/агрегаты)
- company_sources (источниковый профиль: source/external_id/rating/reviews_count
  именно из этого источника). Одна компания → 1..N источников.
- company_contacts (контакты привязаны к источниковому профилю, чтобы 2GIS и Я.Карты
  не перетирали друг друга).

Phase 1 — **аддитивная** миграция. Существующие поля companies.* (source, external_id,
rating, phone, website, emails, contacts_extra) остаются — старый код продолжает читать
их без изменений. Backfill наполняет новые таблицы, чтобы их можно было постепенно
начать читать из API/UI в следующих фазах.

reviews.company_id оставлен FK на companies — НЕ переключаем в Phase 1. Добавлена
nullable колонка reviews.company_source_id; backfill заполнит её для всех существующих
отзывов; новый FK добавим в следующей миграции, когда убедимся что всё заполнилось.

В Phase 1 НЕ делается дедупликация (один и тот же бизнес в 2GIS и Я.Картах остаются
двумя companies-записями). Это сделает Phase 2.
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


revision = "028"
down_revision = "027"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ---------- 1. company_sources ----------
    op.create_table(
        "company_sources",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column(
            "company_id",
            sa.BigInteger(),
            sa.ForeignKey("companies.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("source", sa.String(20), nullable=False),       # '2gis' | 'yandex_maps' | 'google'
        sa.Column("external_id", sa.String(255), nullable=False),
        sa.Column("source_url", sa.String(500), nullable=True),    # deeplink на карточку

        # Метрики именно этого источника
        sa.Column("rating", sa.Numeric(3, 2), nullable=True),
        sa.Column("reviews_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("reviews_positive_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("reviews_negative_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("reviews_neutral_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("has_owner_replies", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("owner_replies_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_review_at", sa.DateTime(timezone=True), nullable=True),

        # Уверенность матча при дедупе (Phase 2/3). 1.0 = создан напрямую (1 источник = 1 компания),
        # <1.0 = домерджен по фуззи-матчу к существующей компании.
        sa.Column("match_confidence", sa.Numeric(3, 2), nullable=False, server_default="1.00"),
        sa.Column("matched_by", sa.String(50), nullable=True),   # 'phone' | 'coords' | 'name+city' | 'manual'

        sa.Column("raw_data", JSONB, nullable=True),
        sa.Column("last_parsed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),

        sa.UniqueConstraint("source", "external_id", name="uq_company_sources_source_external_id"),
    )
    # Частый паттерн фильтрации в API: «все источники этой компании»
    op.create_index("ix_company_sources_company_source", "company_sources", ["company_id", "source"])

    # ---------- 2. company_contacts ----------
    op.create_table(
        "company_contacts",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column(
            "company_source_id",
            sa.BigInteger(),
            sa.ForeignKey("company_sources.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        # Денормализованно дублируем company_id и source — для быстрого фильтра
        # без JOIN (поиск «все контакты компании», «все email-ы 2GIS», и т.п.).
        sa.Column(
            "company_id",
            sa.BigInteger(),
            sa.ForeignKey("companies.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("source", sa.String(20), nullable=False, index=True),

        # type: 'phone' | 'email' | 'website' | 'telegram' | 'whatsapp' | 'vk' |
        #       'instagram' | 'facebook' | 'ok' | 'youtube'
        sa.Column("type", sa.String(20), nullable=False),
        sa.Column("value", sa.String(500), nullable=False),

        # «основной» контакт в рамках своего type внутри своего source. У типа phone
        # это первый телефон, у website — основной сайт компании. Используется UI
        # для показа «главного» контакта в превью.
        sa.Column("is_primary", sa.Boolean(), nullable=False, server_default=sa.text("false")),

        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),

        # Не схлопываем контакты МЕЖДУ источниками (это и есть суть ТЗ), но внутри
        # одного источника одно и то же значение одного типа держим один раз.
        sa.UniqueConstraint("company_source_id", "type", "value", name="uq_contact_per_source_type_value"),
    )
    op.create_index("ix_company_contacts_company_type", "company_contacts", ["company_id", "type"])

    # ---------- 3. reviews.company_source_id (nullable пока) ----------
    op.add_column(
        "reviews",
        sa.Column(
            "company_source_id",
            sa.BigInteger(),
            sa.ForeignKey("company_sources.id", ondelete="CASCADE"),
            nullable=True,
        ),
    )
    op.create_index("ix_reviews_company_source_id", "reviews", ["company_source_id"])

    # ---------- 4. Backfill: каждая company → 1 company_sources ----------
    # ВАЖНО: используем server-side SQL (а не Python-цикл), потому что компаний могут
    # быть сотни тысяч. Каждая company берёт свой source/external_id и метрики.
    op.execute(
        """
        INSERT INTO company_sources (
            company_id, source, external_id, rating,
            reviews_count, reviews_positive_count, reviews_negative_count,
            reviews_neutral_count, has_owner_replies, owner_replies_count,
            last_review_at, raw_data, match_confidence, matched_by,
            last_parsed_at, created_at, updated_at
        )
        SELECT
            c.id, c.source, c.external_id, c.rating,
            COALESCE(c.reviews_count, 0),
            COALESCE(c.reviews_positive_count, 0),
            COALESCE(c.reviews_negative_count, 0),
            COALESCE(c.reviews_neutral_count, 0),
            COALESCE(c.has_owner_replies, false),
            COALESCE(c.owner_replies_count, 0),
            c.last_review_at, c.raw_data,
            1.00, 'phase1_backfill',
            c.updated_at, COALESCE(c.created_at, NOW()), COALESCE(c.updated_at, NOW())
        FROM companies c
        WHERE NOT EXISTS (
            SELECT 1 FROM company_sources cs
            WHERE cs.source = c.source AND cs.external_id = c.external_id
        );
        """
    )

    # ---------- 5. Backfill: contacts из companies.* в company_contacts ----------
    # Phone (один основной)
    op.execute(
        """
        INSERT INTO company_contacts (company_source_id, company_id, source, type, value, is_primary)
        SELECT cs.id, c.id, c.source, 'phone', c.phone, true
        FROM companies c
        JOIN company_sources cs ON cs.company_id = c.id AND cs.source = c.source
        WHERE c.phone IS NOT NULL AND c.phone <> ''
        ON CONFLICT (company_source_id, type, value) DO NOTHING;
        """
    )
    # Website
    op.execute(
        """
        INSERT INTO company_contacts (company_source_id, company_id, source, type, value, is_primary)
        SELECT cs.id, c.id, c.source, 'website', c.website, true
        FROM companies c
        JOIN company_sources cs ON cs.company_id = c.id AND cs.source = c.source
        WHERE c.website IS NOT NULL AND c.website <> ''
        ON CONFLICT (company_source_id, type, value) DO NOTHING;
        """
    )
    # Emails (JSON массив → строки)
    op.execute(
        """
        INSERT INTO company_contacts (company_source_id, company_id, source, type, value, is_primary)
        SELECT cs.id, c.id, c.source, 'email', email_val, false
        FROM companies c
        JOIN company_sources cs ON cs.company_id = c.id AND cs.source = c.source
        CROSS JOIN LATERAL jsonb_array_elements_text(c.emails) AS email_val
        WHERE c.emails IS NOT NULL AND jsonb_typeof(c.emails) = 'array'
        ON CONFLICT (company_source_id, type, value) DO NOTHING;
        """
    )
    # contacts_extra → отдельные строки для phones / telegrams / vks / whatsapps / instagrams / facebooks / oks / youtubes
    for key, contact_type in (
        ("phones", "phone"),
        ("telegrams", "telegram"),
        ("vks", "vk"),
        ("whatsapps", "whatsapp"),
        ("instagrams", "instagram"),
        ("facebooks", "facebook"),
        ("oks", "ok"),
        ("youtubes", "youtube"),
    ):
        op.execute(
            f"""
            INSERT INTO company_contacts (company_source_id, company_id, source, type, value, is_primary)
            SELECT cs.id, c.id, c.source, '{contact_type}', val, false
            FROM companies c
            JOIN company_sources cs ON cs.company_id = c.id AND cs.source = c.source
            CROSS JOIN LATERAL jsonb_array_elements_text(c.contacts_extra->'{key}') AS val
            WHERE c.contacts_extra ? '{key}'
              AND jsonb_typeof(c.contacts_extra->'{key}') = 'array'
            ON CONFLICT (company_source_id, type, value) DO NOTHING;
            """
        )

    # ---------- 6. Backfill: reviews.company_source_id ----------
    op.execute(
        """
        UPDATE reviews r
        SET company_source_id = cs.id
        FROM companies c
        JOIN company_sources cs ON cs.company_id = c.id AND cs.source = c.source
        WHERE r.company_id = c.id
          AND r.source = c.source
          AND r.company_source_id IS NULL;
        """
    )


def downgrade() -> None:
    # Откат: удалить новые таблицы и колонку у reviews.
    op.drop_index("ix_reviews_company_source_id", table_name="reviews")
    op.drop_column("reviews", "company_source_id")
    op.drop_index("ix_company_contacts_company_type", table_name="company_contacts")
    op.drop_table("company_contacts")
    op.drop_index("ix_company_sources_company_source", table_name="company_sources")
    op.drop_table("company_sources")
