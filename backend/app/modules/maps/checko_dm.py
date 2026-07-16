"""Поиск ЛПР через checko.ru (публичный реестр юр.лиц) — 2026-07-16.

Юзер (Дима, 16.07): «Rusprofile/Checko по ИНН — публичные страницы,
расширенные учредители/связанные фирмы (обходит платный DaData)».

Checko выбран потому, что менее агрессивная антибот-защита, чем у
rusprofile.ru (Cloudflare с challenge). Если Checko не даст результат,
можно расширить на rusprofile — но осторожно, там нужен residential proxy.

Как это работает
----------------
1. Берём Company.CompanyLegal.inn (заполнен DaData).
2. Дёргаем https://checko.ru/company/{inn} — публичная страница.
3. Из HTML достаём блок «Руководитель + Учредители» + «Связанные компании».
4. LLM извлекает имена и должности (call_llm_extract_dm_from_text,
   source_hint="страница компании на checko.ru").
5. Сохраняем с source='checko'.

DaData даёт директора + учредителей, но иногда:
- есть исторические сведения (бывшие директора — могут пригодиться для
  контакта);
- бывают несколько учредителей одновременно;
- иногда указан адрес электронной почты юрадресa (rare).

Идемпотентность: skip если запись source='checko' < 30 дней.
"""

from __future__ import annotations

import logging
import re
from datetime import datetime, timedelta, timezone

import httpx
from bs4 import BeautifulSoup
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.company_decision_maker import CompanyDecisionMaker
from app.models.company_legal import CompanyLegal
from app.models.maps import Company
from app.modules.maps._dm_persist import persist_dm_persons
from app.modules.reviews_ai.llm import call_llm_extract_dm_from_text


logger = logging.getLogger(__name__)


_TIMEOUT = httpx.Timeout(20.0, connect=10.0)
_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
)
_REPROCESS_AFTER_DAYS = 30
_MAX_TEXT_LEN = 8000


def _clean_html(html: str) -> str:
    """HTML → очищенный текст без script/style/nav. Мы сфокусированы
    на данных о руководстве, но т.к. Checko рендерит SPA-подобно, берём
    весь main-контент и полагаемся на LLM отфильтровать шум."""
    if not html:
        return ""
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style", "noscript", "svg", "iframe", "header", "footer", "nav"]):
        tag.decompose()
    # Берём весь текст.
    text = soup.get_text(separator=" ", strip=True)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:_MAX_TEXT_LEN]


async def _fetch_checko(inn: str) -> str:
    """https://checko.ru/company/{inn} → cleaned text. Пустая строка при
    любой ошибке — не роняем таск."""
    url = f"https://checko.ru/company/{inn}"
    try:
        async with httpx.AsyncClient(
            timeout=_TIMEOUT,
            follow_redirects=True,
            headers={
                "User-Agent": _UA,
                "Accept": "text/html,application/xhtml+xml",
                "Accept-Language": "ru-RU,ru;q=0.9",
            },
        ) as client:
            r = await client.get(url)
    except Exception as e:
        logger.warning("checko_dm: fetch %s failed: %s", url, e)
        return ""
    if r.status_code >= 400:
        logger.info("checko_dm: %s → %d", url, r.status_code)
        return ""
    return _clean_html(r.text)


async def enrich_dm_from_checko(
    db: AsyncSession,
    company_id: int,
    *,
    force: bool = False,
) -> dict:
    """Расширенный поиск ЛПР через checko.ru по ИНН.

    Требует CompanyLegal.inn (DaData сначала).
    """
    company = await db.get(Company, company_id)
    if company is None:
        return {"status": "not_found_company"}

    legal = (await db.execute(
        select(CompanyLegal).where(CompanyLegal.company_id == company_id)
    )).scalar_one_or_none()
    if legal is None or not (legal.inn or "").strip():
        return {"status": "no_inn"}

    if not force:
        cutoff = datetime.now(timezone.utc) - timedelta(days=_REPROCESS_AFTER_DAYS)
        recent = (await db.execute(
            select(CompanyDecisionMaker.id)
            .where(CompanyDecisionMaker.company_id == company_id)
            .where(CompanyDecisionMaker.source == "checko")
            .where(CompanyDecisionMaker.created_at >= cutoff)
            .limit(1)
        )).scalar_one_or_none()
        if recent is not None:
            return {"status": "skip_already_processed"}

    text = await _fetch_checko(legal.inn.strip())
    if not text or len(text) < 200:
        return {"status": "no_page_text", "saved": 0}

    persons = await call_llm_extract_dm_from_text(
        db,
        company_name=company.name or "",
        text=text,
        source_hint="страница компании на checko.ru (руководство, учредители)",
    )
    if persons is None:
        return {"status": "llm_unavailable", "saved": 0}
    if not persons:
        return {"status": "no_persons", "saved": 0}

    saved = await persist_dm_persons(
        db,
        company_id=company_id,
        persons=persons,
        source="checko",
        source_url=f"https://checko.ru/company/{legal.inn.strip()}",
        default_confidence=0.7,  # checko — публичный реестр, доверия больше
    )
    await db.commit()
    return {
        "status": "ok",
        "extracted": len(persons),
        "saved": saved,
    }
