"""
Rate limiting middleware for FastAPI using slowapi.

Uses Redis as the backend storage for rate limit counters.
"""

import logging

from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from fastapi import Request
from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)


def get_client_ip(request: Request) -> str:
    """Extract client IP from request, respecting X-Forwarded-For header."""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return get_remote_address(request)


limiter = Limiter(key_func=get_client_ip)


async def rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    """Custom handler for rate limit exceeded (429) errors."""
    logger.warning(
        "Rate limit exceeded for ip=%s path=%s",
        get_client_ip(request),
        request.url.path,
    )
    return JSONResponse(
        status_code=429,
        content={
            "error": "Rate limit exceeded",
            "code": "RATE_LIMIT_EXCEEDED",
            "detail": str(exc.detail),
        },
    )
