"""Сервис генерации КП (коммерческого предложения).

Эпик A фокус-релиза «КП-конвейер» (ТЗ 2026-06-12).

Поток:
  1. Загрузка компании, шаблона, топ-боли с цитатой и источником.
  2. Расчёт тренда (negative-trend logic) и бенчмарка (pain-benchmark
     logic) — детерминированные фразы через kp_phrases.
  3. Сборка промпта (kp_prompts) с пропуском строк, по которым нет данных.
  4. Вызов LLM (ai_assistants.client.chat) через ассистента kind=
     'outreach_draft'. Парсинг JSON-ответа.
  5. При битом JSON — 1 ретрай с инструкцией «верни СТРОГО JSON».
  6. Persist в kp_drafts (новая запись на каждое поколение, не upsert).

В отличие от существующего `maps/outreach_drafts.py` (per-angle cache
для drawer-блока), здесь не кэшируем — каждая генерация = отдельная
строка истории, чтобы юзер мог сравнить варианты и счётчик месячных
лимитов (Эпик E) работал по COUNT'у kp_drafts.
"""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import and_, or_, select
from sqlalchemy import func as sa_func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.kp_draft import KpDraft
from app.models.kp_template import KpTemplate
from app.models.maps import Company, Review
from app.models.organization import user_organizations
from app.modules.ai_assistants.client import chat
from app.modules.outreach.kp_phrases import (
    benchmark_phrase,
    trend_phrase,
    website_status_phrase,
)
from app.modules.outreach.kp_prompts import (
    KP_FACT_BENCHMARK_LINE,
    KP_FACT_PAIN_LINE,
    KP_FACT_QUOTE_LINE,
    KP_FACT_RATING_LINE,
    KP_FACT_RATING_NO_AVG_LINE,
    KP_FACT_TREND_LINE,
    KP_FACT_WEBSITE_LINE,
    KP_PROMPT_HEADER,
    KP_PROMPT_RECIPIENT,
    KP_PROMPT_TAIL,
    TONE_HINTS,
)
from app.modules.reviews_ai.llm import pick_assistant_id

logger = logging.getLogger(__name__)


# --- Контекст КП -------------------------------------------------------------


@dataclass
class TopPain:
    """Главная боль компании — из CompanyPainScore с max mention_count."""

    pain_tag_id: int
    label: str
    mention_count: int
    top_quote: str | None
    # Источник pain'а: 2gis/yandex_maps/google. NULL если по любой причине
    # mapping не определился. В письме идёт как контекст-факт, не обязателен.
    source: str | None


async def load_top_pain(db: AsyncSession, company_id: int) -> TopPain | None:
    """Топ-1 боль компании. Если у компании нет проанализированных pain'ов
    (или AI ещё не отработал) — None. KP-роутер тогда отдаст 409 с
    понятным сообщением, фронт покажет disabled-кнопку.

    Источник определяем как source самого свежего негативного отзыва,
    у которого text совпадает с top_quote (best-effort). Это не идеально
    точно (текст в quote может быть обрезан), но даёт правильный source
    для типичных случаев. None — допустимо.
    """
    from app.models.pain_tag import CompanyPainScore, PainTag

    row = (
        await db.execute(
            select(
                CompanyPainScore.pain_tag_id,
                PainTag.label,
                CompanyPainScore.mention_count,
                CompanyPainScore.top_quote,
            )
            .join(PainTag, PainTag.id == CompanyPainScore.pain_tag_id)
            .where(
                CompanyPainScore.company_id == company_id,
                PainTag.status == "active",
            )
            .order_by(
                CompanyPainScore.mention_count.desc(),
                CompanyPainScore.last_mention_at.desc().nullslast(),
            )
            .limit(1)
        )
    ).first()
    if row is None:
        return None
    pain_tag_id, label, mention_count, top_quote = row

    # Источник — пробуем найти Review у этой же компании, чей текст
    # начинается с top_quote (top_quote часто обрезан до 200 симв.).
    source: str | None = None
    if top_quote:
        quote_head = top_quote.strip().split("\n", 1)[0][:60]
        if quote_head:
            src_row = (
                await db.execute(
                    select(Review.source)
                    .where(
                        Review.company_id == company_id,
                        Review.raw_text.ilike(f"{quote_head}%"),
                    )
                    .order_by(Review.posted_at.desc().nullslast())
                    .limit(1)
                )
            ).first()
            if src_row is not None:
                source = src_row[0]

    return TopPain(
        pain_tag_id=int(pain_tag_id),
        label=str(label),
        mention_count=int(mention_count or 0),
        top_quote=top_quote,
        source=source,
    )


