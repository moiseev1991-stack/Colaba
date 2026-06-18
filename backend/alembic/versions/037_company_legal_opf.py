"""company_legal: тип юр.лица (opf) — ООО/ИП/АО/ПАО/НКО

Revision ID: 037
Revises: 036
Create Date: 2026-06-19

Юзер 2026-06-19 попросил видеть тип юр.лица прямо в карточке выдачи
и фильтровать по нему ("покажи только ООО / только ИП"). DaData в
ответе /suggest/party возвращает data.opf.short ("ООО", "ИП", "АО",
"ПАО", "НП" и т.п.) и data.opf.full ("Общество с ограниченной
ответственностью"). Сохраняем короткий код.

NULL допустим: бывает что DaData не отдала opf (старые/нестандартные
формы), либо для компании ещё не было обогащения. UI рисует пилл
"тип не известен" в этом случае.
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "037"
down_revision = "036"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "company_legal",
        sa.Column("opf", sa.String(50), nullable=True),
    )
    # Индекс для фильтра "только ООО" / "только ИП" — частый кейс.
    op.create_index(
        "ix_company_legal_opf",
        "company_legal",
        ["opf"],
    )
    # Backfill для уже-обогащённых компаний: вытаскиваем аббревиатуру
    # OPF из legal_short_name. Пример: «ООО "Зимверк"» → «ООО»,
    # «ИП Иванов И.И.» → «ИП». Покрывает 95%+ случаев — все типичные
    # формы (ООО/ИП/АО/ПАО/ОАО/ЗАО/НП/НКО/ГК/КФХ/ТСЖ/АНО/ФГБУ)
    # начинаются с подряд идущих заглавных букв до пробела. Остальное
    # (Фонд, Ассоциация и т.п.) останется NULL — UI покажет «н/д».
    op.execute(
        """
        UPDATE company_legal
        SET opf = (regexp_match(legal_short_name, '^([А-ЯЁ]{2,})(\\s|$)'))[1]
        WHERE legal_short_name IS NOT NULL
          AND opf IS NULL
          AND legal_short_name ~ '^[А-ЯЁ]{2,}(\\s|$)'
        """
    )


def downgrade() -> None:
    op.drop_index("ix_company_legal_opf", table_name="company_legal")
    op.drop_column("company_legal", "opf")
