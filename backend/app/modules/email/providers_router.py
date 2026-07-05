"""API для управления настройками email-провайдеров (Postbox / SES / Hyvor).

Singleton-per-provider_id (3 строки в email_provider_config). Все эндпоинты
требуют superuser (кроме /status — он публичный, для бейджей в UI).

Монтируется в email/router.py через include_router.
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user_id, require_superuser
from app.models.email_provider_config import EmailProviderConfig
from app.models.user import User
from app.modules.email import providers_service as svc
from app.modules.email.providers_registry import get_all_provider_ids

router = APIRouter(tags=["Email Providers Settings"])


class EmailProviderConfigUpdate(BaseModel):
    """Тело для PUT. None/''/'***' не перезаписывают существующие секреты.

    cost_per_mail задаётся админом в UI — это цена отправки одного письма
    в рублях, используется api_call_log для расчёта стоимости рассылки.
    """

    api_key: Optional[str] = None
    secret_key: Optional[str] = None
    smtp_host: Optional[str] = None
    smtp_port: Optional[int] = None
    smtp_user: Optional[str] = None
    smtp_password: Optional[str] = None
    smtp_use_ssl: Optional[bool] = None
    from_email: Optional[str] = None
    from_name: Optional[str] = None
    region: Optional[str] = None
    cost_per_mail: Optional[float] = None
    is_enabled: Optional[bool] = None
    priority: Optional[int] = None
    notes: Optional[str] = None


class PriorityUpdate(BaseModel):
    priority: int  # 0=primary, 1=fallback, 2=tertiary


class TestResult(BaseModel):
    ok: bool
    error: Optional[str] = None


def _check_provider_id(provider_id: str) -> None:
    if provider_id not in get_all_provider_ids():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Unknown email provider: {provider_id}",
        )


@router.get("/providers-settings")
async def list_provider_settings(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_superuser),
):
    """Список 3 провайдеров с метаданными + кредентиалы (маскированы)."""
    return await svc.get_all_configs_public(db)


@router.get("/providers-settings/status")
async def provider_settings_status(
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    """Краткий статус каждого провайдера для бейджей в UI.

    Публичный (любой авторизованный). Возвращает
    {provider_id: 'ok' | 'no_credentials' | 'disabled'}.
    """
    _ = user_id
    return await svc.get_status(db)


@router.put("/providers-settings/{provider_id}")
async def update_provider_settings(
    provider_id: str,
    body: EmailProviderConfigUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_superuser),
):
    """Обновить конфиг провайдера. Только superuser.

    Секреты с sentinel-значениями ('***', '', None) НЕ перезаписывают
    уже сохранённые — это позволяет UI отправлять форму целиком.
    """
    _check_provider_id(provider_id)
    try:
        row = await svc.update_config(
            db, provider_id, body.model_dump(exclude_unset=True)
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return svc.row_to_dict(row)


@router.put("/providers-settings/{provider_id}/priority")
async def update_provider_priority(
    provider_id: str,
    body: PriorityUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_superuser),
):
    """Изменить приоритет провайдера (0=primary, 1=fallback, 2=tertiary).

    Остальные провайдеры сдвигаются, чтобы приоритеты остались 0/1/2 без дыр.
    """
    _check_provider_id(provider_id)
    try:
        row = await svc.set_priority(db, provider_id, body.priority)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return svc.row_to_dict(row)


@router.post("/providers-settings/{provider_id}/test", response_model=TestResult)
async def test_provider(
    provider_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_superuser),
):
    """Реальный тест подключения провайдера. Только superuser.

    - postbox/ses: SMTP-connect через aiosmtplib (connect+starttls+login).
    - hyvor:       HTTP-пинг на {api_url}/ (как старый test-hyvor).
    """
    _check_provider_id(provider_id)
    result = await _run_test(db, provider_id)
    return TestResult(**result)


# ────────────────────────────────────────────────────────────────────
# Тестирование подключения
# ────────────────────────────────────────────────────────────────────


async def _run_test(db: AsyncSession, provider_id: str) -> dict:
    """Реальный тест канала. Записывает last_test_* в строку конфига."""
    row = await svc._get_or_create_row(db, provider_id)
    try:
        if provider_id == "hyvor":
            ok, err = await _test_hyvor(row)
        else:
            ok, err = await _test_smtp(row)
    except Exception as e:
        ok, err = False, str(e)[:300]

    row.last_test_at = datetime.utcnow()
    row.last_test_result = "ok" if ok else "error"
    row.last_test_error = None if ok else (err or "unknown error")[:500]
    db.add(row)
    await db.commit()
    return {"ok": ok, "error": err if not ok else None}


async def _test_smtp(row: EmailProviderConfig) -> tuple[bool, Optional[str]]:
    """Тест SMTP-подключения (postbox/ses). Connect + STARTTLS + login.

    Не отправляет письмо — только проверяет, что кредентиалы валидны
    и сервер отвечает. Таймаут 15 сек.
    """
    import aiosmtplib

    host = (row.smtp_host or "").strip()
    port = int(row.smtp_port or 587)
    user = (row.smtp_user or "").strip()
    pwd = (row.smtp_password or "").strip()

    if not host:
        return False, "smtp_host пуст — заполните настройки провайдера"
    if not user or not pwd:
        return False, "smtp_user/smtp_password пусты"

    try:
        # aiosmtplib 5.x: connect() сам поднимает TLS при use_tls=True или
        # делает STARTTLS при start_tls=True (для порта 587).
        use_ssl = bool(row.smtp_use_ssl)
        smtp = aiosmtplib.SMTP(timeout=15.0)
        await smtp.connect(
            hostname=host,
            port=port,
            username=user if user and pwd else None,
            password=pwd if user and pwd else None,
            use_tls=use_ssl,
            start_tls=(not use_ssl),  # STARTTLS для 587, иначе implicit SSL.
        )
        await smtp.quit()
        return True, None
    except Exception as e:
        return False, f"{type(e).__name__}: {str(e)[:200]}"


async def _test_hyvor(row: EmailProviderConfig) -> tuple[bool, Optional[str]]:
    """Тест Hyvor Relay — HTTP-пинг на {api_url}/."""
    import httpx

    api_url = (row.smtp_host or "").strip().rstrip("/")
    api_key = (row.api_key or "").strip()
    if not api_url:
        return False, "API URL пуст — заполните smtp_host"
    if not api_key:
        return False, "api_key пуст"

    headers = {"Authorization": f"Bearer {api_key}"}
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get(f"{api_url}/", headers=headers)
            # Hyvor Relay отвечает 200/401/404 на GET / — любой не-5xx считаем
            # «доступен», деталь видна в логах.
            if r.status_code < 500:
                return True, None
            return False, f"HTTP {r.status_code}: {r.text[:200]}"
    except (httpx.HTTPError, OSError) as e:
        return False, f"{type(e).__name__}: {str(e)[:200]}"
