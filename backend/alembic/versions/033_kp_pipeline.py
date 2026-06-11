"""kp_templates + kp_drafts + is_system на user_filter_presets

Revision ID: 033
Revises: 032
Create Date: 2026-06-12

Эпик A фокус-релиза «КП-конвейер» (ТЗ 2026-06-12).

Три изменения в одной ревизии — все три ходят в одном PR/деплое
(модель KP-генерации не работает без обеих таблиц + флага).

1. kp_templates — справочник профилей отправителя (веб-студия / SEO /
   маркетинг / custom). Системные сидируются здесь же data-миграцией;
   organization_id nullable оставлен для будущих кастомных шаблонов
   на уровне организации (сейчас не используется фронтом).

2. kp_drafts — каждый сгенерированный КП. Это и история, и счётчик
   месячных лимитов на тариф (см. Эпик E — лимит считается COUNT'ом
   за период, без отдельного инкремента). arguments_used JSONB хранит
   снимок «на чём построено письмо» (pain_label, quote, trend, source)
   — для блока «Аргументы» в модалке и для аудита.

   company_id NOT NULL — пока. В шаге 7 (миграция для Эпика F, «Сайты»)
   будет ALTER COLUMN DROP NOT NULL + добавление site_lead_id nullable
   + CHECK (company_id IS NOT NULL OR site_lead_id IS NOT NULL).

3. user_filter_presets.is_system — флаг системного пресета. Существующие
   все становятся is_system=false (default false). Системные «Для веб-
   студий / SEO / маркетологов» сидирует отдельная миграция Эпика C
   (создавать здесь нечего, их seed зависит от ai-pain-кластеров и
   зависит от runtime, не от схемы).
"""

from alembic import op
import sqlalchemy as sa


revision = "033"
down_revision = "032"
branch_labels = None
depends_on = None


# Системные шаблоны КП. Текст sender_profile и offer_hint берётся из
# ТЗ 2026-06-12 (Эпик A3). custom — пустой; sender_profile наполняется
# из формы юзера на фронте, в БД его не храним.
SYSTEM_TEMPLATES = [
    {
        "key": "webstudio",
        "title": "Веб-студия / разработка",
        "sender_profile": (
            "веб-студия, делаем сайты, онлайн-запись, интернет-магазины"
        ),
        "offer_hint": (
            "нет сайта / жалобы на запись и дозвон → "
            "предлагаем сайт или модуль записи"
        ),
    },
    {
        "key": "seo",
        "title": "SEO / продвижение",
        "sender_profile": (
            "специалист по продвижению в поиске и на картах"
        ),
        "offer_hint": (
            "рейтинг ниже среднего по нише / мало отзывов → "
            "предлагаем работу с репутацией и видимостью"
        ),
    },
    {
        "key": "marketing",
        "title": "Маркетинг / реклама",
        "sender_profile": (
            "маркетинговое агентство, приводим клиентов"
        ),
        "offer_hint": (
            "растущий негатив / отток клиентов → "
            "предлагаем удержание и привлечение"
        ),
    },
    {
        "key": "custom",
        "title": "Свой вариант",
        # custom — sender_profile задаёт сам юзер в модалке; в БД
        # держим пустую заготовку чтобы /outreach/kp/templates отдавал
        # запись (фронт показывает её в селекте с пометкой «свой текст»).
        "sender_profile": "",
        "offer_hint": "",
    },
]


