"""personal org for existing users without one

Revision ID: 055
Revises: 054
Create Date: 2026-08-03

Ретроактивный фикс: создаёт личные организации для существующих юзеров,
у которых их нет. С этого коммита register_user и OAuth создают org
автоматически (см. organizations.service.ensure_user_has_personal_organization),
а миграция покрывает «исторические» аккаунты.

Критерии отбора юзеров для создания org:
- есть в users
- НЕТ записи в user_organizations
- is_superuser = false  (суперпользователям org не нужна —
  get_current_organization_id для них шорткатится в None)
- email НЕ похож на тестовый (исключаем @test.example.com, maps_router_*,
  map_test_* — это технические аккаунты, создаваемые maps-роутером в
  автотестах/прогревах; орги для них = мусор в БД).

Для каждого подходящего юзера:
1. INSERT в organizations (name = 'Личный кабинет <email>', уникально).
2. INSERT в user_organizations (role = OWNER).

Идемпотентно: повторный прогон безопасен (where NOT EXISTS в user_organizations).
"""

from typing import Sequence, Union

from alembic import op

revision: str = "055"
down_revision: Union[str, None] = "054"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Создаём личные orgи только для реальных не-superuser юзеров без org.
    # Один INSERT...SELECT покрывает и organizations, и user_organizations
    # через CTE — атомарно и без дублирования имён.
    op.execute(
        """
        WITH new_orgs AS (
            INSERT INTO organizations (name, created_at)
            SELECT
                'Личный кабинет ' || u.email,
                now()
            FROM users u
            WHERE NOT EXISTS (
                SELECT 1 FROM user_organizations uo WHERE uo.user_id = u.id
            )
              AND u.is_superuser = false
              AND u.email NOT LIKE '%@test.example.com'
              AND u.email NOT LIKE 'maps_router_%'
              AND u.email NOT LIKE 'map_test_%'
            RETURNING id, name
        ),
        user_for_org AS (
            -- Сопоставляем созданную org обратно с юзером по имени
            -- (name = 'Личный кабинет <email>' → уникально, т.к. email уникален).
            SELECT
                no.id AS organization_id,
                no.name,
                regexp_replace(no.name, '^Личный кабинет ', '') AS email
            FROM new_orgs no
        )
        INSERT INTO user_organizations (user_id, organization_id, role, created_at)
        SELECT
            u.id,
            ufo.organization_id,
            'OWNER',
            now()
        FROM user_for_org ufo
        JOIN users u ON u.email = ufo.email
        """
    )


def downgrade() -> None:
    # Удаляем только те orgи, что создала эта миграция (по шаблону имени),
    # вместе со связями. Каскад по organizations не настроен на user_organizations,
    # поэтому чистим обе таблицы явно.
    op.execute(
        """
        DELETE FROM user_organizations
        WHERE organization_id IN (
            SELECT id FROM organizations WHERE name LIKE 'Личный кабинет %'
        )
        """
    )
    op.execute("DELETE FROM organizations WHERE name LIKE 'Личный кабинет %'")
