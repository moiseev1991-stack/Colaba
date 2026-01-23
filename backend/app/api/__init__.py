"""
API routers module.

Объединяет все API routers в один главный router.
"""

from fastapi import APIRouter

# Create main API router
api_router = APIRouter()

# Health check endpoint
@api_router.get("/health")
async def api_health() -> dict[str, str]:
    """API health check endpoint."""
    return {"status": "ok", "message": "API is running", "version": "0.1.0"}

# Import and include module routers
from app.modules.auth.router import router as auth_router
from app.modules.searches.router import router as searches_router
from app.modules.filters.router import router as filters_router

api_router.include_router(auth_router)
api_router.include_router(searches_router)
api_router.include_router(filters_router)
