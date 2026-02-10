"""
AI Assistants API: CRUD /ai-assistants.
"""

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.dependencies import get_db, get_current_user_id, require_superuser
from app.modules.ai_assistants import service
from app.modules.ai_assistants.registry import get_registry_entry
from app.modules.ai_assistants.service import UsedInCaptchaError
from app.modules.ai_assistants.schemas import AiAssistantCreate, AiAssistantUpdate
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/ai-assistants", tags=["ai-assistants"])


def _check_provider_type(provider_type: str) -> None:
    if not get_registry_entry(provider_type):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown provider_type: {provider_type}",
        )


@router.get("", response_model=list)
async def list_ai_assistants(
    _: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Список AI-ассистентов (config с замаскированными секретами)."""
    return await service.list_ai_assistants(db)


@router.get("/registry")
async def get_ai_assistants_registry(_: int = Depends(get_current_user_id)):
    """Реестр шаблонов по provider_type для создания из шаблона."""
    from app.modules.ai_assistants.registry import AI_ASSISTANT_REGISTRY, get_settings_schema

    return [
        {
            "provider_type": e["provider_type"],
            "name": e["name"],
            "config_keys": e.get("config_keys", []),
            "model_examples": e.get("model_examples", []),
            "settings_schema": get_settings_schema(e["provider_type"]),
        }
        for e in AI_ASSISTANT_REGISTRY
    ]


@router.get("/{assistant_id}", response_model=dict)
async def get_ai_assistant(
    assistant_id: int,
    _: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Один AI-ассистент."""
    out = await service.get_ai_assistant(assistant_id, db)
    if not out:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="AI assistant not found")
    return out


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_ai_assistant(
    body: AiAssistantCreate,
    _=Depends(require_superuser),
    db: AsyncSession = Depends(get_db),
):
    """Создать AI-ассистент. Только суперпользователь. При is_default=true снимается флаг с остальных."""
    _check_provider_type(body.provider_type)
    row = await service.create_ai_assistant(
        name=body.name,
        provider_type=body.provider_type,
        model=body.model,
        config=body.config,
        supports_vision=body.supports_vision,
        is_default=body.is_default,
        db=db,
    )
    return await service.get_ai_assistant(row.id, db)


@router.put("/{assistant_id}")
async def update_ai_assistant(
    assistant_id: int,
    body: AiAssistantUpdate,
    _=Depends(require_superuser),
    db: AsyncSession = Depends(get_db),
):
    """Обновить AI-ассистент. Секреты «***» не перезаписываются. При is_default=true снимается флаг с остальных."""
    if body.provider_type is not None:
        _check_provider_type(body.provider_type)
    row = await service.update_ai_assistant(
        assistant_id,
        name=body.name,
        provider_type=body.provider_type,
        model=body.model,
        config=body.config,
        supports_vision=body.supports_vision,
        is_default=body.is_default,
        db=db,
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="AI assistant not found")
    return await service.get_ai_assistant(row.id, db)


@router.delete("/{assistant_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_ai_assistant(
    assistant_id: int,
    _=Depends(require_superuser),
    db: AsyncSession = Depends(get_db),
):
    """Удалить AI-ассистент. 409 если используется в обходе капчи."""
    try:
        ok = await service.delete_ai_assistant(assistant_id, db)
    except UsedInCaptchaError:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Используется в настройках обхода капчи")
    if not ok:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="AI assistant not found")