async def compute_negative_trend_verdict(db: AsyncSession, company_id: int) -> str:
    """Дублирует логику `/maps/companies/{id}/negative-trend` для встраивания
    в контекст КП без HTTP-round-trip. Возвращает rising/falling/stable/no_data.
    """
    now = datetime.now(timezone.utc)

    async def count_neg(since: datetime, until: datetime | None) -> int:
        q = (
            select(sa_func.count(Review.id))
            .where(
                Review.company_id == company_id,
                Review.posted_at >= since,
                or_(
                    Review.sentiment.in_(["negative", "neutral"]),
                    and_(Review.sentiment.is_(None), Review.rating <= 3),
                ),
            )
        )
        if until is not None:
            q = q.where(Review.posted_at < until)
        return int((await db.execute(q)).scalar_one() or 0)

    last30 = await count_neg(now - timedelta(days=30), None)
    prev30 = await count_neg(now - timedelta(days=60), now - timedelta(days=30))
    prev60 = await count_neg(now - timedelta(days=90), now - timedelta(days=60))
    total90 = last30 + prev30 + prev60
    if total90 < 3:
        return "no_data"
    if last30 >= 3 and last30 > prev30 * 1.5:
        return "rising"
    if prev30 >= 3 and last30 < prev30 * 0.5:
        return "falling"
    return "stable"


async def compute_benchmark_ratio(
    db: AsyncSession, company: Company, pain_tag_id: int
) -> float | None:
    """Считает ratio для конкретной боли (Эпик D §3 контекста).

    Возвращает None если ниши/города компании нет, либо в нише <1 компании
    с этой болью — фразу опускаем.
    """
    from app.models.pain_tag import CompanyPainScore

    if not company.niche:
        return None

    siblings_q = select(sa_func.count(Company.id)).where(Company.niche == company.niche)
    if company.city is not None:
        siblings_q = siblings_q.where(Company.city == company.city)
    niche_companies_total = int((await db.execute(siblings_q)).scalar_one() or 0)
    if niche_companies_total == 0:
        return None

    # Упоминания у этой компании.
    company_mentions = int(
        (
            await db.execute(
                select(sa_func.coalesce(CompanyPainScore.mention_count, 0)).where(
                    CompanyPainScore.company_id == company.id,
                    CompanyPainScore.pain_tag_id == pain_tag_id,
                )
            )
        ).scalar_one_or_none()
        or 0
    )

    # Сумма по нише (+опционально city).
    niche_total_q = (
        select(sa_func.coalesce(sa_func.sum(CompanyPainScore.mention_count), 0))
        .join(Company, Company.id == CompanyPainScore.company_id)
        .where(
            CompanyPainScore.pain_tag_id == pain_tag_id,
            Company.niche == company.niche,
        )
    )
    if company.city is not None:
        niche_total_q = niche_total_q.where(Company.city == company.city)
    niche_total = int((await db.execute(niche_total_q)).scalar_one() or 0)

    niche_avg = niche_total / niche_companies_total if niche_companies_total > 0 else 0.0
    denom = max(0.25, niche_avg)
    return round(company_mentions / denom, 2)


async def compute_niche_avg_rating(db: AsyncSession, company: Company) -> float | None:
    """Средний рейтинг по нише+городу (для строки «средний по нише {avg}»).

    None если ниша/выборка пустые.
    """
    if not company.niche:
        return None
    q = select(sa_func.avg(Company.rating)).where(
        Company.niche == company.niche,
        Company.rating.is_not(None),
    )
    if company.city is not None:
        q = q.where(Company.city == company.city)
    val = (await db.execute(q)).scalar_one_or_none()
    if val is None:
        return None
    return round(float(val), 2)


