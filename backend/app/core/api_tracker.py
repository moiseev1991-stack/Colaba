"""Трекер внешних API-вызовов для учёта стоимости (cost tracking MVP).

Архитектура:
1. contextvars хранят контекст текущего вызова (user_id/map_search_id/
   company_id). Выставляются одним set_call_context() в начале Celery-task
   или FastAPI middleware.
2. log_call() — точка входа из мест вызова внешних API (провайдеры карт,
   LLM-клиент, DaData, email, captcha). Fire-and-forget: ошибка записи
   логируется warning, бизнес-логику НЕ блокирует.
3. Стоимость считается через provider_pricing.compute_cost_rub().

Запись идёт через собственную short-lived async-сессию (не тащим db
в каждую точку вызова). В Celery contextvars работают корректно —
каждый task получает свой context.

Вне celery/http-контекста (например CLI) все три contextvars = None,
вызов всё равно логируется с пустым контекстом (provider + cost известны).
"""

from __future__ import annotations

import contextvars
import logging
import random
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.core.provider_pricing import compute_cost_rub
from app.models.api_call_log import ApiCallLog

logger = logging.getLogger(__name__)

# ────────────────────────────────────────────────────────────────────
# Контекст вызова (contextvars)
# ────────────────────────────────────────────────────────────────────

_current_user_id: contextvars.ContextVar[Optional[int]] = contextvars.ContextVar(
    "current_user_id", default=None
)
_current_map_search_id: contextvars.ContextVar[Optional[int]] = contextvars.ContextVar(
    "current_map_search_id", default=None
)
_current_company_id: contextvars.ContextVar[Optional[int]] = contextvars.ContextVar(
    "current_company_id", default=None
)


def set_call_context(
    *,
    user_id: Optional[int] = None,
    map_search_id: Optional[int] = None,
    company_id: Optional[int] = None,
) -> None:
    """Выставляет контекст вызова для последующих log_call().

    Вызывается в начале Celery-task или FastAPI middleware. Значения None
    не перезаписывают уже выставленные (поле None → игнор), чтобы вложенные
    задачи не затирали контекст родителя. Для явного сброса используйте
    reset_call_context().
    """
    if user_id is not None:
        _current_user_id.set(user_id)
    if map_search_id is not None:
        _current_map_search_id.set(map_search_id)
    if company_id is not None:
        _current_company_id.set(company_id)


def reset_call_context() -> None:
    """Полный сброс контекста (для тестов / явного обнуления)."""
    _current_user_id.set(None)
    _current_map_search_id.set(None)
    _current_company_id.set(None)


def get_call_context() -> dict:
    """Возвращает текущий контекст (для отладки/логирования)."""
    return {
        "user_id": _current_user_id.get(),
        "map_search_id": _current_map_search_id.get(),
        "company_id": _current_company_id.get(),
    }


# ────────────────────────────────────────────────────────────────────
# Запись в api_call_log
# ────────────────────────────────────────────────────────────────────


async def log_call(
    provider: str,
    endpoint: str,
    *,
    method: Optional[str] = None,
    http_status: Optional[int] = None,
    latency_ms: Optional[int] = None,
    ok: bool = True,
    error: Optional[str] = None,
    prompt_tokens: Optional[int] = None,
    completion_tokens: Optional[int] = None,
    model: Optional[str] = None,
    amount_rub: Optional[float] = None,
    # Явный override контекста (когда contextvars не подходят)
    user_id: Optional[int] = None,
    map_search_id: Optional[int] = None,
    company_id: Optional[int] = None,
) -> None:
    """Fire-and-forget запись одного вызова внешнего API в api_call_log.

    Все ошибки ловит и логирует warning — НЕ поднимает. Стоимость
    считается автоматически через provider_pricing по provider + tokens.

    Контекст берётся из contextvars если не передан явно.
    """
    # Глобальный kill-switch + sample-rate.
    if not settings.EXTERNAL_API_TRACKING_ENABLED:
        return
    if settings.EXTERNAL_API_TRACKING_SAMPLE_RATE < 1.0:
        if random.random() > settings.EXTERNAL_API_TRACKING_SAMPLE_RATE:
            return

    # Контекст: явный параметр имеет приоритет над contextvar.
    ctx_user_id = user_id if user_id is not None else _current_user_id.get()
    ctx_search_id = (
        map_search_id if map_search_id is not None else _current_map_search_id.get()
    )
    ctx_company_id = (
        company_id if company_id is not None else _current_company_id.get()
    )

    # Стоимость.
    cost = compute_cost_rub(
        provider,
        tokens_in=prompt_tokens or 0,
        tokens_out=completion_tokens or 0,
        amount_rub=amount_rub,
    )

    row = ApiCallLog(
        user_id=ctx_user_id,
        map_search_id=ctx_search_id,
        company_id=ctx_company_id,
        provider=provider,
        endpoint=endpoint[:255],
        method=method,
        http_status=http_status,
        latency_ms=latency_ms,
        ok=ok,
        error=(error[:500] if error else None),
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
        model=model,
        cost_rub=cost,
    )

    # Своя short-lived сессия — изолирована от бизнес-транзакции caller'а.
    try:
        async with AsyncSessionLocal() as session:
            session.add(row)
            await session.commit()
    except Exception as e:
        # Трекер НИКОГДА не должен валить бизнес-логику.
        logger.warning(
            "api_tracker.log_call(%s %s) failed: %s",
            provider,
            endpoint[:80],
            e,
        )


async def log_call_session(
    session: AsyncSession,
    provider: str,
    endpoint: str,
    **kwargs,
) -> None:
    """Вариант log_call с передачей существующей сессии (если caller уже
    в транзакции и хочет атомарность с бизнес-операцией). Используется
    редко; основной путь — log_call() с собственной сессией.
    """
    if not settings.EXTERNAL_API_TRACKING_ENABLED:
        return
    if settings.EXTERNAL_API_TRACKING_SAMPLE_RATE < 1.0:
        if random.random() > settings.EXTERNAL_API_TRACKING_SAMPLE_RATE:
            return

    ctx_user_id = kwargs.pop("user_id", None) or _current_user_id.get()
    ctx_search_id = kwargs.pop("map_search_id", None) or _current_map_search_id.get()
    ctx_company_id = kwargs.pop("company_id", None) or _current_company_id.get()

    prompt_tokens = kwargs.get("prompt_tokens")
    completion_tokens = kwargs.get("completion_tokens")
    amount_rub = kwargs.get("amount_rub")
    cost = compute_cost_rub(
        provider,
        tokens_in=prompt_tokens or 0,
        tokens_out=completion_tokens or 0,
        amount_rub=amount_rub,
    )

    row = ApiCallLog(
        user_id=ctx_user_id,
        map_search_id=ctx_search_id,
        company_id=ctx_company_id,
        provider=provider,
        endpoint=endpoint[:255],
        method=kwargs.get("method"),
        http_status=kwargs.get("http_status"),
        latency_ms=kwargs.get("latency_ms"),
        ok=kwargs.get("ok", True),
        error=(kwargs.get("error") or "")[:500] or None,
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
        model=kwargs.get("model"),
        cost_rub=cost,
    )
    try:
        session.add(row)
        await session.flush()
    except Exception as e:
        logger.warning(
            "api_tracker.log_call_session(%s %s) failed: %s",
            provider,
            endpoint[:80],
            e,
        )
