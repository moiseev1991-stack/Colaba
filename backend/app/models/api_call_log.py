"""Лог внешних API-вызовов для учёта стоимости (cost tracking MVP).

Каждая строка — один вызов внешнего платного сервиса (2GIS/SerpAPI/DaData/
OpenAI/Anthropic/Embeddings/2captcha/Hyvor/SMTP/...). Пишется трекером
app.core.api_tracker.log_call() как fire-and-forget: ошибки записи
логируются warning, бизнес-логику не блокируют.

Контекст (user_id/map_search_id/company_id) берётся из contextvars,
выставляемых в Celery-tasks и FastAPI middleware. Все три nullable —
вызов мог случиться вне контекста (разовый CLI, ручной HTTP-запрос).

Тарификация разная:
- per-request (2GIS/SerpAPI/DaData/captcha/email): cost_rub из PROVIDER_PRICING.
- per-token (LLM): cost_rub = prompt_tokens * input_per_1k/1000 +
  completion_tokens * output_per_1k/1000.
- commission (YooKassa): cost_rub = amount_rub * rate.
"""

from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
)

from app.core.database import Base


class ApiCallLog(Base):
    """Один вызов внешнего API. MVP: учёт + аналитика, без квот."""

    __tablename__ = "api_call_log"

    id = Column(BigInteger, primary_key=True)
    created_at = Column(
        DateTime(timezone=True),
        default=datetime.utcnow,
        nullable=False,
        index=True,
    )

    # Контекст (все nullable — вызов может быть вне celery / без юзера).
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    map_search_id = Column(BigInteger, nullable=True, index=True)
    company_id = Column(BigInteger, nullable=True, index=True)

    # Что вызвалось.
    # '2gis' | 'serpapi' | 'dadata' | 'openai' | 'anthropic' | 'openai_emb' |
    # '2captcha' | 'anticaptcha' | 'hyvor' | 'smtp' | 'yookassa' | ...
    provider = Column(String(50), nullable=False, index=True)
    endpoint = Column(String(255), nullable=False)  # URL или sub-endpoint
    method = Column(String(10), nullable=True)  # GET/POST

    # Результат.
    http_status = Column(Integer, nullable=True)
    latency_ms = Column(Integer, nullable=True)
    ok = Column(Boolean, nullable=False, default=True)
    error = Column(Text, nullable=True)

    # Токены (только для LLM-провайдеров; null для per-request API).
    prompt_tokens = Column(Integer, nullable=True)
    completion_tokens = Column(Integer, nullable=True)
    model = Column(String(100), nullable=True)

    # Стоимость в рублях (считается в api_tracker через provider_pricing).
    cost_rub = Column(Numeric(12, 6), nullable=False, default=0)

    def __repr__(self) -> str:
        return (
            f"<ApiCallLog #{self.id} {self.provider!r} "
            f"ok={self.ok} cost={self.cost_rub} ts={self.created_at}>"
        )
