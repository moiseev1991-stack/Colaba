"""Поиск ЛПР через SerpAPI (Google-выдача) — 2026-07-16.

Юзер (Дима, 16.07): «Google-поиск "компания X" маркетолог site:vk.com OR
site:linkedin.com — дёшево через SerpAPI (у тебя есть ключ)».

Как это работает
----------------
1. Формируем 2-3 поисковых запроса по названию компании (+ город, если
   есть) + связка ключевых слов «маркетолог / SMM / директор» + site:-
   ограничения на площадки, где чаще всего сидят ЛПР
   (vk.com / linkedin.com — заблокирован в РФ, но публичные snippet'ы в
   Google всё равно показывают; rusprofile.ru / hh.ru).
2. Для каждого запроса дёргаем SerpAPI.
3. Из snippet'ов + title'ов собираем текст, LLM-парсит имена и должности
   (call_llm_extract_dm_from_text, source_hint="сниппеты Google-поиска").
4. Сохраняем в company_decision_makers с source='serp_google'.

Стоимость
---------
SerpAPI ~$0.005 за запрос (у Димы стартовый план 500 бесплатных / мес).
2 запроса × 500 компаний в месяц = 1000 запросов = $5.

Идемпотентность
---------------
Skip если у компании уже есть запись source='serp_google' младше 30 дней.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.company_decision_maker import CompanyDecisionMaker
from app.models.maps import Company
from app.modules.maps._dm_persist import persist_dm_persons
from app.modules.reviews_ai.llm import call_llm_extract_dm_from_text


logger = logging.getLogger(__name__)


_TIMEOUT = httpx.Timeout(30.0, connect=10.0)
_REPROCESS_AFTER_DAYS = 30
# 2 запроса на компанию — компромисс между покрытием и стоимостью. При
# необходимости можно расширить до 3-4 (например /pr/, /франшиза/) —
# но для B2C это обычно шум.
_MAX_QUERIES = 2


def _build_queries(company_name: str, city: str | None, website: str | None) -> list[str]:
    """Формирует список поисковых запросов для одной компании.

    Стратегия — 2 запроса разной ширины:
      1. Узкий: «компания» маркетолог/SMM/PR — часто hh.ru-вакансии или
         VK-профили сотрудников.
      2. Широкий: «компания» директор/руководитель — общая выдача.

    Города добавлять НЕ будем — часто ломает точный матч (например
    «Гагарин» вернёт мусор про космонавта).
    """
    q1 = f'"{company_name}" маркетолог OR SMM OR PR-менеджер'
    q2 = f'"{company_name}" директор OR руководитель OR учредитель'
    queries = [q1, q2]

    # Если есть свой домен — добавляем target:site как БОНУС, увеличивая
    # шанс попасть в /team / /о-нас страницы. Замена — не расширение.
    if website:
        try:
            netloc = urlparse(website).netloc or ""
            # Убираем www. и порт
            netloc = netloc.split(":")[0]
            if netloc.startswith("www."):
                netloc = netloc[4:]
            if netloc and "." in netloc and len(netloc) < 100:
                q2 = f'site:{netloc} директор OR маркетолог OR руководитель'
                queries[1] = q2
        except Exception:
            pass
    return queries[:_MAX_QUERIES]


async def _serp_call(query: str, api_key: str) -> list[dict]:
    """Один вызов SerpAPI. Возвращает список organic_results (title/snippet/link).
    Пустой list при 4xx/5xx (не роняем весь таск).
    """
    params = {
        "api_key": api_key,
        "q": query,
        "engine": "google",
        "hl": "ru",
        "gl": "ru",
        "num": 10,
    }
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            r = await client.get("https://serpapi.com/search", params=params)
    except Exception as e:
        logger.warning("serp_dm: SerpAPI request failed q=%r err=%s", query[:80], e)
        return []
    if r.status_code != 200:
        logger.warning(
            "serp_dm: SerpAPI status=%d q=%r body=%s",
            r.status_code, query[:80], r.text[:200],
        )
        return []
    j = r.json() or {}
    return j.get("organic_results") or []


def _build_text_from_results(results: list[dict]) -> str:
    """Склеиваем title + snippet + host каждой ссылки в один текст для LLM.

    host помогает LLM понять, откуда взят snippet (vk.com — вероятнее
    личный профиль; hh.ru — вакансия; rusprofile.ru — юр.данные).
    Обрезаем каждый snippet до 300 символов — LLM хватит.
    """
    lines: list[str] = []
    for item in results[:15]:
        title = (item.get("title") or "").strip()[:200]
        snippet = (item.get("snippet") or "").strip()[:300]
        link = (item.get("link") or "").strip()
        host = ""
        try:
            host = urlparse(link).netloc
        except Exception:
            pass
        if not (title or snippet):
            continue
        lines.append(f"[{host or 'web'}] {title} — {snippet}")
    return "\n".join(lines)


async def enrich_dm_from_serp(
    db: AsyncSession,
    company_id: int,
    *,
    force: bool = False,
) -> dict:
    """Поиск ЛПР через SerpAPI по имени компании.

    Возвращает dict-сводку: сколько запросов сделано, сколько персон
    извлечено, сколько реально сохранено.
    """
    api_key = (settings.SERPAPI_KEY or "").strip()
    if not api_key:
        return {"status": "no_serpapi_key"}

    company = await db.get(Company, company_id)
    if company is None:
        return {"status": "not_found_company"}
    if not (company.name or "").strip():
        return {"status": "no_name"}

    # Идемпотентность
    if not force:
        cutoff = datetime.now(timezone.utc) - timedelta(days=_REPROCESS_AFTER_DAYS)
        recent = (await db.execute(
            select(CompanyDecisionMaker.id)
            .where(CompanyDecisionMaker.company_id == company_id)
            .where(CompanyDecisionMaker.source == "serp_google")
            .where(CompanyDecisionMaker.created_at >= cutoff)
            .limit(1)
        )).scalar_one_or_none()
        if recent is not None:
            return {"status": "skip_already_processed"}

    queries = _build_queries(company.name or "", company.city, company.website)
    all_results: list[dict] = []
    queries_made = 0
    for q in queries:
        results = await _serp_call(q, api_key)
        queries_made += 1
        all_results.extend(results)

    if not all_results:
        return {"status": "no_results", "queries": queries_made, "saved": 0}

    text = _build_text_from_results(all_results)
    if not text.strip():
        return {"status": "no_text", "queries": queries_made, "saved": 0}

    persons = await call_llm_extract_dm_from_text(
        db,
        company_name=company.name or "",
        text=text,
        source_hint="сниппеты Google-поиска (title + snippet каждого результата)",
    )
    if persons is None:
        return {"status": "llm_unavailable", "queries": queries_made, "saved": 0}
    if not persons:
        return {"status": "no_persons", "queries": queries_made, "saved": 0}

    saved = await persist_dm_persons(
        db,
        company_id=company_id,
        persons=persons,
        source="serp_google",
        source_url=None,
        default_confidence=0.5,
    )
    await db.commit()
    return {
        "status": "ok",
        "queries": queries_made,
        "extracted": len(persons),
        "saved": saved,
    }
