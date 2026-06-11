"""site_leads + ALTER kp_drafts.company_id nullable + добавление site_lead_id

Revision ID: 034
Revises: 033
Create Date: 2026-06-12

Шаг 7 фокус-релиза «КП-конвейер» (Эпик F ТЗ 2026-06-12) — KP-flow для
сайтов, найденных через web-search.

Изменения:

1. Таблица site_leads — конкретный «лид» с найденным вхождением в
   сниппете поисковой выдачи. Создаётся когда юзер на вкладке «Сайты»
   ищет по entry (например, «© 2021» — заброшенные сайты) и решает
   сохранить результат под КП. Поля по ТЗ Эпика F: id, user_id, query,
   url, domain, snippet, entry, created_at. Плюс опциональные
   search_id (для линковки с источником-поиском из существующего
   searches/SearchResult) и organization_id.

2. kp_drafts.company_id → NULLABLE. Раньше NOT NULL — потому что
   все КП были по компаниям из maps. Теперь КП может быть по site_lead.
   CHECK constraint гарантирует, что заполнен ровно один из ключей.

3. kp_drafts.site_lead_id — FK на site_leads, nullable. Если заполнен,
   company_id должен быть NULL (и наоборот).
"""

from alembic import op
import sqlalchemy as sa


revision = "034"
down_revision = "033"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # --- 1. site_leads -----------------------------------------------------
    op.create_table(
        "site_leads",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "organization_id",
            sa.Integer(),
            sa.ForeignKey("organizations.id", ondelete="SET NULL"),
            nullable=True,
        ),
        # Опциональная ссылка на исходный web-search (если site_lead создан
        # из результата существующего поиска через searches таблицу).
        sa.Column(
            "search_id",
            sa.Integer(),
            sa.ForeignKey("searches.id", ondelete="SET NULL"),
            nullable=True,
        ),
        # Поисковый запрос/preset-метка, которой нашли (например «© 2021»
        # или «Joomla»). До 500 символов — на случай длинных вхождений
        # вроде «доставка по телефону».
        sa.Column("query", sa.String(500), nullable=False),
        # Что именно нашли в сниппете (entry, она же «вхождение» в ТЗ).
        # Часто = query, но юзер может корректировать.
        sa.Column("entry", sa.String(500), nullable=False, server_default=""),
        sa.Column("url", sa.String(2000), nullable=False),
        # Домен — извлекается из URL на стороне сервиса (для дедупа и
        # для отображения «найдено: example.com»). String(255) хватает —
        # max длина домена по RFC 253 символа.
        sa.Column("domain", sa.String(255), nullable=False),
        # Title и snippet из выдачи. Title до 500 — реально бывает 200-300,
        # запас на edge-кейсы. Snippet — Text, без ограничения.
        sa.Column("title", sa.String(500), nullable=True),
        sa.Column("snippet", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
    )
    op.create_index(
        "ix_site_leads_user_created",
        "site_leads",
        ["user_id", "created_at"],
    )
    # Дедуп: один юзер не должен создавать SiteLead по тому же url+entry дважды.
    op.create_index(
        "uq_site_leads_user_url_entry",
        "site_leads",
        ["user_id", "url", "entry"],
        unique=True,
    )

    # --- 2. kp_drafts ALTER: company_id nullable + site_lead_id ------------
    op.alter_column(
        "kp_drafts",
        "company_id",
        existing_type=sa.BigInteger(),
        nullable=True,
    )
    op.add_column(
        "kp_drafts",
        sa.Column(
            "site_lead_id",
            sa.BigInteger(),
            sa.ForeignKey("site_leads.id", ondelete="CASCADE"),
            nullable=True,
        ),
    )
    op.create_index(
        "ix_kp_drafts_site_lead_id",
        "kp_drafts",
        ["site_lead_id"],
    )
    # CHECK: ровно одно из (company_id, site_lead_id) должно быть NOT NULL.
    # NULL XOR логика через WHERE-equivalent: (company_id IS NULL) != (site_lead_id IS NULL).
    op.create_check_constraint(
        "ck_kp_drafts_company_xor_site_lead",
        "kp_drafts",
        "(company_id IS NULL) <> (site_lead_id IS NULL)",
    )


def downgrade() -> None:
    op.drop_constraint(
        "ck_kp_drafts_company_xor_site_lead",
        "kp_drafts",
        type_="check",
    )
    op.drop_index("ix_kp_drafts_site_lead_id", table_name="kp_drafts")
    op.drop_column("kp_drafts", "site_lead_id")
    op.alter_column(
        "kp_drafts",
        "company_id",
        existing_type=sa.BigInteger(),
        nullable=False,
    )

    op.drop_index("uq_site_leads_user_url_entry", table_name="site_leads")
    op.drop_index("ix_site_leads_user_created", table_name="site_leads")
    op.drop_table("site_leads")
