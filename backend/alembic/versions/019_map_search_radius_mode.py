"""map_searches: режим поиска по радиусу от точки

Revision ID: 019
Revises: 018
Create Date: 2026-05-30

Добавляет поддержку «конкурентного режима» — поиска компаний в радиусе
X метров от заданного адреса. Используется как альтернатива поиску
по городу (mode='city' старое поведение, mode='radius' новое).

Поля:
- mode: 'city' | 'radius'
- address: исходный адрес от юзера (для отображения)
- point_lat, point_lng: геокодированные координаты центра радиуса
- radius_meters: радиус 500..15000

При mode='radius' поле city продолжает заполняться — туда кладётся
город из геокода (для pain_tags по (niche, city)).
"""

from alembic import op
import sqlalchemy as sa


revision = "019"
down_revision = "018"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "map_searches",
        sa.Column(
            "mode",
            sa.String(20),
            nullable=False,
            server_default="city",
        ),
    )
    op.add_column(
        "map_searches",
        sa.Column("address", sa.String(500), nullable=True),
    )
    op.add_column(
        "map_searches",
        sa.Column("point_lat", sa.Numeric(9, 6), nullable=True),
    )
    op.add_column(
        "map_searches",
        sa.Column("point_lng", sa.Numeric(9, 6), nullable=True),
    )
    op.add_column(
        "map_searches",
        sa.Column("radius_meters", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("map_searches", "radius_meters")
    op.drop_column("map_searches", "point_lng")
    op.drop_column("map_searches", "point_lat")
    op.drop_column("map_searches", "address")
    op.drop_column("map_searches", "mode")
