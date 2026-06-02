"""Lead temperature scoring (блок 3 ТЗ 2026-06-02).

Считает 0-100 score «горячести» лида по существующим полям компании.
Принцип: ценность лида НЕ в одном признаке (рейтинг или отзывы), а в
СВЯЗКЕ «активная карточка + рейтинг ≥4 + свежие отзывы + есть телефон».
Поэтому это аддитивная модель с весами + штрафами.

Кэшируется в `companies.lead_temperature`. Пересчитываем в:
- `enrich.py` после обогащения контактов (новые phone/email/мессенджеры);
- bulk-таске после массового обновления;
- ручном recompute-all endpoint (если потребуется).

При новой компании после save (`save_companies_batch` в service.py)
вызываем `recompute_for_companies` чтобы скор был сразу.

Чистая функция `compute(...)` принимает Company и возвращает int.
Удобна для тестов: подменяем поля и проверяем границы.
"""

from __future__ import annotations

import math
from datetime import datetime, timedelta, timezone
from typing import Iterable

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.maps import Company


# Веса блоков (сумма ~110 положительных при максимуме, отрицательные
# штрафы выводят score ниже нуля → clamp 0..100). Веса в одном месте,
# чтобы потом легко калибровать.
_W_RATING_MAX = 25      # рейтинг 4.0..5.0
_W_REVIEWS_MAX = 25     # лог-шкала отзывов 1..N
_W_FRESHNESS = 15       # отзывы за последние ~3 мес
_W_PHONE = 10           # есть телефон
_W_EMAIL_OR_MESSENGER = 10  # есть email ИЛИ мессенджер (tg/wa)
_W_OWNER_REPLIES = 10   # отвечает владелец на отзывы
_W_HAS_WEBSITE = 5      # есть сайт (небольшой бонус за «не мёртвая»)

_PENALTY_LOW_RATING = -15   # рейтинг < 3.5
_PENALTY_NO_REVIEWS = -20   # 0 отзывов — мёртвая карточка

# Параметры свежести: «свежие» = отзывы за последние N дней.
_FRESHNESS_DAYS = 90

# Параметры лог-шкалы отзывов: max-вес при reviews_count >= _REVIEWS_CAP.
_REVIEWS_CAP = 200


def _rating_component(rating: float | None) -> tuple[float, float]:
    """Возвращает (positive_bonus, penalty). rating 4.0..5.0 → 0..MAX."""
    if rating is None:
        return 0.0, 0.0
    r = float(rating)
    if r < 3.5:
        return 0.0, _PENALTY_LOW_RATING
    # Линейно 4.0→half, 5.0→max. Между 3.5..4.0 пропорционально 0..half.
    if r < 4.0:
        return _W_RATING_MAX * 0.5 * (r - 3.5) / 0.5, 0.0
    # 4.0..5.0: 0.5 → 1.0 от _W_RATING_MAX.
    return _W_RATING_MAX * (0.5 + 0.5 * (min(r, 5.0) - 4.0)), 0.0


def _reviews_component(reviews_count: int | None) -> tuple[float, float]:
    """Лог-шкала: 0 отзывов → штраф; 200+ отзывов → max."""
    n = int(reviews_count or 0)
    if n == 0:
        return 0.0, _PENALTY_NO_REVIEWS
    # log1p(1)≈0.69, log1p(200)≈5.3. Нормируем: x = log1p(n) / log1p(cap).
    x = math.log1p(n) / math.log1p(_REVIEWS_CAP)
    return _W_REVIEWS_MAX * min(x, 1.0), 0.0


def _freshness_bonus(last_review_at: datetime | None) -> float:
    """+ если последний отзыв был не позднее _FRESHNESS_DAYS назад."""
    if last_review_at is None:
        return 0.0
    now = datetime.now(timezone.utc)
    # last_review_at может быть naive — приводим к aware
    if last_review_at.tzinfo is None:
        last_review_at = last_review_at.replace(tzinfo=timezone.utc)
    age = now - last_review_at
    if age <= timedelta(days=_FRESHNESS_DAYS):
        return _W_FRESHNESS
    # Линейно затухание до 0 в 2× периода
    if age <= timedelta(days=_FRESHNESS_DAYS * 2):
        ratio = 1.0 - (age.days - _FRESHNESS_DAYS) / _FRESHNESS_DAYS
        return _W_FRESHNESS * max(ratio, 0.0)
    return 0.0


def _has_phone(c: Company) -> bool:
    if (c.phone or "").strip():
        return True
    extra = c.contacts_extra if isinstance(c.contacts_extra, dict) else {}
    phones = extra.get("phones") if isinstance(extra, dict) else None
    return bool(phones)


def _has_email_or_messenger(c: Company) -> bool:
    emails = c.emails if isinstance(c.emails, list) else []
    if emails:
        return True
    extra = c.contacts_extra if isinstance(c.contacts_extra, dict) else {}
    if not isinstance(extra, dict):
        return False
    for key in ("telegrams", "whatsapps", "vks"):
        v = extra.get(key)
        if isinstance(v, list) and v:
            return True
    return False


def _has_active_website(c: Company) -> bool:
    raw = (c.website or "").strip().lower()
    if not raw:
        return False
    bad_hosts = (
        "2gis.ru", "2gis.com",
        "vk.com", "instagram.com", "facebook.com",
        "t.me", "ok.ru",
    )
    return not any(h in raw for h in bad_hosts)


def compute(company: Company) -> int:
    """Считает score 0-100 для одной компании. Чистая функция, без I/O."""
    rating_bonus, rating_penalty = _rating_component(
        float(company.rating) if company.rating is not None else None
    )
    reviews_bonus, reviews_penalty = _reviews_component(company.reviews_count)
    freshness = _freshness_bonus(company.last_review_at)

    phone = _W_PHONE if _has_phone(company) else 0.0
    contact = _W_EMAIL_OR_MESSENGER if _has_email_or_messenger(company) else 0.0
    owner = _W_OWNER_REPLIES if company.has_owner_replies else 0.0
    website = _W_HAS_WEBSITE if _has_active_website(company) else 0.0

    total = (
        rating_bonus + reviews_bonus + freshness + phone + contact + owner + website
        + rating_penalty + reviews_penalty
    )
    # Clamp 0..100 и в int.
    return max(0, min(100, round(total)))


async def recompute_for_company(db: AsyncSession, company_id: int) -> int | None:
    """Пересчитывает temperature для одной компании и пишет в БД.

    Возвращает новое значение или None если компания не найдена.
    Не делает commit — caller сам решает (например после batch update).
    """
    res = await db.execute(select(Company).where(Company.id == company_id))
    c = res.scalar_one_or_none()
    if c is None:
        return None
    value = compute(c)
    await db.execute(
        update(Company)
        .where(Company.id == company_id)
        .values(lead_temperature=value)
    )
    return value


async def recompute_for_companies(
    db: AsyncSession, company_ids: Iterable[int]
) -> int:
    """Bulk-пересчёт. Возвращает кол-во обработанных компаний.

    Делает один SELECT на всех + индивидуальные UPDATE. Для нашего scale
    (≤1000 компаний за раз) этого достаточно; если станет узким местом —
    переписать на один UPDATE через CASE WHEN.
    """
    ids = list(company_ids)
    if not ids:
        return 0
    res = await db.execute(select(Company).where(Company.id.in_(ids)))
    companies = res.scalars().all()
    for c in companies:
        c.lead_temperature = compute(c)
    return len(companies)
