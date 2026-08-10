"""Автоматический дневной прогрев доменов: рассылка КП реальным компаниям.

Запускается celery beat каждый день в 10:00 МСК (07:00 UTC). Алгоритм:
- Считает квоту дня = база + (дней_с_старта × шаг), максимум max_daily.
- Берёт N УНИКАЛЬНЫХ по email компаний (без повторов получателей).
- Для каждой случайно выбирает легенду (automation/webstudio/seo/marketing)
  и бренд from_name — для разнообразия и маскировки от спам-фильтров.
- Генерирует КП через LLM под легенду (с реальными отзывами компании).
- Отправляет через postbox (~70%) и timeweb (~30%, в рамках day_limit).
- Интервал 90 сек между отправками (для прогрева).

START_DATE — дата старта прогрева (первый день). От неё считается номер дня.
"""

import asyncio
import json
import logging
import random
from datetime import datetime, timezone

from sqlalchemy import select, text

from app.core.database import AsyncSessionLocal
from app.models.email import EmailCampaign, EmailLog, EmailStatus
from app.models.email_provider_config import EmailProviderConfig
from app.modules.email.service import email_service, EmailServiceError
from app.modules.outreach.kp_service import generate_kp, KpGenerationError

logger = logging.getLogger(__name__)

# Дата старта прогрева. От неё считается номер дня и квота.
# 2026-08-10 — первый день (стартовая кампания из 6 КП).
WARMUP_START_DATE = datetime(2026, 8, 10, tzinfo=timezone.utc)
BASE_DAILY = 10  # стартовый объём в день 1
DAILY_STEP = 10  # +10 писем каждый день
MAX_DAILY = 100  # потолок объёма в день (защита)

USER_ID = 1  # sir.nikam@example.com — единый аккаунт прогрева

# Легенды + бренды + распределение вероятностей.
LEGENDS = [
    ("automation", "SpinLid", 0.40),
    ("webstudio", "WebStudio Pro", 0.25),
    ("seo", "SeoBoost", 0.20),
    ("marketing", "TargetLeads", 0.15),
]


def compute_daily_quota() -> tuple[int, int]:
    """Считает квоту дня и номер дня.

    Возвращает (day_number, quota).
    day_number = 1 в первый день, растёт.
    quota = BASE_DAILY + (day_number - 1) × DAILY_STEP, не больше MAX_DAILY.
    """
    now = datetime.now(timezone.utc)
    delta = now - WARMUP_START_DATE
    day_number = max(1, delta.days + 1)
    quota = min(BASE_DAILY + (day_number - 1) * DAILY_STEP, MAX_DAILY)
    return day_number, quota


def pick_legend() -> tuple[str, str]:
    """Случайный выбор легенды по распределению вероятностей."""
    r = random.random()
    cumul = 0.0
    for key, brand, prob in LEGENDS:
        cumul += prob
        if r <= cumul:
            return key, brand
    return LEGENDS[-1][0], LEGENDS[-1][1]


def first_email(company) -> str:
    """Достаёт первый email из jsonb-колонки emails."""
    emails = company.emails
    if isinstance(emails, str):
        emails = json.loads(emails or "[]")
    return emails[0] if emails else None


async def _find_or_create_thread(
    db,
    user_id: int,
    contact_email: str,
    contact_name,
    subject: str,
) -> int:
    """Поиск или создание треда (диалога с контактом) для КП.

    Ищем существующий по (user_id, contact_email, normalized_subject);
    если нет — создаём новый.
    """
    import re

    from app.models.email_thread import EmailThread

    contact_email_lower = (contact_email or "").strip().lower()
    # Нормализация subject (без Re:/Fwd:).
    s = subject or ""
    while True:
        new_s = re.sub(r"^\s*(re|fwd|fw)\s*:\s*", "", s, flags=re.IGNORECASE)
        if new_s == s:
            break
        s = new_s
    norm_subject = s.strip()[:500]

    result = await db.execute(
        select(EmailThread.id).where(
            EmailThread.user_id == user_id,
            EmailThread.contact_email == contact_email_lower,
            EmailThread.subject == norm_subject,
        )
    )
    tid = result.scalar_one_or_none()
    if tid:
        return tid

    thread = EmailThread(
        user_id=user_id,
        contact_email=contact_email_lower,
        contact_name=contact_name,
        subject=norm_subject,
        created_at=datetime.utcnow(),
    )
    db.add(thread)
    await db.flush()
    return thread.id