# --- Промпт-сборщик ---------------------------------------------------------


def build_kp_prompt(
    *,
    sender_profile: str,
    offer_hint: str,
    tone: str,
    company_name: str,
    niche: str,
    city: str,
    pain_label: str | None,
    pain_mention_count: int | None,
    top_quote: str | None,
    trend_verdict: str,
    benchmark_ratio: float | None,
    website: str | None,
    rating: float | None,
    niche_avg_rating: float | None,
) -> str:
    """Чистая функция: собирает итоговый текст промпта.

    Строки факт-блока, по которым данных нет, пропускаются — это
    требование Эпика D («без натянутых аргументов»).
    """
    parts: list[str] = []
    parts.append(KP_PROMPT_HEADER.format(sender_profile=sender_profile))
    parts.append(
        KP_PROMPT_RECIPIENT.format(
            company_name=company_name or "—",
            niche=niche or "—",
            city=city or "—",
        )
    )

    facts: list[str] = []
    if pain_label and pain_mention_count is not None:
        facts.append(
            KP_FACT_PAIN_LINE.format(
                pain_label=pain_label,
                mention_count=pain_mention_count,
            )
        )
    if top_quote:
        # ограничим длину цитаты, чтобы промпт не разбухал на пьесах в отзывах
        safe_quote = top_quote.strip().replace("\n", " ")[:280]
        facts.append(KP_FACT_QUOTE_LINE.format(top_quote=safe_quote))
    tp = trend_phrase(trend_verdict)
    if tp:
        facts.append(KP_FACT_TREND_LINE.format(trend_phrase=tp))
    bp = benchmark_phrase(benchmark_ratio)
    if bp:
        facts.append(KP_FACT_BENCHMARK_LINE.format(benchmark_phrase=bp))
    facts.append(KP_FACT_WEBSITE_LINE.format(website_status=website_status_phrase(website)))
    if rating is not None:
        if niche_avg_rating is not None:
            facts.append(KP_FACT_RATING_LINE.format(rating=rating, niche_avg=niche_avg_rating))
        else:
            facts.append(KP_FACT_RATING_NO_AVG_LINE.format(rating=rating))

    parts.append("\n".join(facts))
    parts.append(
        KP_PROMPT_TAIL.format(
            offer_hint=offer_hint or "—",
            tone=TONE_HINTS.get(tone, tone),
        )
    )
    return "".join(parts)


# --- JSON-парсинг -----------------------------------------------------------


_JSON_FENCE_RE = re.compile(r"```(?:json)?\s*(\{.*?\})\s*```", re.DOTALL)


def extract_kp_json(raw: str) -> dict[str, str] | None:
    """Тянет {subject, body} из ответа LLM. Терпим к ```json fence``` и
    к строкам-обёрткам типа 'Готово: {...}'. Если subject или body не
    str — возвращает None.
    """
    if not raw:
        return None
    raw = raw.strip()

    # 1. Прямой парс.
    try:
        obj = json.loads(raw)
    except Exception:
        obj = None

    # 2. Из fence.
    if obj is None:
        m = _JSON_FENCE_RE.search(raw)
        if m:
            try:
                obj = json.loads(m.group(1))
            except Exception:
                obj = None

    # 3. Поиск первой `{...}` пары.
    if obj is None:
        start = raw.find("{")
        end = raw.rfind("}")
        if start != -1 and end != -1 and end > start:
            try:
                obj = json.loads(raw[start : end + 1])
            except Exception:
                obj = None

    if not isinstance(obj, dict):
        return None
    subject = obj.get("subject")
    body = obj.get("body")
    if not isinstance(subject, str) or not isinstance(body, str):
        return None
    subject = subject.strip()
    body = body.strip()
    if not subject or not body:
        return None
    return {"subject": subject, "body": body}


# --- Главная корутина -------------------------------------------------------


