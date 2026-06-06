"""
FastAPI main application entry point.

Создает FastAPI приложение, настраивает middleware, подключает routers.
"""

import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse

from app.core.config import settings
from app.core.database import init_db, engine
from app.core.rate_limit import limiter, rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from app.api import api_router


logger = logging.getLogger(__name__)


# Sentry init — до создания FastAPI приложения. Если SENTRY_DSN пустой,
# init no-op'ит и ничего никуда не отправляет (безопасно для dev).
if settings.SENTRY_DSN:
    import sentry_sdk
    from sentry_sdk.integrations.fastapi import FastApiIntegration
    from sentry_sdk.integrations.starlette import StarletteIntegration
    from sentry_sdk.integrations.celery import CeleryIntegration
    from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration

    sentry_sdk.init(
        dsn=settings.SENTRY_DSN,
        environment=settings.ENVIRONMENT,
        traces_sample_rate=settings.SENTRY_TRACES_SAMPLE_RATE,
        profiles_sample_rate=settings.SENTRY_PROFILES_SAMPLE_RATE,
        # send_default_pii=False — не льём в Sentry куки/IP/headers по умолчанию.
        # Достаточно типа исключения, traceback и custom-тегов.
        send_default_pii=False,
        integrations=[
            StarletteIntegration(),
            FastApiIntegration(),
            CeleryIntegration(),
            SqlalchemyIntegration(),
        ],
    )
    logger.info("Sentry enabled: env=%s", settings.ENVIRONMENT)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Lifespan context manager для инициализации и очистки ресурсов."""
    # Startup: Инициализация базы данных
    await init_db()

    yield

    # Shutdown: Очистка ресурсов (если нужно)
    pass


# Создание FastAPI приложения
app = FastAPI(
    title="LeadGen Constructor API",
    description="Модульная платформа для автоматического сбора лидов и анализа данных",
    version="0.1.0",
    docs_url="/api/docs" if settings.DEBUG else None,
    redoc_url="/api/redoc" if settings.DEBUG else None,
    lifespan=lifespan,
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Rate limiting
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)


# Exception handlers
@app.exception_handler(ValueError)
async def value_error_handler(request, exc: ValueError) -> JSONResponse:
    """Обработчик ValueError с возвратом 400 Bad Request."""
    return JSONResponse(
        status_code=400,
        content={"error": str(exc), "code": "VALIDATION_ERROR"},
    )


@app.exception_handler(Exception)
async def general_exception_handler(request, exc: Exception) -> JSONResponse:
    """Обработчик общих исключений с возвратом 500 Internal Server Error.

    ВАЖНО: глобальный handler глушит traceback наружу — поэтому здесь
    обязательно (а) логируем с traceback в наш logger, (б) если включён
    Sentry — отдельно отправляем исключение туда. Иначе Sentry не увидит
    падений, перехваченных этим хендлером.
    """
    logger.exception("Unhandled exception on %s %s", request.method, request.url.path)
    if settings.SENTRY_DSN:
        import sentry_sdk

        sentry_sdk.capture_exception(exc)
    return JSONResponse(
        status_code=500,
        content={"error": "Internal server error", "code": "INTERNAL_ERROR"},
    )


# Root redirect (http://localhost:8000/ -> API docs in debug, /health in production)
@app.get("/")
async def root() -> RedirectResponse:
    """Редирект: в DEBUG — на Swagger, иначе — на health."""
    url = "/api/docs" if settings.DEBUG else "/health"
    return RedirectResponse(url=url, status_code=302)


# Health check endpoint
@app.get("/health")
async def health_check() -> dict[str, str]:
    """Health check endpoint для мониторинга."""
    return {"status": "healthy", "version": "0.1.0"}


# Readiness check endpoint
@app.get("/ready")
async def readiness_check() -> JSONResponse:
    """Readiness check endpoint — проверяет подключение к PostgreSQL и Redis."""
    checks: dict[str, str] = {}
    ok = True

    # PostgreSQL check
    try:
        from sqlalchemy import text
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        checks["postgres"] = "ok"
    except Exception as exc:
        checks["postgres"] = f"error: {exc}"
        ok = False

    # Redis check
    try:
        import redis.asyncio as aioredis
        r = aioredis.from_url(settings.REDIS_URL, socket_connect_timeout=2)
        await r.ping()
        await r.aclose()
        checks["redis"] = "ok"
    except Exception as exc:
        checks["redis"] = f"error: {exc}"
        ok = False

    status_code = 200 if ok else 503
    return JSONResponse(
        status_code=status_code,
        content={"status": "ready" if ok else "not_ready", "checks": checks},
    )


# Подключение API routers
app.include_router(api_router, prefix="/api/v1")


# Setup SQLAdmin (must be after app creation)
from app.admin import setup_admin
setup_admin(app)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.DEBUG,
    )
