"""backfill: переcчёт companies.city для Yandex-записей через extract_city_from_address

Revision ID: 030
Revises: 029
Create Date: 2026-06-06

Дополнение к фиксу `fix(maps): Yandex — реальный город компании из строки
адреса` (PR #5, commit ee3210f). Тот PR починил парсер — новые компании из
Yandex.Карт теперь получают city из адреса (Чайка под Кунцево → 'Балашиха',
а не 'Москва'). Но уже сохранённые записи в БД остались с city = запрошенный
город — захламляли фильтры по городу, экспорт и outreach.

Алгоритм:
1. SELECT id/city/address всех компаний, у которых хотя бы один company_sources
   указывает на Yandex (не по companies.source — там склеенные с 2GIS компании
   могут иметь source='2gis', но всё равно быть в Яндексе через company_sources).
2. В Python применяем `extract_city_from_address(address, current_city)`.
3. Группируем по new_city → UPDATE ... WHERE id = ANY(...) для каждой группы
   (один батч-апдейт на каждый уникальный «правильный» город — обычно ≤ 100
   городов на всю РФ, дешевле чем per-row update).

Downgrade — no-op: исходное (неверное) city не сохраняем; правильное значение
и так выводится из address при следующем парсинге.
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "030"
down_revision = "029"
branch_labels = None
depends_on = None


# Размер батча на чтение/обработку. 5000 компаний → ~250КБ payload, безопасно
# для памяти и одного коммита. Если в БД 50k Yandex-компаний — 10 итераций.
_BATCH_SIZE = 5000


def upgrade() -> None:
    # Импорт внутри upgrade(), чтобы alembic-ревизия загружалась без app-runtime
    # (например в офлайн-режиме `alembic heads`).
    from app.modules.maps.utils import extract_city_from_address

    conn = op.get_bind()

    select_sql = sa.text(
        """
        SELECT c.id, c.city, c.address
        FROM companies c
        WHERE c.id > :last_id
          AND c.city IS NOT NULL
          AND c.address IS NOT NULL
          AND c.address <> ''
          AND EXISTS (
              SELECT 1 FROM company_sources cs
              WHERE cs.company_id = c.id AND cs.source = 'yandex_maps'
          )
        ORDER BY c.id
        LIMIT :batch_size
        """
    )
    update_sql = sa.text(
        """
        UPDATE companies
        SET city = :city, updated_at = NOW()
        WHERE id = ANY(:ids)
        """
    )

    last_id = 0
    total_scanned = 0
    total_updated = 0
    while True:
        rows = conn.execute(
            select_sql, {"last_id": last_id, "batch_size": _BATCH_SIZE}
        ).fetchall()
        if not rows:
            break

        # Группируем id по «правильному» городу — экономим UPDATE-ы.
        # {new_city: [id, id, ...]}
        by_new_city: dict[str, list[int]] = {}
        for cid, current_city, address in rows:
            new_city = extract_city_from_address(address, current_city)
            if new_city != current_city:
                by_new_city.setdefault(new_city, []).append(cid)

        for new_city, ids in by_new_city.items():
            conn.execute(update_sql, {"city": new_city, "ids": ids})
            total_updated += len(ids)

        total_scanned += len(rows)
        last_id = rows[-1][0]

    # Лог в alembic-вывод — видно в логах prod-деплоя.
    print(
        f"[030_backfill_yandex_city] scanned={total_scanned}, updated={total_updated}"
    )


def downgrade() -> None:
    # No-op: исходные (неверные) city не сохраняли; правильное значение и так
    # выводится из address при следующем парсинге.
    pass
