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
from app.models.site_lead import SiteLead
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
    KP_FACT_SITE_ENTRY_LINE,
    KP_FACT_SITE_URL_LINE,
    KP_FACT_TREND_LINE,
    KP_FACT_WEBSITE_LINE,
    KP_PROMPT_HEADER,
    KP_PROMPT_RECIPIENT,
    KP_PROMPT_TAIL,
    TONE_HINTS,
    lookup_entry_meaning,
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


async def _resolve_pain_source(
    db: AsyncSession, company_id: int, top_quote: str | None
) -> str | None:
    """best-effort: определить источник (2gis/yandex_maps/google) по цитате,
    находя Review с такой же головой текста. Общий хелпер — используется и
    в load_top_pain, и в load_pains_by_ids."""
    if not top_quote:
        return None
    quote_head = top_quote.strip().split("\n", 1)[0][:60]
    if not quote_head:
        return None
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
    return src_row[0] if src_row is not None else None


async def load_pains_by_ids(
    db: AsyncSession, company_id: int, pain_tag_ids: list[int]
) -> list[TopPain]:
    """Загрузить конкретные боли по списку id (2026-07-11: multi-pain КП).

    Возвращает TopPain-объекты только для тех id, у которых у компании
    реально есть CompanyPainScore. Сортирует по mention_count desc, чтобы
    в промпте LLM боли шли от «мясистой» к «мелкой». Пустой список — если
    ни одна из указанных болей у компании не проанализирована."""
    from app.models.pain_tag import CompanyPainScore, PainTag

    if not pain_tag_ids:
        return []
    rows = (
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
                CompanyPainScore.pain_tag_id.in_(pain_tag_ids),
                PainTag.status == "active",
            )
            .order_by(CompanyPainScore.mention_count.desc().nullslast())
        )
    ).all()
    out: list[TopPain] = []
    for pain_tag_id, label, mention_count, top_quote in rows:
        source = await _resolve_pain_source(db, company_id, top_quote)
        out.append(
            TopPain(
                pain_tag_id=int(pain_tag_id),
                label=str(label),
                mention_count=int(mention_count or 0),
                top_quote=top_quote,
                source=source,
            )
        )
    return out


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
    additional_pains: list[dict] | None = None,
) -> str:
    """Чистая функция: собирает итоговый текст промпта для КП по компании.

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
    # 2026-07-11 multi-pain: 2-я и 3-я боль, если юзер выбрал несколько.
    # LLM в KP_PROMPT_TAIL получает инструкцию затронуть КАЖДУЮ.
    for extra in additional_pains or []:
        extra_label = extra.get("label")
        extra_mention = extra.get("mention_count")
        extra_quote = extra.get("top_quote")
        if extra_label and extra_mention is not None:
            facts.append(
                KP_FACT_PAIN_LINE.format(
                    pain_label=extra_label, mention_count=extra_mention
                )
            )
        if extra_quote:
            safe_extra_quote = str(extra_quote).strip().replace("\n", " ")[:280]
            facts.append(KP_FACT_QUOTE_LINE.format(top_quote=safe_extra_quote))
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


def build_kp_prompt_for_site(
    *,
    sender_profile: str,
    offer_hint: str,
    tone: str,
    url: str,
    domain: str,
    title: str | None,
    entry: str | None,
    entry_meaning: str | None,
) -> str:
    """Промпт для КП по найденному сайту (Эпик F, ТЗ 2026-06-12).

    Альтернативная ветка к build_kp_prompt: получатель идентифицируется
    доменом и url (не company_name + niche + city). Контекст:
      - URL (обязательно)
      - title из поисковой выдачи (если есть — добавляем в «получатель»)
      - найденное вхождение + его трактовка через словарь ENTRY_MEANINGS
        (если трактовки нет — строка про признак пропускается).

    Эти данные приходят из SiteLead (миграция 034).
    """
    parts: list[str] = []
    parts.append(KP_PROMPT_HEADER.format(sender_profile=sender_profile))

    # «Получатель»-блок для сайта — используем доменное имя + title,
    # без niche/city (мы не знаем нишу из web-поиска). KP_PROMPT_RECIPIENT
    # не подходит как есть — формируем строку отдельно.
    if title:
        receiver_line = f"Получатель: {domain} ({title})."
    else:
        receiver_line = f"Получатель: {domain}."
    parts.append(
        "\n" + receiver_line + "\n"
        "Факты о получателе (используй ТОЛЬКО их, ничего не выдумывай):\n"
    )

    facts: list[str] = [KP_FACT_SITE_URL_LINE.format(url=url)]
    if entry and entry_meaning:
        facts.append(
            KP_FACT_SITE_ENTRY_LINE.format(entry=entry, entry_meaning=entry_meaning)
        )
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


def _escape_unescaped_newlines_in_json_strings(s: str) -> str:
    """Костыль для LLM-JSON: модели часто кладут literal '\\n' в строковые
    значения (вместо escape-последовательности), и json.loads падает с
    'Invalid control character'. Проходим по строке, отслеживаем кавычки
    и backslash-escape, и заменяем raw newline на '\\n' только внутри
    string-литералов.

    Не идеально (не обрабатываем все случаи), но снимает 90% LLM-битых JSON.
    """
    out: list[str] = []
    in_string = False
    escape = False
    for ch in s:
        if escape:
            out.append(ch)
            escape = False
            continue
        if ch == "\\":
            out.append(ch)
            escape = True
            continue
        if ch == '"':
            in_string = not in_string
            out.append(ch)
            continue
        if in_string and ch == "\n":
            out.append("\\n")
            continue
        if in_string and ch == "\r":
            out.append("\\r")
            continue
        if in_string and ch == "\t":
            out.append("\\t")
            continue
        out.append(ch)
    return "".join(out)


_PLAIN_SUBJECT_LABELS = ("тема:", "тема письма:", "subject:", "тема —", "тема -")


def _extract_kp_plaintext(raw: str) -> dict[str, str] | None:
    """Финальный фолбэк: LLM полностью забила на JSON и вернула голый
    текст письма. Пытаемся вытащить тему и тело эвристикой.

    Стратегии (по приоритету):
    1. Строка «Тема: ...» / «Subject: ...» где-то в начале → subject,
       остальное → body.
    2. Первая короткая строка (≤120 символов, нет точки в конце предложения)
       → subject. Остальное (после её следующего абзаца) → body.
    3. Если в тексте есть «Здравствуйте,» — всё до неё считается мусором,
       subject = первая строка, body = от «Здравствуйте,» до конца.

    Возвращает None если в raw меньше 40 символов содержательного текста.
    """
    if not raw:
        return None
    text = raw.strip()
    # Срезаем markdown-fence/префиксные комментарии.
    text = re.sub(r"^```\w*\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    text = text.strip()
    if len(text) < 40:
        return None

    lines = [ln.rstrip() for ln in text.split("\n")]

    # Стратегия 1: явная метка «Тема: ...»
    subject_line_idx = -1
    subject_value: str | None = None
    for i, ln in enumerate(lines[:8]):  # ищем только в первых 8 строках
        low = ln.lstrip().lower()
        for lab in _PLAIN_SUBJECT_LABELS:
            if low.startswith(lab):
                subject_value = ln.lstrip()[len(lab):].strip(" \"'«»–—-")
                subject_line_idx = i
                break
        if subject_value:
            break

    if subject_value:
        # body = всё после строки темы, отбрасываем подряд идущие
        # «Тело:»/«Body:» метки в начале.
        rest = "\n".join(lines[subject_line_idx + 1:]).strip()
        rest = re.sub(r"^(тело|body|текст письма|письмо)[:\-—]\s*", "", rest, flags=re.IGNORECASE).strip()
        if rest:
            return {"subject": subject_value[:500], "body": rest}

    # Стратегия 2: первая непустая короткая строка как subject,
    # дальше — body. Подходит когда LLM пишет «Заголовок\n\nТело письма».
    non_empty = [(i, ln.strip()) for i, ln in enumerate(lines) if ln.strip()]
    if non_empty:
        first_idx, first_line = non_empty[0]
        # Subject должен быть короткой однострочной строкой (тема письма)
        # — если первая строка длинная, она скорее всего часть body
        # «Здравствуйте, Иван! Заметил...».
        is_greeting = first_line.lower().startswith(("здравствуйте", "добрый день", "приветствую", "уважаем"))
        if not is_greeting and len(first_line) <= 120 and not first_line.endswith("."):
            rest = "\n".join(lines[first_idx + 1:]).strip()
            if len(rest) >= 30:  # body должен быть содержательным
                return {"subject": first_line[:500], "body": rest}

    # Стратегия 3: есть «Здравствуйте» — берём тему как первую строку
    # перед ним, тело как «Здравствуйте» и всё что после.
    greet_match = re.search(r"(?im)^(здравствуйте|добрый день|приветствую|уважаем)", text)
    if greet_match:
        body_start = greet_match.start()
        before = text[:body_start].strip()
        body_part = text[body_start:].strip()
        if body_part:
            subject = before.splitlines()[-1].strip() if before else "Холодное письмо"
            subject = subject.lstrip("# ").strip(" \"'«»–—-")
            if not subject:
                subject = "Холодное письмо"
            return {"subject": subject[:500], "body": body_part}

    # Если ничего не вышло — отдаём всё как body, subject — generic.
    # Это самый last-resort, лучше показать юзеру что-то, чем 422.
    # 2026-06-18: порог 80 → 40 символов. На проде ловили 422 на компаниях
    # без проанализированных болей (короткий промпт → LLM иногда возвращает
    # 1-2 строки без приветствия). Лучше показать юзеру сырой набросок,
    # который он сам отредактирует в editable-полях (PR #73), чем 422.
    if len(text) >= 40:
        return {"subject": "Холодное письмо под боль клиентов", "body": text}

    return None


def extract_kp_json(raw: str) -> dict[str, str] | None:
    """Тянет {subject, body} из ответа LLM. Терпим к ```json fence```,
    к строкам-обёрткам типа 'Готово: {...}', к unescaped newlines внутри
    строковых значений (классика LLM-JSON) и к голому тексту без JSON
    вообще (LLM забила на формат — парсим эвристикой). Если в raw нет
    минимально-содержательного текста — возвращает None.
    """
    if not raw:
        return None
    raw = raw.strip()

    def _try_parse(s: str) -> Any:
        try:
            return json.loads(s)
        except Exception:
            pass
        # Lossy: LLM любит класть literal \n вместо \\n. Эскейпим и
        # пробуем повторно. Только текст внутри string-литералов.
        try:
            return json.loads(_escape_unescaped_newlines_in_json_strings(s))
        except Exception:
            return None

    # 1. Прямой парс.
    obj = _try_parse(raw)

    # 2. Из fence.
    if obj is None:
        m = _JSON_FENCE_RE.search(raw)
        if m:
            obj = _try_parse(m.group(1))

    # 3. Поиск первой `{...}` пары.
    if obj is None:
        start = raw.find("{")
        end = raw.rfind("}")
        if start != -1 and end != -1 and end > start:
            obj = _try_parse(raw[start : end + 1])

    if isinstance(obj, dict):
        subject_raw = obj.get("subject", "")
        body = obj.get("body")
        # Для мессенджер-канала (промпт «4 хода») subject обязан быть
        # пустым — раньше это ловилось как ошибка и весь сырой JSON падал
        # в plaintext-фолбэк. Теперь пустой/отсутствующий subject допустим,
        # достаточно валидного body.
        if isinstance(body, str):
            subject = subject_raw.strip() if isinstance(subject_raw, str) else ""
            body = body.strip()
            if body:
                return {"subject": subject, "body": body}

    # 4. Финальный фолбэк: голый текст. Юзер 2026-06-12 упёрся в «422
    # дважды» — теперь даже если LLM полностью забила на JSON и пишет
    # plaintext-письмо, мы его разберём эвристически. Лучше показать
    # что-то, что юзер сможет поправить, чем глухое «не получилось».
    return _extract_kp_plaintext(raw)


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


async def _call_llm_with_retry(
    db: AsyncSession,
    assistant_id: int,
    prompt_text: str,
) -> dict[str, str]:
    """Один вызов LLM + 1 ретрай с строгой JSON-инструкцией.
    Бросает KpGenerationError(422) если ни первый, ни ретрай не дали
    валидный {subject, body}. Поднята из generate_kp для переиспользования
    в site-варианте.

    2026-06-12: max_tokens 900 → 2200 (русское письмо 110-160 слов плюс
    JSON-обёртка плюс возможный markdown-fence не помещалось, ответ
    обрезался, JSON оставался битым). Temperature первой попытки 0.6 → 0.35
    (для structured-output меньше галлюцинаций формата). Raw-ответ при
    неудаче логгируется первыми 800 символами — иначе в проде непонятно,
    что именно вернула модель.
    """
    parsed: dict[str, str] | None = None
    raw_first: str | None = None
    try:
        raw_first = await chat(
            assistant_id=assistant_id,
            messages=[{"role": "user", "content": prompt_text}],
            db=db,
            max_tokens=2200,
            temperature=0.35,
        )
        parsed = extract_kp_json(raw_first)
    except Exception as e:
        logger.warning("generate_kp: first chat() failed: %s", e)
        parsed = None
    if parsed is None and raw_first is not None:
        logger.warning(
            "generate_kp: first response unparseable (len=%d): %r",
            len(raw_first),
            raw_first[:800],
        )

    if parsed is None:
        retry_prompt = (
            prompt_text
            + "\n\nВажно: твой предыдущий ответ не удалось распарсить. "
            "Верни СТРОГО валидный JSON в одну строку, без markdown-fence, "
            "без префиксов и без комментариев после JSON. Внутри строковых "
            "значений переносы строк экранируй как \\n. "
            "Формат: {\"subject\": \"...\", \"body\": \"...\"}"
        )
        raw_retry: str | None = None
        try:
            raw_retry = await chat(
                assistant_id=assistant_id,
                messages=[{"role": "user", "content": retry_prompt}],
                db=db,
                max_tokens=2200,
                temperature=0.2,
            )
            parsed = extract_kp_json(raw_retry)
        except Exception as e:
            logger.warning("generate_kp: retry chat() failed: %s", e)
            parsed = None
        if parsed is None and raw_retry is not None:
            logger.warning(
                "generate_kp: retry response unparseable (len=%d): %r",
                len(raw_retry),
                raw_retry[:800],
            )

    if parsed is None:
        # 2026-06-18: в detail подкладываем первые 240 символов последнего
        # сырого ответа LLM. Раньше юзер видел только глухое «LLM вернула
        # невалидный ответ дважды» и не понимал, что чинить: квоту, модель,
        # промпт. Теперь видно, что именно вернула модель — обычно сразу
        # понятно («provider error», «rate limit», пустой ответ).
        sample = (raw_retry or raw_first or "").strip()[:240]
        hint = (
            f"LLM вернула невалидный ответ дважды. "
            f"Сырой ответ модели: {sample!r}. "
            f"Попробуй ещё раз через минуту или смени шаблон."
            if sample
            else "LLM вернула пустой ответ дважды. Возможно исчерпана квота "
            "ProxyAPI или ассистент не настроен. Проверь /settings/ai-assistants."
        )
        raise KpGenerationError(hint, status_code=422)
    return parsed


async def generate_kp_for_site(
    db: AsyncSession,
    *,
    user_id: int,
    site_lead_id: int,
    template_key: str,
    tone: str = "neutral",
    custom_sender_profile: str | None = None,
) -> GeneratedKp:
    """Эпик F: генерация КП по найденному сайту (SiteLead).

    Отличается от обычного generate_kp:
      - вместо Company грузим SiteLead
      - вместо болей/тренда/бенчмарка — site URL + entry + entry_meaning
      - persist в kp_drafts с company_id=None, site_lead_id=site_lead.id
        (CHECK ck_kp_drafts_company_xor_site_lead это разрешает)
    """
    site_lead = await db.get(SiteLead, site_lead_id)
    if site_lead is None:
        raise KpGenerationError("Site-лид не найден.", status_code=404)
    if site_lead.user_id != user_id:
        # Не отдаём 403 чтобы не палить факт существования id чужому юзеру.
        raise KpGenerationError("Site-лид не найден.", status_code=404)

    sender_profile, offer_hint = await _resolve_template(
        db, template_key, custom_sender_profile
    )

    entry_meaning = lookup_entry_meaning(site_lead.entry)

    prompt_text = build_kp_prompt_for_site(
        sender_profile=sender_profile,
        offer_hint=offer_hint,
        tone=tone,
        url=site_lead.url,
        domain=site_lead.domain,
        title=site_lead.title,
        entry=site_lead.entry or None,
        entry_meaning=entry_meaning,
    )

    assistant_id = await pick_assistant_id(db, "outreach_draft")
    if assistant_id is None:
        raise KpGenerationError(
            "LLM-ассистент для генерации КП не настроен. Проверь "
            "OPENAI_API_KEY / OPENAI_BASE_URL и наличие ассистента "
            "'reviews_ai_outreach_draft'.",
            status_code=503,
        )

    parsed = await _call_llm_with_retry(db, assistant_id, prompt_text)

    arguments_used = {
        # Поля компании пусты — это site-вариант.
        "pain_label": None,
        "quote": None,
        "mention_count": None,
        "trend": None,
        "trend_phrase": None,
        "benchmark_ratio": None,
        "benchmark_phrase": None,
        "source": None,
        # Site-специфичные поля. UI-блок «Аргументы» рендерит их вместо
        # компании, если site_url != None.
        "site_url": site_lead.url,
        "site_domain": site_lead.domain,
        "entry": site_lead.entry or None,
        "entry_meaning": entry_meaning,
        "sender_profile": sender_profile,
        "offer_hint": offer_hint,
        "tone": tone,
        "template_key": template_key,
    }

    organization_id = await _resolve_user_organization_id(db, user_id)
    draft = KpDraft(
        user_id=user_id,
        organization_id=organization_id,
        company_id=None,
        site_lead_id=site_lead.id,
        template_key=template_key,
        subject=parsed["subject"][:500],
        body=parsed["body"],
        arguments_used=arguments_used,
    )
    db.add(draft)
    await db.commit()
    await db.refresh(draft)

    return GeneratedKp(draft_row=draft, arguments_used=arguments_used)


async def generate_kp(
    db: AsyncSession,
    *,
    user_id: int,
    company_id: int,
    template_key: str,
    tone: str = "neutral",
    custom_sender_profile: str | None = None,
    pain_tag_ids: list[int] | None = None,
    use_4hods: bool = False,
    channel: str = "email",
    my_offer_step: str | None = None,
) -> GeneratedKp:
    """Главная функция: собирает контекст, зовёт LLM, парсит, пишет в БД.

    Бросает KpGenerationError(message, status_code) на ожидаемые ошибки
    (нет шаблона / нет болей / LLM недоступен / битый JSON после ретрая).

    pain_tag_ids: 2026-07-11 — если передан 1-3 id из плитки болей UI,
      письмо генерится по ЭТИМ болям (сортируем по mention_count desc).
      Если None/пусто — как раньше, топ-1 боль автоматически.

    use_4hods (2026-07-11): True — новый промпт-каркас «4 хода»
      (боль→последствие→решение→микрошаг). Валидация выхода
      (длина/один вопрос/ссылки/стоп-слова) + 1 регенерация.
      False — старый свободный промпт с фактами.

    channel: 'messenger'|'email' — только при use_4hods=True.
    my_offer_step: короткое описание ХОД4 (созвон / показ / мини-аудит).
    """
    # 1. Компания
    company = await db.get(Company, company_id)
    if company is None:
        raise KpGenerationError("Компания не найдена.", status_code=404)

    # 2. Шаблон → sender_profile + offer_hint
    sender_profile, offer_hint = await _resolve_template(
        db, template_key, custom_sender_profile
    )

    # 3. Боли. Если юзер выбрал в UI конкретные id (multi-pain) — грузим их.
    #    Иначе fallback на топ-1 (старое поведение до 2026-07-11).
    #    Юзер 2026-06-12 #2: КП работает и у компаний без проанализированных
    #    болей — LLM пишет «общее» письмо по шаблону.
    selected_pains: list[TopPain]
    if pain_tag_ids:
        selected_pains = await load_pains_by_ids(db, company_id, pain_tag_ids)
    else:
        top_pain = await load_top_pain(db, company_id)
        selected_pains = [top_pain] if top_pain is not None else []

    primary_pain = selected_pains[0] if selected_pains else None
    has_pain_with_quote = primary_pain is not None and bool(primary_pain.top_quote)

    # 4. Тренд + бенчмарк + средний рейтинг ниши (по первой боли)
    trend_verdict = await compute_negative_trend_verdict(db, company_id)
    ratio = (
        await compute_benchmark_ratio(db, company, primary_pain.pain_tag_id)
        if primary_pain is not None
        else None
    )
    niche_avg_rating = await compute_niche_avg_rating(db, company)

    # 5. ЛПР — имя для обращения (для 4hods-каркаса)
    recipient_first_name: str | None = None
    if use_4hods:
        from app.models.company_decision_maker import CompanyDecisionMaker
        marketing_dm = (await db.execute(
            select(CompanyDecisionMaker)
            .where(CompanyDecisionMaker.company_id == company_id)
            .where(CompanyDecisionMaker.is_marketing_dm.is_(True))
            .limit(1)
        )).scalar_one_or_none()
        if marketing_dm and marketing_dm.name:
            recipient_first_name = str(marketing_dm.name).strip().split()[0] or None

    # 6. Промпт. Ветвление: старый свободный vs новый каркас 4 ходов.
    additional_pains_for_prompt = [
        {
            "label": p.label,
            "mention_count": p.mention_count,
            "top_quote": p.top_quote,
        }
        for p in selected_pains[1:]
        if p.top_quote
    ]
    if use_4hods:
        # Новый каркас: подставляем боли + справочники + канал.
        from .pain_dictionaries import fill_pains
        from .kp_prompts_v2 import build_prompt_4hods
        pains_dicts = [
            {
                "label": p.label,
                "mention_count": p.mention_count,
                "top_quote": p.top_quote,
                "source": p.source,
                "pain_tag_id": p.pain_tag_id,
            }
            for p in selected_pains
        ]
        filled_pains = fill_pains(pains_dicts, offer_theme="automation")
        prompt_text = build_prompt_4hods(
            channel=channel,
            sender_profile=sender_profile,
            company_name=company.name or "",
            niche=company.niche or "",
            city=company.city or "",
            pains=filled_pains,
            my_offer_step=my_offer_step or "короткий созвон 10 минут",
            tone=tone,
            recipient_first_name=recipient_first_name,
        )
    else:
        prompt_text = build_kp_prompt(
            sender_profile=sender_profile,
            offer_hint=offer_hint,
            tone=tone,
            company_name=company.name or "",
            niche=company.niche or "",
            city=company.city or "",
            pain_label=primary_pain.label if has_pain_with_quote else None,
            pain_mention_count=primary_pain.mention_count if has_pain_with_quote else None,
            top_quote=primary_pain.top_quote if has_pain_with_quote else None,
            trend_verdict=trend_verdict,
            benchmark_ratio=ratio,
            website=company.website,
            rating=float(company.rating) if company.rating is not None else None,
            niche_avg_rating=niche_avg_rating,
            additional_pains=additional_pains_for_prompt,
        )

    # 7. LLM
    assistant_id = await pick_assistant_id(db, "outreach_draft")
    if assistant_id is None:
        raise KpGenerationError(
            "LLM-ассистент для генерации КП не настроен. Проверь "
            "OPENAI_API_KEY / OPENAI_BASE_URL и наличие ассистента "
            "'reviews_ai_outreach_draft'.",
            status_code=503,
        )

    parsed = await _call_llm_with_retry(db, assistant_id, prompt_text)

    # 7.1. Валидация выхода (только для 4hods): если нарушено — 1 повтор.
    #      Не прошло со второй попытки → пишем draft с флагом needs_review.
    validation_summary: str | None = None
    if use_4hods:
        from .kp_validator import validate_kp, issues_summary
        v = validate_kp(
            subject=str(parsed.get("subject") or ""),
            body=str(parsed.get("body") or ""),
            channel=channel,
        )
        if not v.ok:
            # 1 повтор.
            logger.info(
                "generate_kp 4hods validation failed on 1st try: %s",
                issues_summary(v.issues),
            )
            parsed_retry = await _call_llm_with_retry(db, assistant_id, prompt_text)
            v2 = validate_kp(
                subject=str(parsed_retry.get("subject") or ""),
                body=str(parsed_retry.get("body") or ""),
                channel=channel,
            )
            if v2.ok:
                parsed = parsed_retry
            else:
                # Оставляем лучший (по кол-ву issues) и помечаем needs_review.
                if len(v2.issues) < len(v.issues):
                    parsed = parsed_retry
                    validation_summary = issues_summary(v2.issues)
                else:
                    validation_summary = issues_summary(v.issues)
                logger.warning(
                    "generate_kp 4hods validation failed after retry: %s",
                    validation_summary,
                )

    # 7. Persist. Поля с pain/quote/source — None если у компании не было
    # проанализированных болей. UI блок «Аргументы» рендерит только
    # ненулевые значения, так что «общее» КП визуально отличимо от
    # «КП по конкретной боли».
    pains_payload = [
        {
            "pain_tag_id": p.pain_tag_id,
            "label": p.label,
            "top_quote": p.top_quote,
            "mention_count": p.mention_count,
            "source": p.source,
        }
        for p in selected_pains
    ] or None
    arguments_used = {
        "pain_label": primary_pain.label if has_pain_with_quote else None,
        "quote": primary_pain.top_quote if has_pain_with_quote else None,
        "mention_count": primary_pain.mention_count if has_pain_with_quote else None,
        "pains": pains_payload,
        "trend": trend_verdict,
        "trend_phrase": trend_phrase(trend_verdict),
        "benchmark_ratio": ratio,
        "benchmark_phrase": benchmark_phrase(ratio),
        "source": primary_pain.source if has_pain_with_quote else None,
        "sender_profile": sender_profile,
        "offer_hint": offer_hint,
        "tone": tone,
        "template_key": template_key,
        # 2026-07-11 «4 хода»: мета-инфа для UI-плашки «На чём построено».
        "use_4hods": use_4hods,
        "channel": channel if use_4hods else None,
        "my_offer_step": my_offer_step if use_4hods else None,
        "validation_summary": validation_summary if use_4hods else None,
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
