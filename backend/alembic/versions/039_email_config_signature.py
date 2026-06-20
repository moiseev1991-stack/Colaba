"""email_config: подпись и логотип отправителя для HTML-писем

Revision ID: 039
Revises: 038
Create Date: 2026-06-21

До этой миграции КП уходили как plain-text (что лежит в kp_drafts.body).
Теперь tasks.py рендерит markdown тела в HTML и оборачивает его в шаблон
с подвалом «подпись + логотип» — поля берутся из email_config (синглтон id=1).

Все три поля nullable: пока юзер не заполнил подпись/лого, рендерер просто
не показывает футер (письмо уходит как было — markdown→HTML + plain-text fallback).
"""

from alembic import op
import sqlalchemy as sa


revision = "039"
down_revision = "038"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Полноценная HTML-подпись (либо markdown с поддержкой ссылок/жирного).
    # Хранится как-есть, рендерер прогоняет через bleach + markdown,
    # см. kp_html_renderer.render_signature().
    op.add_column(
        "email_config",
        sa.Column(
            "sender_signature_html",
            sa.Text(),
            nullable=True,
            server_default=sa.text("''"),
        ),
    )
    # URL логотипа — отображается в шапке письма. Может быть http(s):// или
    # data:image (для embedded SVG/PNG). На фронте — uploader (TODO позже),
    # пока юзер вводит URL вручную.
    op.add_column(
        "email_config",
        sa.Column(
            "sender_logo_url",
            sa.String(500),
            nullable=True,
            server_default=sa.text("''"),
        ),
    )
    # Brand-цвет для тонкой акцент-полосы под шапкой. Hex (#RRGGBB).
    # Дефолт пустой — рендерер берёт мягкий серый.
    op.add_column(
        "email_config",
        sa.Column(
            "sender_brand_color",
            sa.String(20),
            nullable=True,
            server_default=sa.text("''"),
        ),
    )


def downgrade() -> None:
    op.drop_column("email_config", "sender_brand_color")
    op.drop_column("email_config", "sender_logo_url")
    op.drop_column("email_config", "sender_signature_html")
