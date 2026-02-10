"""
Providers API: GET /providers, GET /providers/{id}, PUT /providers/{id}, POST /providers/{id}/test.
"""

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.dependencies import get_db, get_current_user_id, require_superuser
from app.modules.providers import service
from app.modules.providers.registry import PROVIDER_REGISTRY
from app.modules.providers.schemas import ProviderConfigUpdate, ProviderTestBody, ProviderTestResponse

router = APIRouter(prefix="/providers", tags=["providers"])


def _check_provider_id(provider_id: str) -> None:
    ids = [p["id"] for p in PROVIDER_REGISTRY]
    if provider_id not in ids:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Provider not found")


@router.get("")
async def list_providers(
    _: int = Depends(get_current_user_id),
    db=Depends(get_db),
):
    """Список провайдеров: реестр + config из БД (секреты замаскированы), configured."""
    return await service.get_providers_list(db)


@router.get("/{provider_id}")
async def get_provider(
    provider_id: str,
    _: int = Depends(get_current_user_id),
    db=Depends(get_db),
):
    """Один провайдер: settings_schema и config (секреты замаскированы)."""
    _check_provider_id(provider_id)
    out = await service.get_provider_detail(provider_id, db)
    if not out:
        raise HTTPException(status_code=404, detail="Provider not found")
    return out


@router.put("/{provider_id}")
async def update_provider(
    provider_id: str,
    body: ProviderConfigUpdate,
    _: int = Depends(require_superuser),
    db=Depends(get_db),
):
    """Обновить config провайдера. Только суперпользователь. Секреты «***» не перезаписываются."""
    _check_provider_id(provider_id)
    entry = next((p for p in PROVIDER_REGISTRY if p["id"] == provider_id), None)
    if not entry:
        raise HTTPException(status_code=404, detail="Provider not found")
    service._validate_config(body.config, entry["settings_schema"])
    row = await service.upsert_provider_config(provider_id, body.config, db)
    return {"provider_id": provider_id, "config": service._mask_secrets(dict(row.config), entry["settings_schema"])}


@router.post("/{provider_id}/test", response_model=ProviderTestResponse)
async def test_provider(
    provider_id: str,
    body: ProviderTestBody,
    _: int = Depends(require_superuser),
    db=Depends(get_db),
):
    """Проверить провайдер: поиск (query по умолчанию «кофе москва»). config из body подмешивается поверх сохранённых (пустые/*** не перезаписывают). Только суперпользователь."""
    _check_provider_id(provider_id)
    provider_config = await service.get_provider_config(provider_id, db)
    overrides = {k: v for k, v in (body.config or {}).items() if v not in (None, "", "***")}
    provider_config = {**provider_config, **overrides}
    try:
        from app.modules.searches.providers import fetch_search_results

        results = await fetch_search_results(
            provider=provider_id,
            query=body.query or "кофе москва",
            num_results=5,
            enable_fallback=False,
            provider_config=provider_config,
            db=db,
        )
        return ProviderTestResponse(ok=True, result_count=len(results))
    except Exception as e:
        return ProviderTestResponse(ok=False, error=str(e))