async def _update_thread_outgoing(db, thread_id: int, body: str) -> None:
    """Обновляет кеш thread после отправки исходящего КП."""
    from app.models.email_thread import EmailThread

    thread = await db.get(EmailThread, thread_id)
    if not thread:
        return
    thread.last_message_at = datetime.utcnow()
    thread.last_message_preview = body[:500]
    thread.last_message_direction = "outgoing"
    thread.updated_at = datetime.utcnow()
    db.add(thread)


async def get_candidate_companies(db, limit: int):
    """УНИКАЛЬНЫЕ по email компании, которым ещё НЕ отправляли КП.

    Группируем по первому email (DISTINCT ON), берём по одному company_id на
    email. Фильтруем мусорные «email» (парсер картинок: 404@2x.png и т.п.).
    """
    sql = text(
        """
        WITH candidates AS (
            SELECT
                c.id AS company_id,
                c.name AS company_name,
                c.emails,
                c.emails::jsonb ->> 0 AS first_email
            FROM companies c
            WHERE c.emails IS NOT NULL
              AND c.emails::text <> '[]'
              AND c.emails::text LIKE '%@%'
              AND NOT EXISTS (
                SELECT 1 FROM kp_sends s
                WHERE s.company_id = c.id AND s.channel = 'email'
                  AND s.status = 'sent'
              )
        )
        SELECT DISTINCT ON (first_email) company_id, company_name, emails
        FROM candidates
        WHERE first_email LIKE '%_@_%._%'
          AND first_email NOT LIKE '%.@%'
          AND first_email NOT LIKE '@.%'
          AND lower(first_email) NOT LIKE '%.png'
          AND lower(first_email) NOT LIKE '%.webp'
          AND lower(first_email) NOT LIKE '%.jpg'
          AND lower(first_email) NOT LIKE '%.jpeg'
          AND lower(first_email) NOT LIKE '%.gif'
        ORDER BY first_email, company_id
        LIMIT :limit
    """
    )
    result = await db.execute(sql, {"limit": limit * 2})
    return result.fetchall()


