"""ЛПР компании, извлечённые со страниц сайта, VK, hh.ru, ЕГРЮЛ (ТЗ A.2 2026-06-04
+ ТЗ «Маркетинг-ЛПР Finder» 2026-06-20).

Миграция 032 (базовые поля) + 049 (role_category / is_marketing_dm / contact_*
/ egrn_matches_founder). Одна запись на (компанию, ФИО).

Источники (поле source):
- website_team / website_about / website_contacts — LLM-извлечение со страниц сайта;
- vk — контакты сообщества/админы VK (модуль maps/vk_enrich.py);
- hh — контактное лицо из вакансии hh.ru (maps/hh_enrich.py);
- egrul_director — руководитель из DaData (data.management);
- egrul_founder — учредитель из DaData (data.founders);
- egrn — собственник помещения (Росреестр). Заготовка, парсера пока нет.

is_decision_maker=True для ролей в whitelist (директор/владелец/маркетолог/...).
is_marketing_dm=True — целевой ЛПР по маркетингу: выбирается оркестратором
enrich_marketing_dm по приоритету marketing > founder/owner > management > confidence.
Ровно ОДНА запись на компанию помечена как is_marketing_dm=True (либо ни одной,
если ничего не нашлось).

role_category — грубая категория для быстрой фильтрации в UI/Excel и в выборе
best-DM: 'marketing' | 'owner' | 'founder' | 'management' | 'hr' | 'other'.
NULL для legacy-записей (миграция 049 не выставляет back-fill).

contact_type / contact_value — публичный рабочий канал персоны
(vk / email / phone / site). NULL если известны только ФИО+роль.
"""

from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Numeric,
    String,
)

from app.core.database import Base


class CompanyDecisionMaker(Base):
    __tablename__ = "company_decision_makers"

    id = Column(BigInteger, primary_key=True)
    company_id = Column(
        BigInteger,
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name = Column(String(200), nullable=False)
    post = Column(String(200), nullable=True)
    # Источник: website_team | website_about | website_contacts | vk | hh
    # | egrul_director | egrul_founder | egrn. Хранится строкой, чтобы
    # можно было добавлять источники без миграций.
    source = Column(String(40), nullable=False)
    source_url = Column(String(1000), nullable=True)
    confidence = Column(Numeric(3, 2), nullable=False, default=0.5)
    is_decision_maker = Column(Boolean, nullable=False, default=True)

    # marketing | owner | founder | management | hr | other. NULL для legacy.
    role_category = Column(String(20), nullable=True, index=True)
    # Целевой ЛПР по маркетингу — ровно один на компанию.
    is_marketing_dm = Column(Boolean, nullable=False, default=False)
    # Публичный рабочий канал персоны: vk | email | phone | site.
    contact_type = Column(String(20), nullable=True)
    contact_value = Column(String(500), nullable=True)
    # ЕГРН: совпал ли собственник помещения с учредителем ЕГРЮЛ.
    # NULL — сверка не проводилась (либо ЕГРН-источника нет, либо ФИО не совпало).
    egrn_matches_founder = Column(Boolean, nullable=True)

    created_at = Column(
        DateTime(timezone=True),
        default=datetime.utcnow,
        nullable=False,
    )