class KpGenerationError(Exception):
    """Ошибка генерации КП с понятным сообщением для юзера. Роутер
    конвертирует в HTTPException 409/503.
    """

    def __init__(self, message: str, status_code: int = 409):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


@dataclass
class GeneratedKp:
    """Результат сервиса для роутера."""

    draft_row: KpDraft
    arguments_used: dict[str, Any]


async def _resolve_template(
    db: AsyncSession, template_key: str, custom_sender_profile: str | None
) -> tuple[str, str]:
    """Возвращает (sender_profile, offer_hint).

    Для системных шаблонов берёт значения из БД.
    Для template_key='custom' — берёт custom_sender_profile, offer_hint = "".
    """
    row = (
        await db.execute(
            select(KpTemplate.key, KpTemplate.sender_profile, KpTemplate.offer_hint)
            .where(KpTemplate.key == template_key, KpTemplate.is_system.is_(True))
            .limit(1)
        )
    ).first()
    if row is None:
        raise KpGenerationError(
            f"Шаблон '{template_key}' не найден. Открой селект шаблонов заново.",
            status_code=404,
        )
    key, sender_profile, offer_hint = row
    if key == "custom":
        profile = (custom_sender_profile or "").strip()
        if not profile:
            raise KpGenerationError(
                "Для шаблона «Свой вариант» нужно описание профиля отправителя "
                "(1-2 предложения о вас).",
                status_code=400,
            )
        return profile, ""
    return sender_profile, offer_hint


async def _resolve_user_organization_id(db: AsyncSession, user_id: int) -> int | None:
    """Берёт первую (по id) организацию юзера. NULL если ни одной нет —
    KpDraft.organization_id nullable.
    """
    row = (
        await db.execute(
            select(user_organizations.c.organization_id)
            .where(user_organizations.c.user_id == user_id)
            .order_by(user_organizations.c.organization_id.asc())
            .limit(1)
        )
    ).first()
    if row is None:
        return None
    return int(row[0])


