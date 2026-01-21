"""
FastAPI main application entry point.

Создает FastAPI приложение, настраивает middleware, подключает routers.
"""

from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.core.database import init_db
from app.api import api_router


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
    """Обработчик общих исключений с возвратом 500 Internal Server Error."""
    return JSONResponse(
        status_code=500,
        content={"error": "Internal server error", "code": "INTERNAL_ERROR"},
    )


# Health check endpoint
@app.get("/health")
async def health_check() -> dict[str, str]:
    """Health check endpoint для мониторинга."""
    return {"status": "healthy", "version": "0.1.0"}


# Readiness check endpoint
@app.get("/ready")
async def readiness_check() -> dict[str, str]:
    """Readiness check endpoint для проверки готовности к обработке запросов."""
    # TODO: Проверка подключения к БД, Redis и т.д.
    return {"status": "ready"}


# Подключение API routers
app.include_router(api_router, prefix="/api/v1")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.DEBUG,
    )