async def run_daily_warmup() -> dict:
    """Главная функция дневного прогрева. Возвращает статистику.

    Возвращает {day, quota, sent, failed, campaign_id}.
    """
    day_number, quota = compute_daily_quota()
    logger.info(
        "Warmup day %d: quota=%d (started %s)",
        day_number,
        quota,
        WARMUP_START_DATE.date(),
    )

    async with AsyncSessionLocal() as db:
        pb = (
            await db.execute(select(EmailProviderConfig).where(EmailProviderConfig.provider_id == "postbox"))
        ).scalar_one()
        tw = (
            await db.execute(select(EmailProviderConfig).where(EmailProviderConfig.provider_id == "timeweb"))
        ).scalar_one()

    # Сколько через timeweb (с запасом под day_limit), остальное postbox.
    timeweb_quota = min(int(quota * 0.3), max((tw.daily_limit or 12) - 2, 1))
    timeweb_quota = max(timeweb_quota, 1)
    postbox_quota = max(quota - timeweb_quota, 0)

    # Кандидаты (уникальные по email).
    async with AsyncSessionLocal() as db:
        candidates = await get_candidate_companies(db, quota)
    if not candidates:
        logger.warning("Warmup: no new candidate companies, skipping.")
        return {
            "day": day_number,
            "quota": quota,
            "sent": 0,
            "failed": 0,
            "campaign_id": None,
            "reason": "no_candidates",
        }

    # План отправки.
    plan = []
    for i, comp in enumerate(candidates):
        email = first_email(comp)
        if not email:
            continue
        provider = "timeweb" if i < timeweb_quota else "postbox"
        legend_key, brand = pick_legend()
        plan.append(
            {
                "company_id": comp.company_id,
                "company_name": comp.company_name,
                "to_email": email,
                "provider": provider,
                "legend": legend_key,
                "brand": brand,
            }
        )
        if len(plan) >= quota:
            break

    if not plan:
        logger.warning("Warmup: plan empty after filtering.")
        return {
            "day": day_number,
            "quota": quota,
            "sent": 0,
            "failed": 0,
            "campaign_id": None,
            "reason": "empty_plan",
        }

    logger.info(
        "Warmup day %d: plan=%d (postbox=%d timeweb=%d)",
        day_number,
        len(plan),
        sum(1 for p in plan if p["provider"] == "postbox"),
        sum(1 for p in plan if p["provider"] == "timeweb"),
    )

    # Кампания + отправка.
    async with AsyncSessionLocal() as db:
        camp = EmailCampaign(
            user_id=USER_ID,
            organization_id=None,
            name="Прогрев день " + str(day_number) + " (" + str(len(plan)) + " КП)",
            subject="",
            body="",
            status="sending",
            total_recipients=len(plan),
            from_email=None,
            from_name=None,
            reply_to_email="dmitry@spinlid-team.ru",
            started_at=datetime.utcnow(),
        )
        db.add(camp)
        await db.flush()

        sent_count = 0
        for i, p in enumerate(plan):
            # 1. Генерация КП под легенду.
            try:
                result = await generate_kp(
                    db,
                    user_id=USER_ID,
                    company_id=p["company_id"],
                    template_key=p["legend"],
                    tone="neutral",
                )
                draft = result.draft_row
                subject = draft.subject
                body = draft.body
            except (KpGenerationError, Exception) as e:
                msg = getattr(e, "message", str(e))[:80]
                logger.warning(
                    "Warmup: KP generation failed for company %s (%s): %s",
                    p["company_id"],
                    p["legend"],
                    msg,
                )
                continue

            # 2. from_email по каналу, from_name = бренд легенды.
            from_email = tw.from_email if p["provider"] == "timeweb" else pb.from_email
            from_name = p["brand"]

            # 2.5. Поиск/создание thread для этого контакта (для мессенджера).
            thread_id = await _find_or_create_thread(
                db,
                user_id=USER_ID,
                contact_email=p["to_email"],
                contact_name=None,
                subject=subject,
            )

            # Генерируем RFC Message-ID для threading (клиент ответит →
            # его In-Reply-To сматчится с этим ID → ответ попадёт в thread).
            from email.utils import make_msgid

            message_id = make_msgid(idstring=f"kp-{p['company_id']}", domain="spinlid.ru")

            # 3. Лог + отправка (с db — иначе force_provider не найдёт креды).
            log = EmailLog(
                campaign_id=camp.id,
                user_id=USER_ID,
                organization_id=None,
                to_email=p["to_email"],
                subject=subject,
                status=EmailStatus.PENDING.value,
                thread_id=thread_id,
                external_message_id=message_id,
            )
            db.add(log)
            await db.flush()

            try:
                await email_service.send_email(
                    to_email=p["to_email"],
                    subject=subject,
                    body=body,
                    from_email=from_email,
                    from_name=from_name,
                    reply_to="dmitry@spinlid-team.ru",
                    db=db,
                    force_provider=p["provider"],
                )
                log.status = EmailStatus.SENT.value
                log.sent_at = datetime.utcnow()
                log.body_preview = body
                sent_count += 1

                # Обновляем кеш thread: последнее сообщение = исходящее КП.
                await _update_thread_outgoing(db, thread_id, body)
            except EmailServiceError as e:
                log.status = EmailStatus.FAILED.value
                log.error_message = str(e)[:500]
                log.error_code = "SEND_FAILED"
                logger.warning("Warmup: send failed to %s: %s", p["to_email"], str(e)[:80])
            db.add(log)
            await db.commit()

            # интервал 90 сек между отправками (для прогрева).
            if i < len(plan) - 1:
                await asyncio.sleep(90)

        camp.sent_count = sent_count
        camp.failed_count = len(plan) - sent_count
        camp.status = "completed"
        camp.completed_at = datetime.utcnow()
        db.add(camp)
        await db.commit()

    logger.info(
        "Warmup day %d done: campaign #%d, sent %d/%d",
        day_number,
        camp.id,
        sent_count,
        len(plan),
    )
    return {
        "day": day_number,
        "quota": quota,
        "sent": sent_count,
        "failed": len(plan) - sent_count,
        "campaign_id": camp.id,
    }
