"""SiteLead — сохранённый результат web-поиска под КП-генерацию.

Эпик F фокус-релиза «КП-конвейер» (миграция 034). Создаётся когда юзер
на вкладке «Сайты» нашёл по вхождению (entry) интересный сайт и решил
сохранить его как лид. Дальше из drawer'а / списка можно сгенерировать
КП по этому SiteLead — KpDraft получает site_lead_id и пустой company_id
(CHECK ck_kp_drafts_company_xor_site_lead гарантирует XOR).

domain хранится отдельно от URL — для дедупа и быстрых выборок
«все лиды на одном домене».
"""

from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
)

from app.core.database import Base


class SiteLead(Base):
    __tablename__ = "site_leads"

    id = Column(BigInteger, primary_key=True)
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    organization_id = Column(
        Integer,
        ForeignKey("organizations.id", ondelete="SET NULL"),
        nullable=True,
    )
    search_id = Column(
        Integer,
        ForeignKey("searches.id", ondelete="SET NULL"),
        nullable=True,
    )
    query = Column(String(500), nullable=False)
    entry = Column(String(500), nullable=False, default="")
    url = Column(String(2000), nullable=False)
    domain = Column(String(255), nullable=False)
    title = Column(String(500), nullable=True)
    snippet = Column(Text, nullable=True)
    created_at = Column(
        DateTime(timezone=True),
        default=datetime.utcnow,
        nullable=False,
    )

    def __repr__(self) -> str:
        return (
            f"<SiteLead #{self.id} user={self.user_id} {self.domain!r} "
            f"entry={self.entry!r}>"
        )
