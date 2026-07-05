"""Обогащение юр.данными через DaData (Блок 2 ТЗ 2026-06-02).

Стратегия матчинга (по убыванию надёжности):
1. По телефону компании — `suggest/party?query=<phone>`. Если ровно 1
   кандидат с тем же phone в data.phones — confidence=0.95, matched_by=phone.
2. По названию + городу — `suggest/party?query=<name> <city>`. Если есть
   точное вхождение имени и city из адреса совпадает — confidence=0.7,
   matched_by=name_address. Если просто топ-1 без проверок —
   confidence=0.4, matched_by=name_address.
3. Если оба варианта 0 → status=not_found, save запись чтобы не дёргать
   повторно.

ENV:
- DADATA_API_KEY (Authorization: Token ...)
- DADATA_SECRET_KEY (X-Secret: ...) — для suggest НЕ обязательно, но
  если будем дёргать findById/party (детали по ИНН) — нужен.
- DADATA_BASE_URL (default: https://suggestions.dadata.ru/.../rs)

Rate-limit: DaData бесплатный тариф 10k запросов/день. На 2k компаний
~2k запросов (по 1-2 на матч) — с большим запасом.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from datetime import datetime, date
from decimal import Decimal
from typing import Any

import httpx
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.company_legal import CompanyLegal
from app.models.maps import Company


logger = logging.getLogger(__name__)


_TIMEOUT = httpx.Timeout(15.0, connect=10.0)


@dataclass
class LegalMatch:
    """Нормализованный результат матча — для сохранения в CompanyLegal."""

    inn: str | None = None
    ogrn: str | None = None
    kpp: str | None = None
    legal_name: str | None = None
    legal_short_name: str | None = None
    opf: str | None = None
    registration_date: date | None = None
    revenue: Decimal | None = None
    employee_count: int | None = None
    legal_status: str | None = None
    okved: str | None = None
    okved_name: str | None = None
    # ЛПР (ТЗ A.1 2026-06-04): ФИО руководителя и должность из
    # data.management. Для большинства ООО есть; у ИП обычно пусто,
    # потому что ИП = физлицо и ФИО уже в legal_name.
    director_name: str | None = None
    director_post: str | None = None
    founders_json: list[dict[str, Any]] | None = None
    match_confidence: float = 0.0
    matched_by: str = "name_address"
    raw_json: dict[str, Any] | None = None


def _normalize_phone(raw: str | None) -> str | None:
    """+7XXXXXXXXXX из произвольного формата."""
    if not raw:
        return None
    digits = re.sub(r"\D", "", raw)
    if not digits:
        return None
    if digits.startswith("8") and len(digits) == 11:
        digits = "7" + digits[1:]
    if digits.startswith("7") and len(digits) == 11:
        return "+" + digits
    if len(digits) == 10:
        return "+7" + digits
    return None


def _build_headers() -> dict[str, str]:
    headers = {
        "Accept": "application/json",
        "Content-Type": "application/json",
    }
    api_key = (settings.DADATA_API_KEY or "").strip()
    if api_key:
        headers["Authorization"] = f"Token {api_key}"
    secret = (settings.DADATA_SECRET_KEY or "").strip()
    if secret:
        # X-Secret требуется для некоторых эндпоинтов; не мешает для suggest.
        headers["X-Secret"] = secret
    return headers


async def _suggest(client: httpx.AsyncClient, query: str, count: int = 5) -> list[dict[str, Any]]:
    """Дёргает /suggest/party и возвращает массив suggestions."""
    from time import perf_counter

    from app.core.api_tracker import log_call

    url = f"{settings.DADATA_BASE_URL.rstrip('/')}/suggest/party"
    t0 = perf_counter()
    try:
        r = await client.post(
            url,
            json={"query": query, "count": count},
            headers=_build_headers(),
        )
        latency_ms = int((perf_counter() - t0) * 1000)
        if r.is_success:
            await log_call(
                "dadata", "/suggest/party", method="POST",
                http_status=r.status_code, ok=True, latency_ms=latency_ms,
            )
        else:
            await log_call(
                "dadata", "/suggest/party", method="POST",
                http_status=r.status_code, ok=False,
                error=f"http {r.status_code}", latency_ms=latency_ms,
            )
        r.raise_for_status()
        return list((r.json() or {}).get("suggestions") or [])
    except httpx.HTTPError as e:
        logger.warning("dadata suggest %r failed: %s", query, e)
        await log_call(
            "dadata", "/suggest/party", method="POST", ok=False,
            error=str(e), latency_ms=int((perf_counter() - t0) * 1000),
        )
        return []


def _parse_date(s: str | int | None) -> date | None:
    if s is None:
        return None
    # DaData state.registration_date — UNIX timestamp ms.
    if isinstance(s, int):
        try:
            return datetime.fromtimestamp(s / 1000).date()
        except Exception:
            return None
    if isinstance(s, str):
        for fmt in ("%Y-%m-%d", "%d.%m.%Y"):
            try:
                return datetime.strptime(s, fmt).date()
            except Exception:
                pass
    return None


def _build_match_from_suggestion(
    s: dict[str, Any], *, confidence: float, matched_by: str
) -> LegalMatch:
    data = s.get("data") or {}
    state = data.get("state") or {}
    finance = data.get("finance") or {}
    okveds = data.get("okveds") or []

    okved_main = data.get("okved") or ""
    okved_name = data.get("okved_type") or ""
    if not okved_main and okveds:
        # Берём main=true если есть.
        main = next((o for o in okveds if o.get("main")), okveds[0])
        okved_main = main.get("code") or ""
        okved_name = main.get("name") or ""

    name = data.get("name") or {}
    legal_name = name.get("full_with_opf") or name.get("full") or s.get("value")
    short_name = name.get("short_with_opf") or name.get("short")

    # Тип юр.лица: ООО / ИП / АО / ПАО / НП / ...
    # DaData кладёт его в data.opf: {"type":"LEGAL"|"INDIVIDUAL","short":"ООО","full":"..."}.
    opf_obj = data.get("opf") or {}
    opf_short = None
    if isinstance(opf_obj, dict):
        opf_short = opf_obj.get("short")
    opf_value = str(opf_short).strip()[:50] if opf_short else None

    revenue_raw = finance.get("income")
    revenue: Decimal | None = None
    if revenue_raw is not None:
        try:
            revenue = Decimal(str(revenue_raw))
        except Exception:
            revenue = None

    employee_count = None
    if isinstance(data.get("employee_count"), int):
        employee_count = data.get("employee_count")

    legal_status_raw = (state.get("status") or "").lower()
    # DaData значения: ACTIVE / LIQUIDATING / LIQUIDATED / REORGANIZING /
    # BANKRUPT — нормализуем к нашему enum.
    status_map = {
        "active": "active",
        "liquidating": "liquidating",
        "liquidated": "liquidated",
        "reorganizing": "reorganizing",
        "bankrupt": "bankrupt",
    }
    legal_status = status_map.get(legal_status_raw)

    # ЛПР (ТЗ A.1): data.management — единое лицо-руководитель. У ИП поле
    # обычно пустое, у ООО — есть в ~90% случаев. DaData отдаёт ФИО в
    # верхнем регистре «ИВАНОВ ИВАН ИВАНОВИЧ» — нормализуем к Title Case.
    management = data.get("management") or {}
    director_raw = management.get("name") if isinstance(management, dict) else None
    director_post_raw = management.get("post") if isinstance(management, dict) else None
    director_name = _titlecase_fio(director_raw)
    director_post = _normalize_post(director_post_raw)

    # Учредители — массив; кэшируем как есть, на UI пока не показываем.
    founders = data.get("founders") if isinstance(data.get("founders"), list) else None
    founders_compact: list[dict[str, Any]] | None = None
    if founders:
        # Не храним пер-юзер всю исходную нагрузку — оставляем только то,
        # что реально будем использовать в Excel/UI: имя, доля, ИНН.
        founders_compact = []
        for f in founders[:20]:  # верхний предел — учредителей бывает много
            if not isinstance(f, dict):
                continue
            share = f.get("share") or {}
            founders_compact.append({
                "name": _titlecase_fio(f.get("name")),
                "share_value": share.get("value") if isinstance(share, dict) else None,
                "share_type": share.get("type") if isinstance(share, dict) else None,
                "inn": f.get("inn"),
            })

    return LegalMatch(
        inn=str(data.get("inn") or "")[:12] or None,
        ogrn=str(data.get("ogrn") or "")[:20] or None,
        kpp=str(data.get("kpp") or "")[:12] or None,
        legal_name=str(legal_name)[:500] if legal_name else None,
        legal_short_name=str(short_name)[:300] if short_name else None,
        opf=opf_value,
        registration_date=_parse_date(state.get("registration_date")),
        revenue=revenue,
        employee_count=employee_count,
        legal_status=legal_status,
        okved=str(okved_main)[:20] if okved_main else None,
        okved_name=str(okved_name)[:300] if okved_name else None,
        director_name=director_name,
        director_post=director_post,
        founders_json=founders_compact,
        match_confidence=confidence,
        matched_by=matched_by,
        raw_json=s,
    )


def _titlecase_fio(s: str | None) -> str | None:
    """ИВАНОВ ИВАН ИВАНОВИЧ → Иванов Иван Иванович.

    DaData отдаёт ФИО в верхнем регистре. Для UI и outreach-писем
    нужен нормальный Title Case с поддержкой составных фамилий через
    дефис («МАМИН-СИБИРЯК» → «Мамин-Сибиряк»).
    """
    if not s or not isinstance(s, str):
        return None
    raw = s.strip()
    if not raw:
        return None
    parts = re.split(r"(\s+|-)", raw)  # сохраняем разделители
    result = []
    for p in parts:
        if not p or p.isspace() or p == "-":
            result.append(p)
            continue
        result.append(p.capitalize())
    out = "".join(result)
    return out[:200]


def _normalize_post(s: str | None) -> str | None:
    """ГЕНЕРАЛЬНЫЙ ДИРЕКТОР → Генеральный директор."""
    if not s or not isinstance(s, str):
        return None
    raw = s.strip()
    if not raw:
        return None
    # Capitalize первого слова + lower остальных. «директор» в середине
    # фразы (например «Председатель совета директоров») всё равно ниже.
    out = raw.lower().capitalize()
    return out[:200]


def extract_first_name(full_name: str | None) -> str | None:
    """«Иванов Иван Иванович» → «Иван». Для подстановки в обращение
    («Здравствуйте, Иван!»)."""
    if not full_name:
        return None
    parts = full_name.strip().split()
    # Русское ФИО: фамилия → имя → отчество. Имя на индексе 1.
    if len(parts) >= 2:
        return parts[1]
    if len(parts) == 1:
        return parts[0]
    return None


async def find_legal_for_company(company: Company) -> LegalMatch | None:
    """Возвращает LegalMatch или None если не нашли / ключей нет."""
    if not (settings.DADATA_API_KEY or "").strip():
        logger.info("dadata: DADATA_API_KEY пуст — обогащение пропускается")
        return None

    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        # 1. По телефону (самый сильный якорь).
        phone = _normalize_phone(company.phone)
        if phone:
            sug = await _suggest(client, phone, count=3)
            if len(sug) == 1:
                return _build_match_from_suggestion(
                    sug[0], confidence=0.95, matched_by="phone"
                )
            if len(sug) > 1:
                # Берём топ, но даём более низкий confidence — мог быть
                # один и тот же номер у разных юр.лиц (редко, но бывает).
                return _build_match_from_suggestion(
                    sug[0], confidence=0.7, matched_by="phone"
                )

        # 2. По названию + городу.
        # Чистим имя: 2GIS часто отдаёт "Зимверк, металлообработка" —
        # суффикс после запятой/тире путает DaData. Берём только первую
        # часть до разделителя.
        raw_name = (company.name or "").strip()
        # Отрезаем по запятой / тире / двоеточию (берём первую группу).
        first = re.split(r"[,—\-:|/\\]", raw_name, maxsplit=1)[0].strip()
        # Убираем кавычки и лишние пробелы.
        name_norm = re.sub(r"[«»\"']", " ", first).strip()
        # Совсем короткий — мусор, пропускаем.
        if not name_norm or len(name_norm) < 3:
            return None
        city_part = (company.city or "").strip()

        # Попытка 1: имя + город.
        sug = await _suggest(client, f"{name_norm} {city_part}".strip(), count=5)

        # Попытка 2: только имя (полезно если в DaData нет точного
        # совпадения по городу — компания зарегистрирована в одном
        # регионе, работает в другом).
        if not sug:
            sug = await _suggest(client, name_norm, count=5)
        if not sug:
            return None

        # Ищем кандидата, у которого город совпадает с city. Если такой
        # есть — confidence=0.7. Если нет — top-1 с confidence=0.4.
        if city_part:
            city_low = city_part.lower()
            for cand in sug:
                addr = ((cand.get("data") or {}).get("address") or {}).get("value") or ""
                if city_low in addr.lower():
                    return _build_match_from_suggestion(
                        cand, confidence=0.7, matched_by="name_address"
                    )
        # Fallback — топ-1 с низким confidence (юзер видит match_confidence,
        # сможет отфильтровать вручную).
        return _build_match_from_suggestion(
            sug[0], confidence=0.4, matched_by="name_address"
        )


async def upsert_legal(
    db: AsyncSession,
    company_id: int,
    match: LegalMatch | None,
) -> None:
    """Сохраняет CompanyLegal (upsert по company_id). match=None →
    запись со status='not_found' чтобы не дёргать повторно."""
    base_values = {
        "company_id": company_id,
        "status": "ok" if match is not None else "not_found",
    }
    if match is not None:
        base_values.update({
            "inn": match.inn,
            "ogrn": match.ogrn,
            "kpp": match.kpp,
            "legal_name": match.legal_name,
            "legal_short_name": match.legal_short_name,
            "opf": match.opf,
            "registration_date": match.registration_date,
            "revenue": match.revenue,
            "employee_count": match.employee_count,
            "legal_status": match.legal_status,
            "okved": match.okved,
            "okved_name": match.okved_name,
            "director_name": match.director_name,
            "director_post": match.director_post,
            "founders_json": match.founders_json,
            "match_confidence": match.match_confidence,
            "matched_by": match.matched_by,
            "source": "dadata",
            "raw_json": match.raw_json,
        })

    stmt = pg_insert(CompanyLegal).values(**base_values)
    update_set = {
        k: stmt.excluded[k] for k in base_values.keys()
        if k != "company_id"
    }
    update_set["updated_at"] = stmt.excluded.updated_at  # noqa
    stmt = stmt.on_conflict_do_update(
        index_elements=["company_id"],
        set_=update_set,
    )
    await db.execute(stmt)
    await db.commit()


async def enrich_company(db: AsyncSession, company_id: int) -> dict[str, Any]:
    """Главная функция: тянет компанию, ищет в DaData, сохраняет."""
    company = await db.get(Company, company_id)
    if company is None:
        return {"status": "not_found_company"}

    # Skip если уже есть запись со status='ok' или 'not_found' — не
    # дёргаем повторно (юзер может явно перезапустить через force).
    existing = (await db.execute(
        select(CompanyLegal).where(CompanyLegal.company_id == company_id)
    )).scalar_one_or_none()
    if existing is not None:
        return {"status": "skip_already_processed"}

    match = await find_legal_for_company(company)
    await upsert_legal(db, company_id, match)
    if match is None:
        return {"status": "not_found"}
    return {
        "status": "ok",
        "inn": match.inn,
        "confidence": float(match.match_confidence or 0),
        "matched_by": match.matched_by,
    }