def upgrade() -> None:
    # --- 1. kp_templates ----------------------------------------------------
    op.create_table(
        "kp_templates",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        # Стабильный machine-readable ключ ('webstudio', 'seo', ...).
        # По нему фронт ссылается из селекта; по нему ищем шаблон в
        # /outreach/kp/generate. Уникален среди системных + пользовательских.
        sa.Column("key", sa.String(40), nullable=False),
        sa.Column("title", sa.String(120), nullable=False),
        # Профиль отправителя — кладётся в промпт LLM как «ты пишешь
        # от лица: {sender_profile}». Текст, потому что длинные кастомные
        # могут пойти на 1-2 предложения.
        sa.Column("sender_profile", sa.Text(), nullable=False, server_default=""),
        # Подсказка по офферу: что именно предлагать в зависимости от
        # обнаруженной боли. Тоже идёт в промпт (см. A4).
        sa.Column("offer_hint", sa.Text(), nullable=False, server_default=""),
        sa.Column(
            "is_system",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
        sa.Column(
            "organization_id",
            sa.Integer(),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
        # Системные шаблоны: key уникален глобально (organization_id IS NULL).
        # Пользовательские: key уникален в рамках своей организации.
        # Реализовано через два partial unique index ниже.
    )
    # Глобальная уникальность системных ключей.
    op.execute(
        "CREATE UNIQUE INDEX uq_kp_templates_system_key "
        "ON kp_templates (key) WHERE is_system = true"
    )
    # Per-org уникальность пользовательских ключей (на будущее).
    op.execute(
        "CREATE UNIQUE INDEX uq_kp_templates_org_key "
        "ON kp_templates (organization_id, key) WHERE is_system = false"
    )

    # --- 2. Seed 4 системных шаблона ---------------------------------------
    kp_templates = sa.table(
        "kp_templates",
        sa.column("key", sa.String),
        sa.column("title", sa.String),
        sa.column("sender_profile", sa.Text),
        sa.column("offer_hint", sa.Text),
        sa.column("is_system", sa.Boolean),
    )
    op.bulk_insert(
        kp_templates,
        [
            {
                "key": t["key"],
                "title": t["title"],
                "sender_profile": t["sender_profile"],
                "offer_hint": t["offer_hint"],
                "is_system": True,
            }
            for t in SYSTEM_TEMPLATES
        ],
    )

    # --- 3. kp_drafts ------------------------------------------------------
    op.create_table(
        "kp_drafts",
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
        # company_id NOT NULL пока — в миграции Эпика F (шаг 7 порядка
        # выполнения) сюда добавится site_lead_id и company_id станет
        # nullable + CHECK что хотя бы одно из них заполнено.
        sa.Column(
            "company_id",
            sa.BigInteger(),
            sa.ForeignKey("companies.id", ondelete="CASCADE"),
            nullable=False,
        ),
        # Не FK на kp_templates.key — кастомные шаблоны юзера хранят
        # 'custom', а ссылаться на конкретную строку нет смысла. Хватает
        # текстового ключа для аудита «какой профиль был выбран».
        sa.Column("template_key", sa.String(40), nullable=False),
        sa.Column("subject", sa.String(500), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        # JSONB-снимок «на чём построено письмо» — pain_label, quote,
        # trend (rising/stable/falling + период), source (2gis/yandex_maps/
        # google), benchmark (если был), sender_profile, offer_hint.
        # Используется фронтом в блоке «Аргументы» под письмом.
        sa.Column(
            "arguments_used",
            sa.dialects.postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
    )
    # По юзеру и времени — основной запрос «КП этого юзера за месяц»
    # для счётчика лимитов (Эпик E).
    op.create_index(
        "ix_kp_drafts_user_created",
        "kp_drafts",
        ["user_id", "created_at"],
    )
    # По компании — история «какие КП мы уже писали этой компании».
    op.create_index(
        "ix_kp_drafts_company_id",
        "kp_drafts",
        ["company_id"],
    )

    # --- 4. user_filter_presets.is_system ----------------------------------
    op.add_column(
        "user_filter_presets",
        sa.Column(
            "is_system",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    # Индекс — потому что фронт фильтрует «is_system = true» при
    # подтягивании системных пресетов.
    op.create_index(
        "ix_user_filter_presets_is_system",
        "user_filter_presets",
        ["is_system"],
    )


def downgrade() -> None:
    # 4
    op.drop_index(
        "ix_user_filter_presets_is_system",
        table_name="user_filter_presets",
    )
    op.drop_column("user_filter_presets", "is_system")

    # 3
    op.drop_index("ix_kp_drafts_company_id", table_name="kp_drafts")
    op.drop_index("ix_kp_drafts_user_created", table_name="kp_drafts")
    op.drop_table("kp_drafts")

    # 1
    op.execute("DROP INDEX IF EXISTS uq_kp_templates_org_key")
    op.execute("DROP INDEX IF EXISTS uq_kp_templates_system_key")
    op.drop_table("kp_templates")