async def generate_kp(
    db: AsyncSession,
    *,
    user_id: int,
    company_id: int,
    template_key: str,
    tone: str = "neutral",
    custom_sender_profile: str | None = None,
) -> GeneratedKp:
    """Главная функция: собирает контекст, зовёт LLM, парсит, пишет в БД.

    Бросает KpGenerationError(message, status_code) на ожидаемые ошибки
    (нет шаблона / нет болей / LLM недоступен / битый JSON после ретрая).
    """
    # 1. Компания
    company = await db.get(Company, company_id)
    if company is None:
        raise KpGenerationError("Компания не найдена.", status_code=404)

    # 2. Шаблон → sender_profile + offer_hint
    sender_profile, offer_hint = await _resolve_template(
        db, template_key, custom_sender_profile
    )

    # 3. Топ-боль (опционально — Юзер 2026-06-12 #2: КП должна работать и
    #    у компаний без проанализированных болей, генерируя «общее» письмо
    #    по шаблону. Раньше тут стоял 409 «нет болей» — это блокировало
    #    UX-кейс «я уверен, что хочу написать этой компании», особенно
    #    для компаний из списков, у которых AI-анализ ещё не успел добежать).
    top_pain = await load_top_pain(db, company_id)
    has_pain_with_quote = top_pain is not None and bool(top_pain.top_quote)

    # 4. Тренд + бенчмарк + средний рейтинг ниши
    trend_verdict = await compute_negative_trend_verdict(db, company_id)
    ratio = (
        await compute_benchmark_ratio(db, company, top_pain.pain_tag_id)
        if top_pain is not None
        else None
    )
    niche_avg_rating = await compute_niche_avg_rating(db, company)

    # 5. Промпт. build_kp_prompt уже умеет пропускать строки факт-блока,
    # по которым нет данных (см. test_build_prompt_no_pain_skips_pain_lines).
    # В отсутствие боли LLM получает только контекст по компании + sender_profile
    # + offer_hint и пишет «общее» предложение по шаблону.
    prompt_text = build_kp_prompt(
        sender_profile=sender_profile,
        offer_hint=offer_hint,
        tone=tone,
        company_name=company.name or "",
        niche=company.niche or "",
        city=company.city or "",
        pain_label=top_pain.label if has_pain_with_quote else None,
        pain_mention_count=top_pain.mention_count if has_pain_with_quote else None,
        top_quote=top_pain.top_quote if has_pain_with_quote else None,
        trend_verdict=trend_verdict,
        benchmark_ratio=ratio,
        website=company.website,
        rating=float(company.rating) if company.rating is not None else None,
        niche_avg_rating=niche_avg_rating,
    )

    # 6. LLM
    assistant_id = await pick_assistant_id(db, "outreach_draft")
    if assistant_id is None:
        raise KpGenerationError(
            "LLM-ассистент для генерации КП не настроен. Проверь "
            "OPENAI_API_KEY / OPENAI_BASE_URL и наличие ассистента "
            "'reviews_ai_outreach_draft'.",
            status_code=503,
        )

    parsed: dict[str, str] | None = None
    try:
        raw = await chat(
            assistant_id=assistant_id,
            messages=[{"role": "user", "content": prompt_text}],
            db=db,
            max_tokens=900,
            temperature=0.6,
        )
        parsed = extract_kp_json(raw)
    except Exception as e:
        logger.warning("generate_kp: first chat() failed: %s", e)
        parsed = None

    # Ретрай: попросим строго JSON.
    if parsed is None:
        retry_prompt = (
            prompt_text
            + "\n\nВажно: твой предыдущий ответ не удалось распарсить. "
            "Верни СТРОГО валидный JSON в одну строку, без markdown-fence "
            "и без префиксов: {\"subject\": \"...\", \"body\": \"...\"}"
        )
        try:
            raw = await chat(
                assistant_id=assistant_id,
                messages=[{"role": "user", "content": retry_prompt}],
                db=db,
                max_tokens=900,
                temperature=0.3,
            )
            parsed = extract_kp_json(raw)
        except Exception as e:
            logger.warning("generate_kp: retry chat() failed: %s", e)
            parsed = None

    if parsed is None:
        raise KpGenerationError(
            "LLM вернула невалидный ответ дважды. Попробуй ещё раз через минуту "
            "или смени шаблон.",
            status_code=422,
        )

    # 7. Persist. Поля с pain/quote/source — None если у компании не было
    # проанализированных болей. UI блок «Аргументы» рендерит только
    # ненулевые значения, так что «общее» КП визуально отличимо от
    # «КП по конкретной боли».
    arguments_used = {
        "pain_label": top_pain.label if has_pain_with_quote else None,
        "quote": top_pain.top_quote if has_pain_with_quote else None,
        "mention_count": top_pain.mention_count if has_pain_with_quote else None,
        "trend": trend_verdict,
        "trend_phrase": trend_phrase(trend_verdict),
        "benchmark_ratio": ratio,
        "benchmark_phrase": benchmark_phrase(ratio),
        "source": top_pain.source if has_pain_with_quote else None,
        "sender_profile": sender_profile,
        "offer_hint": offer_hint,
        "tone": tone,
        "template_key": template_key,
    }

    organization_id = await _resolve_user_organization_id(db, user_id)
    draft = KpDraft(
        user_id=user_id,
        organization_id=organization_id,
        company_id=company_id,
        template_key=template_key,
        subject=parsed["subject"][:500],
        body=parsed["body"],
        arguments_used=arguments_used,
    )
    db.add(draft)
    await db.commit()
    await db.refresh(draft)

    return GeneratedKp(draft_row=draft, arguments_used=arguments_used)


# --- Список шаблонов --------------------------------------------------------


async def list_kp_templates(db: AsyncSession) -> list[KpTemplate]:
    """Системные шаблоны + (на будущее) пользовательские. Сейчас фильтр
    is_system=True достаточен — пользовательских ещё нет.
    """
    rows = (
        await db.execute(
            select(KpTemplate)
            .where(KpTemplate.is_system.is_(True))
            .order_by(KpTemplate.id.asc())
        )
    ).scalars().all()
    return list(rows)
