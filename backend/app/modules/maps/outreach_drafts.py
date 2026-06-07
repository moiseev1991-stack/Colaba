"""Сервис: генерация и кэширование драфтов холодных писем по компаниям.

Использование:
    draft = await generate_or_get_draft(
        db,
        company,
        angle="auto",
        tone="friendly",
        language="ru",
        regenerate=False,
    )

Возвращает либо данные кэша (если был и regenerate=False), либо свежий
вызов LLM с записью в company_outreach_drafts.

`angle="auto"` резолвится в один из конкретных углов ('website',
'reputation', 'automation', 'seo') на основе сигналов компании. Это
делает кэш детерминированным — повторный запрос с auto при том же
состоянии компании отдаст ту же запись из БД.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.company_legal import CompanyLegal
from app.models.company_outreach_draft import CompanyOutreachDraft
from app.models.maps import Company
from app.modules.maps import service as maps_service
from app.modules.maps.legal_enrich import extract_first_name
from app.modules.reviews_ai.llm import call_llm_outreach_draft


logger = logging.getLogger(__name__)


CONCRETE_ANGLES = ("website", "reputation", "automation", "seo")


@dataclass
class DraftResult:
    """Результат, возвращаемый сервисом наружу."""

    subject: str
    body: str
    angle_used: str
    tone: str
    language: str
    pains_used: list[dict]
    cached: bool


def _has_website(company: Company) -> bool:
    """Активный сайт в карточке компании (а не псевдо-/null)."""
    raw = (company.website or "").strip().lower()
    if not raw:
        return False
    # Псевдо-«сайты» которые на самом деле соцсети/2gis — считаем за «нет».
    bad_hosts = (
        "2gis.ru", "2gis.com",
        "vk.com", "vk.ru",
        "instagram.com", "facebook.com",
        "t.me", "telegram.me",
        "ok.ru",
    )
    return not any(h in raw for h in bad_hosts)


def _has_email(company: Company) -> bool:
    emails = company.emails if isinstance(company.emails, list) else []
    return len(emails) > 0


def pick_angle(company: Company, pains: list[dict]) -> str:
    """Выбирает угол услуги по сигналам компании, если запросили 'auto'.

    Приоритет:
    1. Нет сайта → 'website' (главная бизнес-цель Colaba — продажа сайтов).
    2. Есть негативные боли с цитатами + сайт уже есть → 'reputation'.
    3. Среди болей есть слова про звонки/связь → 'automation'.
    4. Иначе → 'website' (общий дефолт продажи).
    """
    if not _has_website(company):
        return "website"

    # Слова-маркеры в label/цитате, по которым угадываем угол.
    text_blob = " ".join(
        (p.get("label") or "") + " " + (p.get("top_quote") or "")
        for p in pains
    ).lower()
    automation_markers = ("дозвониться", "не отвечают", "не берут трубку",
                          "не перезвонил", "телефон", "связ")
    if any(m in text_blob for m in automation_markers):
        return "automation"

    # Если у компании есть боли и средний рейтинг низкий — репутация.
    if pains and (company.rating is not None and float(company.rating) < 4.0):
        return "reputation"

    # Дефолт. Сайт уже есть — продаём что-то другое; SEO как «безопасный»
    # дополнительный продукт.
    return "seo"


async def _load_cached(
    db: AsyncSession, company_id: int, angle: str
) -> CompanyOutreachDraft | None:
    """Читает кэш по (company_id, angle). None если нет."""
    stmt = select(CompanyOutreachDraft).where(
        CompanyOutreachDraft.company_id == company_id,
        CompanyOutreachDraft.angle == angle,
    )
    res = await db.execute(stmt)
    return res.scalar_one_or_none()


async def _upsert(
    db: AsyncSession,
    *,
    company_id: int,
    angle: str,
    subject: str,
    body: str,
    tone: str,
    language: str,
    pains_used: list[dict],
) -> None:
    """Upsert по (company_id, angle). Перезаписывает subject/body/...

    Используем pg-specific insert with ON CONFLICT — это атомарно и
    не требует отдельного SELECT перед UPDATE.
    """
    stmt = pg_insert(CompanyOutreachDraft).values(
        company_id=company_id,
        angle=angle,
        subject=subject[:500],
        body=body,
        pains_used=pains_used,
        tone=tone,
        language=language,
    ).on_conflict_do_update(
        index_elements=["company_id", "angle"],
        set_={
            "subject": subject[:500],
            "body": body,
            "pains_used": pains_used,
            "tone": tone,
            "language": language,
        },
    )
    await db.execute(stmt)
    await db.commit()


async def generate_or_get_draft(
    db: AsyncSession,
    company: Company,
    *,
    angle: str = "auto",
    tone: str = "friendly",
    language: str = "ru",
    regenerate: bool = False,
) -> tuple[DraftResult | None, str | None]:
    """Главная функция сервиса.

    Возвращает (DraftResult, None) при успехе, (None, error_message) при
    отсутствии LLM-ассистента / неподдерживаемом angle / прочих ошибках,
    которые имеет смысл показать пользователю.

    Кэш: один драфт на (company_id, angle). regenerate=True перезаписывает.
    """
    # 1. Тянем топ-3 боли с цитатами для этой компании.
    pains_map = await maps_service.get_top_pains_for_companies(
        db, [company.id], limit_per_company=3
    )
    pains = pains_map.get(company.id, [])
    pains_with_quote = [p for p in pains if p.get("top_quote")]

    # 2. Резолвим angle.
    if angle == "auto":
        resolved_angle = pick_angle(company, pains_with_quote)
    elif angle in CONCRETE_ANGLES:
        resolved_angle = angle
    else:
        return None, f"unsupported angle: {angle!r}"

    # 3. Если не regenerate — проверяем кэш.
    if not regenerate:
        cached = await _load_cached(db, company.id, resolved_angle)
        if cached is not None:
            cached_pains = (
                cached.pains_used if isinstance(cached.pains_used, list) else []
            )
            return (
                DraftResult(
                    subject=cached.subject,
                    body=cached.body,
                    angle_used=cached.angle,
                    tone=cached.tone,
                    language=cached.language,
                    pains_used=cached_pains,
                    cached=True,
                ),
                None,
            )

    # ЛПР (ТЗ A.1 2026-06-04): если у компании есть юр.данные с ФИО
    # директора — подставляем имя в обращение письма. Без блокировки:
    # если CompanyLegal нет / директора нет — письмо будет с «Здравствуйте!».
    legal = (await db.execute(
        select(CompanyLegal).where(CompanyLegal.company_id == company.id)
    )).scalar_one_or_none()
    recipient_first_name = (
        extract_first_name(legal.director_name) if legal and legal.director_name else None
    )
    recipient_post = legal.director_post if legal and legal.director_post else None

    # 4. Зовём LLM. pains может быть пустым — функция это умеет.
    pains_for_llm = [
        {"label": p["label"], "quote": p.get("top_quote") or ""}
        for p in pains_with_quote
    ]
    draft = await call_llm_outreach_draft(
        db,
        company_name=company.name or "",
        niche=company.niche or "",
        city=company.city or "",
        source=company.source or "карты",
        pains=pains_for_llm,
        angle=resolved_angle,
        tone=tone,
        language=language,
        has_website=_has_website(company),
        has_email=_has_email(company),
        rating=float(company.rating) if company.rating is not None else None,
        reviews_count=int(company.reviews_count or 0),
        recipient_first_name=recipient_first_name,
        recipient_post=recipient_post,
    )
    if draft is None:
        return None, (
            "LLM-ассистент для генерации письма не настроен или временно "
            "недоступен. Проверь OPENAI_API_KEY / OPENAI_BASE_URL и наличие "
            "ассистента reviews_ai_outreach_draft в БД."
        )

    # 5. Сохраняем (upsert) и возвращаем свежий.
    pains_used_for_cache = [
        {
            "pain_tag_id": p.get("pain_tag_id"),
            "label": p.get("label"),
            "top_quote": p.get("top_quote"),
            "top_quote_similarity": p.get("top_quote_similarity"),
        }
        for p in pains_with_quote
    ]
    try:
        await _upsert(
            db,
            company_id=company.id,
            angle=resolved_angle,
            subject=draft["subject"],
            body=draft["body"],
            tone=tone,
            language=language,
            pains_used=pains_used_for_cache,
        )
    except Exception as e:
        logger.warning(
            "generate_or_get_draft: cache upsert failed for company=%s angle=%s: %s",
            company.id, resolved_angle, e,
        )

    return (
        DraftResult(
            subject=draft["subject"],
            body=draft["body"],
            angle_used=resolved_angle,
            tone=tone,
            language=language,
            pains_used=pains_used_for_cache,
            cached=False,
        ),
        None,
    )
