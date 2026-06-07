"""Юр.данные компаний — обогащение через DaData (Блок 2 ТЗ 2026-06-02).

Миграция 027. Одна запись на компанию (unique company_id). Если матч не
найден — всё равно сохраняем строку с status='not_found' чтобы не
дёргать DaData повторно при каждой попытке.

Используется в:
- maps/legal_enrich.py — обогащение
- maps/website_leads_export.py — колонки ИНН/Оборот/Возраст в Excel
- maps/filters.py — фильтр «Платёжеспособные»
- maps/router.py — endpoint детали компании (badge в drawer)
"""

from datetime import date, datetime

from sqlalchemy import (
    BigInteger,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
)
from sqlalchemy.dialects.postgresql import JSONB

from app.core.database import Base


class CompanyLegal(Base):
    __tablename__ = "company_legal"

    id = Column(BigInteger, primary_key=True)
    company_id = Column(
        BigInteger,
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )

    # Идентификация.
    inn = Column(String(12), index=True)
    ogrn = Column(String(20))
    kpp = Column(String(12))
    legal_name = Column(String(500))
    legal_short_name = Column(String(300))

    # Метрики бизнеса.
    registration_date = Column(Date)
    revenue = Column(Numeric(14, 2))
    employee_count = Column(Integer)
    legal_status = Column(String(20))  # active | liquidating | ...
    okved = Column(String(20))
    okved_name = Column(String(300))

    # ЛПР: ФИО руководителя из DaData (data.management.name) + должность
    # (data.management.post). По ним подставляем «Здравствуйте, Иван!»
    # в outreach-письма и отображаем «ЛПР: Иванов И.И., директор» в drawer.
    # Бесплатный тариф DaData отдаёт это поле для большинства ООО.
    # founders_json — массив учредителей (data.founders) для будущего
    # отображения «кто реально владеет», сейчас просто кэшируем.
    director_name = Column(String(200))
    director_post = Column(String(200))
    founders_json = Column(JSONB)

    # Матчинг.
    match_confidence = Column(Numeric(3, 2))
    matched_by = Column(String(20))  # phone | name_address | inn | manual
    source = Column(String(20), nullable=False, default="dadata")
    raw_json = Column(JSONB)

    status = Column(String(20), nullable=False, default="ok")  # ok|not_found|error

    created_at = Column(
        DateTime(timezone=True),
        default=datetime.utcnow,
        nullable=False,
    )
    updated_at = Column(
        DateTime(timezone=True),
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )

    @property
    def age_years(self) -> int | None:
        """Возраст компании в полных годах от даты регистрации."""
        if not self.registration_date:
            return None
        today = date.today()
        years = today.year - self.registration_date.year
        if (today.month, today.day) < (
            self.registration_date.month,
            self.registration_date.day,
        ):
            years -= 1
        return max(years, 0)
