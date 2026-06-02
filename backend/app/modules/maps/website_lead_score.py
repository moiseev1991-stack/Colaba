"""Website-lead scoring (блок 4 ТЗ 2026-06-02).

Отличается от `lead_temperature`:
- Базовое условие: «у компании НЕТ собственного активного сайта».
  Если активный сайт есть — компания не website-лид → score = None.
- Цель: продажа создания сайта. Подъём — за «живая платёжеспособная,
  но без онлайн-присутствия» (активная карточка + свежие отзывы +
  есть телефон + рейтинг ≥4 + опционально legal-данные).

Кэшируется в `companies.website_lead_score` (SmallInteger nullable).
Пересчёт хуками: save_companies_batch, update_company_aggregates,
enrich_company_contacts, enrich_company_from_2gis_html (то же что для
lead_temperature).
"""

from __future__ import annotations

import math
from datetime import datetime, timedelta, timezone
from typing import Iterable

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.maps import Company
# Переиспользуем helper из lead_temperature — определение «активного сайта»
# одинаково (фильтр псевдо-сайтов типа vk.com / 2gis.ru / t.me).
from app.modules.maps.lead_temperature import _has_active_website  # type: ignore


# Веса под продажу сайтов (не общий lead). Логика связочная: ценность
# website-лида НЕ в одном «нет сайта», а в «нет сайта + бизнес живой».
_W_REVIEWS_MAX = 30        # много отзывов → есть поток клиентов → есть деньги
_W_RATING_MAX = 20         # рейтинг ≥4.0 → бизнес держит планку
_W_FRESHNESS = 15          # отзывы свежие → карточка живая
_W_PHONE = 10              # есть куда продавать
_W_OWNER_REPLIES = 10      # отвечает владелец = карточкой кто-то занимается
_W_CONTACT_BREADTH = 10    # мессенджер/email = расширенный канал
_W_RATING_HIGH_BONUS = 5   # рейтинг ≥4.5 — небольшой доп. подъём

_PENALTY_LOW_RATING = -15  # rating < 3.5 — продажа сайта мёртвой компании
_PENALTY_NO_REVIEWS = -25  # 0 отзывов — карточка мёртвая, нет триггера купить

_FRESHNESS_DAYS = 180  # «свежие» отзывы = последние 6 мес
_REVIEWS_CAP = 200


def _reviews_component(reviews_count: int | None) -> tuple[float, float]:
    n = int(reviews_count or 0)
    if n == 0:
        return 0.0, _PENALTY_NO_REVIEWS
    x = math.log1p(n) / math.log1p(_REVIEWS_CAP)
    return _W_REVIEWS_MAX * min(x, 1.0), 0.0


def _rating_component(rating: float | None) -> tuple[float, float]:
    if rating is None:
        return 0.0, 0.0
    r = float(rating)
    if r < 3.5:
        return 0.0, _PENALTY_LOW_RATING
    bonus = 0.0
    if r < 4.0:
        bonus = _W_RATING_MAX * 0.5 * (r - 3.5) / 0.5
    else:
        bonus = _W_RATING_MAX * (0.5 + 0.5 * (min(r, 5.0) - 4.0))
    if r >= 4.5:
        bonus += _W_RATING_HIGH_BONUS
    return bonus, 0.0


def _freshness_bonus(last_review_at: datetime | None) -> float:
    if last_review_at is None:
        return 0.0
    now = datetime.now(timezone.utc)
    if last_review_at.tzinfo is None:
        last_review_at = last_review_at.replace(tzinfo=timezone.utc)
    age = now - last_review_at
    if age <= timedelta(days=_FRESHNESS_DAYS):
        return _W_FRESHNESS
    if age <= timedelta(days=_FRESHNESS_DAYS * 2):
        ratio = 1.0 - (age.days - _FRESHNESS_DAYS) / _FRESHNESS_DAYS
        return _W_FRESHNESS * max(ratio, 0.0)
    return 0.0


def _has_phone(c: Company) -> bool:
    if (c.phone or "").strip():
        return True
    extra = c.contacts_extra if isinstance(c.contacts_extra, dict) else {}
    return bool(isinstance(extra, dict) and extra.get("phones"))


def _has_contact_breadth(c: Company) -> bool:
    """Расширенный канал = email ИЛИ мессенджер (tg/wa)."""
    emails = c.emails if isinstance(c.emails, list) else []
    if emails:
        return True
    extra = c.contacts_extra if isinstance(c.contacts_extra, dict) else {}
    if not isinstance(extra, dict):
        return False
    for key in ("telegrams", "whatsapps", "vks"):
        if extra.get(key):
            return True
    return False


def compute(company: Company) -> int | None:
    """Возвращает score 0-100 ИЛИ None если компания не website-лид.

    None означает: у компании есть собственный активный сайт — мы такие в
    режим Website Leads не показываем (продавать ей сайт нечего).
    """
    if _has_active_website(company):
        return None

    reviews_bonus, reviews_penalty = _reviews_component(company.reviews_count)
    rating_bonus, rating_penalty = _rating_component(
        float(company.rating) if company.rating is not None else None
    )
    freshness = _freshness_bonus(company.last_review_at)
    phone = _W_PHONE if _has_phone(company) else 0.0
    owner = _W_OWNER_REPLIES if company.has_owner_replies else 0.0
    breadth = _W_CONTACT_BREADTH if _has_contact_breadth(company) else 0.0

    total = (
        reviews_bonus + rating_bonus + freshness + phone + owner + breadth
        + reviews_penalty + rating_penalty
    )
    return max(0, min(100, round(total)))


async def recompute_for_company(db: AsyncSession, company_id: int) -> int | None:
    """Пересчёт одной компании. Возвращает новое значение или None."""
    res = await db.execute(select(Company).where(Company.id == company_id))
    c = res.scalar_one_or_none()
    if c is None:
        return None
    value = compute(c)
    await db.execute(
        update(Company)
        .where(Company.id == company_id)
        .values(website_lead_score=value)
    )
    return value


async def recompute_for_companies(
    db: AsyncSession, company_ids: Iterable[int]
) -> int:
    """Bulk-пересчёт. Возвращает кол-во обработанных."""
    ids = list(company_ids)
    if not ids:
        return 0
    res = await db.execute(select(Company).where(Company.id.in_(ids)))
    companies = res.scalars().all()
    for c in companies:
        c.website_lead_score = compute(c)
    return len(companies)
