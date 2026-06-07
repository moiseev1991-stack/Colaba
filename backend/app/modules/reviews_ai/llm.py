"""LLM-обёртки для reviews_ai.

Три публичные функции:
- pick_assistant_id(db, kind) — auto-pick подходящего ассистента из БД
- call_llm_sentiment(db, reviews) — JSON-array sentiment-классификация
- call_llm_cluster_naming(db, niche, sample) — {label, description}
- embed_texts(texts) — embeddings через OpenAI (sync httpx)

Все возвращают `None` при отсутствии настроенного ассистента / ключа —
не падают. Это позволяет AI-пайплайну gracefully отключиться, когда юзер
ещё не настроил `ai_assistant` или `OPENAI_API_KEY`.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any, Literal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.ai_assistant import AiAssistant
from app.modules.ai_assistants.client import chat
from app.modules.reviews_ai.prompts import (
    CLUSTER_NAMING_PROMPT,
    COMPANY_DESCRIPTION_PROMPT,
    OUTREACH_ANGLE_HINTS,
    OUTREACH_DRAFT_PROMPT,
    OUTREACH_LANGUAGE_HINTS,
    OUTREACH_TONE_HINTS,
    SENTIMENT_PROMPT,
)

logger = logging.getLogger(__name__)

AssistantKind = Literal[
    "sentiment", "naming", "outreach_draft", "custom_analysis", "company_description"
]


# ---------------------------------------------------------------------------
# Assistant picking
# ---------------------------------------------------------------------------


# Подсказки для auto-pick: какие имена модели предпочесть.
_KIND_HINTS: dict[AssistantKind, list[str]] = {
    "sentiment":           ["haiku", "gpt-4o-mini", "lite"],     # быстрые/дешёвые
    "naming":              ["sonnet", "gpt-4o", "pro", "opus"],  # качественные
    "outreach_draft":      ["sonnet", "gpt-4o", "gpt-4o-mini"],  # качественные, fallback
    "custom_analysis":     ["gpt-4o-mini", "haiku", "lite"],     # лёгкая модель
    "company_description": ["gpt-4o-mini", "haiku", "lite"],     # короткий текст — дёшево
}


async def pick_assistant_id(db: AsyncSession, kind: AssistantKind) -> int | None:
    """Возвращает id ai_assistant, подходящего для kind. Алгоритм:

    1. Если задан env REVIEWS_AI_SENTIMENT_ASSISTANT_NAME / _NAMING_ / _OUTREACH_DRAFT_ — ищем по name.
    2. Иначе — берём первый ассистент, у которого в model встречается одна из подсказок.
    3. Иначе — None (AI отключается gracefully).
    """
    if kind == "sentiment":
        explicit = (settings.REVIEWS_AI_SENTIMENT_ASSISTANT_NAME or "").strip()
    elif kind == "naming":
        explicit = (settings.REVIEWS_AI_NAMING_ASSISTANT_NAME or "").strip()
    elif kind == "outreach_draft":
        explicit = (settings.REVIEWS_AI_OUTREACH_DRAFT_ASSISTANT_NAME or "").strip()
    elif kind == "company_description":
        explicit = getattr(
            settings, "REVIEWS_AI_COMPANY_DESCRIPTION_ASSISTANT_NAME", ""
        )
        explicit = (explicit or "reviews_ai_company_description").strip()
    else:  # custom_analysis — нет отдельной env, всегда auto-pick
        explicit = ""

    if explicit:
        row = (await db.execute(
            select(AiAssistant.id).where(AiAssistant.name == explicit).limit(1)
        )).scalar_one_or_none()
        if row:
            return int(row)
        logger.info("reviews_ai: ассистент по имени %r не найден, переключаюсь на auto-pick", explicit)

    hints = _KIND_HINTS[kind]
    # выбираем первый assistant с подходящей моделью
    candidates = list((await db.execute(
        select(AiAssistant.id, AiAssistant.model).where(AiAssistant.model.isnot(None))
    )).all())
    for hint in hints:
        for cid, model in candidates:
            if model and hint in str(model).lower():
                return int(cid)

    # fallback — просто первый существующий
    if candidates:
        return int(candidates[0][0])
    return None


# ---------------------------------------------------------------------------
# JSON extraction
# ---------------------------------------------------------------------------


_JSON_FENCE_RE = re.compile(r"```(?:json)?\s*(\{.*?\}|\[.*?\])\s*```", re.DOTALL)


def _extract_json(raw: str) -> Any | None:
    """Достаёт JSON-объект/массив из ответа LLM, который мог обернуть его в ```json ... ```."""
    if not raw:
        return None
    s = raw.strip()
    try:
        return json.loads(s)
    except json.JSONDecodeError:
        pass
    m = _JSON_FENCE_RE.search(s)
    if m:
        try:
            return json.loads(m.group(1))
        except json.JSONDecodeError:
            return None
    # last-resort: ищем первую {...} или [...]
    for opener, closer in (("[", "]"), ("{", "}")):
        i = s.find(opener)
        j = s.rfind(closer)
        if i != -1 and j != -1 and j > i:
            try:
                return json.loads(s[i:j + 1])
            except json.JSONDecodeError:
                continue
    return None


# ---------------------------------------------------------------------------
# Sentiment
# ---------------------------------------------------------------------------


async def call_llm_sentiment(
    db: AsyncSession,
    reviews: list[dict[str, Any]],
) -> list[dict[str, Any]] | None:
    """reviews: список вида [{"id": 1, "text": "..."}].
    Возвращает [{"id": 1, "sentiment": "positive|negative|neutral", "score": 0.9}, ...]
    или None, если ассистент не настроен/упал."""
    if not reviews:
        return []
    assistant_id = await pick_assistant_id(db, "sentiment")
    if assistant_id is None:
        logger.info("call_llm_sentiment: no assistant available, skipping")
        return None

    prompt = SENTIMENT_PROMPT.format(reviews_json=json.dumps(reviews, ensure_ascii=False))
    # max_tokens: ~50 tokens на ответ для одного отзыва, плюс запас.
    # Caller должен бить большие батчи (см. compute_sentiment), но даём и тут потолок.
    max_tokens = max(800, len(reviews) * 60 + 200)
    try:
        raw = await chat(
            assistant_id=assistant_id,
            messages=[{"role": "user", "content": prompt}],
            db=db,
            max_tokens=max_tokens,
            temperature=0.1,
        )
    except Exception as e:
        logger.warning("call_llm_sentiment: chat() failed: %s", e)
        return None

    data = _extract_json(raw)
    if not isinstance(data, list):
        logger.warning(
            "call_llm_sentiment: ожидали list, получили %s. n_reviews=%d, raw[:300]=%r",
            type(data).__name__, len(reviews), (raw or "")[:300],
        )
        return None
    return data


# ---------------------------------------------------------------------------
# Cluster naming
# ---------------------------------------------------------------------------


async def call_llm_cluster_naming(
    db: AsyncSession,
    niche: str,
    sample_reviews: list[str],
) -> dict[str, str] | None:
    """Возвращает {"label": "...", "description": "..."} или None."""
    assistant_id = await pick_assistant_id(db, "naming")
    if assistant_id is None:
        logger.info("call_llm_cluster_naming: no assistant available")
        return None

    sample_str = "\n".join(f"- {t.strip()[:300]}" for t in sample_reviews if t)
    prompt = CLUSTER_NAMING_PROMPT.format(
        count=len(sample_reviews),
        niche=niche,
        reviews_sample=sample_str,
    )
    try:
        raw = await chat(
            assistant_id=assistant_id,
            messages=[{"role": "user", "content": prompt}],
            db=db,
            max_tokens=400,
            temperature=0.3,
        )
    except Exception as e:
        logger.warning("call_llm_cluster_naming: chat() failed: %s", e)
        return None

    data = _extract_json(raw)
    if not isinstance(data, dict):
        return None
    label = (data.get("label") or "").strip()
    desc = (data.get("description") or "").strip()
    if not label:
        return None
    return {"label": label[:200], "description": desc}


# ---------------------------------------------------------------------------
# Outreach draft
# ---------------------------------------------------------------------------


async def call_llm_outreach_draft(
    db: AsyncSession,
    *,
    company_name: str,
    niche: str,
    city: str,
    source: str,
    pains: list[dict[str, Any]],
    angle: str = "website",
    tone: str = "friendly",
    language: str = "ru",
    has_website: bool = False,
    has_email: bool = False,
    rating: float | None = None,
    reviews_count: int | None = None,
    recipient_first_name: str | None = None,
    recipient_post: str | None = None,
) -> dict[str, str] | None:
    """Возвращает {"subject": "...", "body": "..."} или None.

    pains — список вида [{"label": "Грязно", "quote": "...."}, ...] длиной 0-3.
    Если pains пуст — письмо строится только по angle/нише/городу (полезно
    для website-угла, где «нет отзывов» — нормально, главный аргумент сам
    angle).

    angle: один из ключей OUTREACH_ANGLE_HINTS (website/reputation/automation/seo).
    Неизвестный angle → fallback 'website'.
    """
    assistant_id = await pick_assistant_id(db, "outreach_draft")
    if assistant_id is None:
        logger.info("call_llm_outreach_draft: no assistant available")
        return None

    if angle not in OUTREACH_ANGLE_HINTS:
        angle = "website"

    if pains:
        pains_section = (
            "Из отзывов клиентов этой компании за последние месяцы видны "
            "такие повторяющиеся проблемы:\n"
            + "\n".join(
                f"- {p.get('label', '').strip() or 'без названия'}: "
                f"«{(p.get('quote') or '').strip()}»"
                for p in pains[:3]
            )
        )
    else:
        pains_section = (
            "Конкретных болей из отзывов нет (мало отзывов или они "
            "нейтральные). Опирайся на угол услуги и общий контекст."
        )

    company_context_parts = []
    if rating is not None:
        company_context_parts.append(f"рейтинг {rating:.1f}")
    if reviews_count is not None:
        company_context_parts.append(f"отзывов {reviews_count}")
    company_context_parts.append(
        "сайта нет" if not has_website else "сайт есть"
    )
    company_context_parts.append(
        "email есть" if has_email else "email пока не найден"
    )
    company_context = ", ".join(company_context_parts)

    angle_labels = {
        "website": "создание сайта",
        "reputation": "работа с репутацией / отзывами",
        "automation": "автоматизация контакта с клиентами",
        "seo": "SEO-продвижение",
    }
    # ЛПР (ТЗ A.1 2026-06-04): если есть ФИО руководителя — даём LLM
    # явное обращение, иначе письмо начинается «Здравствуйте!».
    if recipient_first_name:
        post_part = f" ({recipient_post})" if recipient_post else ""
        recipient_section = (
            f"Имя получателя — {recipient_first_name}{post_part}. "
            f"Обратись по имени в первом предложении: «Здравствуйте, {recipient_first_name}!». "
            f"Не используй отчество.\n"
        )
    else:
        recipient_section = (
            "Имя получателя неизвестно — начни с нейтрального «Здравствуйте!».\n"
        )

    prompt = OUTREACH_DRAFT_PROMPT.format(
        company_name=company_name or "—",
        niche=niche or "—",
        city=city or "—",
        source=source or "карты",
        recipient_section=recipient_section,
        pains_section=pains_section,
        angle_label=angle_labels.get(angle, angle),
        angle_hint=OUTREACH_ANGLE_HINTS[angle],
        company_context=company_context,
        tone_label=OUTREACH_TONE_HINTS.get(tone, OUTREACH_TONE_HINTS["friendly"]),
        language_label=OUTREACH_LANGUAGE_HINTS.get(
            language, OUTREACH_LANGUAGE_HINTS["ru"]
        ),
    )
    try:
        raw = await chat(
            assistant_id=assistant_id,
            messages=[{"role": "user", "content": prompt}],
            db=db,
            max_tokens=800,
            temperature=0.6,
        )
    except Exception as e:
        logger.warning("call_llm_outreach_draft: chat() failed: %s", e)
        return None

    data = _extract_json(raw)
    if not isinstance(data, dict):
        return None
    subject = (data.get("subject") or "").strip()
    body = (data.get("body") or "").strip()
    if not subject or not body:
        return None
    return {"subject": subject[:500], "body": body}


async def call_llm_company_description(
    db: AsyncSession,
    *,
    company_name: str,
    niche: str,
    city: str,
    rating: float | None,
    reviews_count: int | None,
    positive_quotes: list[str],
) -> str | None:
    """Возвращает короткое описание компании (1-2 предложения, до 220 chars)
    для hero/SEO нового сайта. None — если ассистент недоступен или LLM
    отдал пустоту/невалидный JSON.

    positive_quotes — 2-5 коротких позитивных отзывов клиентов.
    """
    assistant_id = await pick_assistant_id(db, "company_description")
    if assistant_id is None:
        logger.info("call_llm_company_description: no assistant available")
        return None

    quotes_block = (
        "\n".join(f"- «{q.strip()}»" for q in positive_quotes[:5] if q and q.strip())
        or "(нет позитивных цитат — опирайся только на рубрику)"
    )

    prompt = COMPANY_DESCRIPTION_PROMPT.format(
        company_name=company_name or "—",
        niche=niche or "—",
        city=city or "—",
        rating=f"{rating:.1f}" if rating is not None else "—",
        reviews_count=int(reviews_count or 0),
        positive_quotes=quotes_block,
    )
    try:
        raw = await chat(
            assistant_id=assistant_id,
            messages=[{"role": "user", "content": prompt}],
            db=db,
            max_tokens=300,
            temperature=0.5,
        )
    except Exception as e:
        logger.warning("call_llm_company_description: chat() failed: %s", e)
        return None

    data = _extract_json(raw)
    if not isinstance(data, dict):
        return None
    desc = (data.get("description") or "").strip()
    if not desc:
        return None
    # Hard-cap 280 chars — модель иногда промахивается.
    return desc[:280]


# ---------------------------------------------------------------------------
# Embeddings
# ---------------------------------------------------------------------------


EMBEDDING_BATCH_SIZE = 100


async def embed_texts(texts: list[str]) -> list[list[float]] | None:
    """OpenAI text-embedding-3-small (1536 dim). Без OPENAI_API_KEY → None.

    Yandex Embeddings (256 dim) реализуется отдельно по ТЗ; первая итерация — OpenAI.
    """
    if not texts:
        return []
    api_key = settings.OPENAI_API_KEY
    if not api_key:
        logger.info("embed_texts: OPENAI_API_KEY пуст — пайплайн без embeddings")
        return None

    model = settings.REVIEWS_AI_EMBEDDING_MODEL or "text-embedding-3-small"
    base_url = (settings.OPENAI_BASE_URL or "https://api.openai.com/v1").rstrip("/")

    import httpx

    results: list[list[float]] = []
    async with httpx.AsyncClient(timeout=60.0) as client:
        for i in range(0, len(texts), EMBEDDING_BATCH_SIZE):
            batch = texts[i:i + EMBEDDING_BATCH_SIZE]
            try:
                resp = await client.post(
                    f"{base_url}/embeddings",
                    headers={
                        "Authorization": f"Bearer {api_key}",
                        "Content-Type": "application/json",
                    },
                    json={"model": model, "input": batch},
                )
            except httpx.HTTPError as e:
                logger.warning("embed_texts: HTTP error %s", e)
                return None
            if resp.status_code != 200:
                logger.warning("embed_texts: status %d body=%s", resp.status_code, resp.text[:200])
                return None
            data = resp.json().get("data") or []
            for item in data:
                vec = item.get("embedding")
                if isinstance(vec, list):
                    results.append(vec)
    return results


# ---------------------------------------------------------------------------
# Custom analysis (user-defined prompt from a preset)
# ---------------------------------------------------------------------------


async def call_llm_custom_analysis(
    db: AsyncSession,
    *,
    user_prompt: str,
    company_name: str,
    niche: str,
    city: str,
    rating: float | None,
    reviews_count: int,
    negative_count: int,
    has_owner_replies: bool,
    sample_reviews: list[str],
) -> dict[str, Any] | None:
    """Применяет пользовательский промпт к компании. Возвращает {score, comment} или None.

    Промпт от юзера обрамляется системными инструкциями: контекст компании
    (имя, ниша, город, рейтинг, отзывы) и требование вернуть строгий JSON
    {"score": 0-10, "comment": "..."}. Если LLM не вернул число — score=None,
    но comment может быть полезным сам по себе.
    """
    user_prompt = (user_prompt or "").strip()
    if not user_prompt:
        return None
    assistant_id = await pick_assistant_id(db, "custom_analysis")
    if assistant_id is None:
        logger.info("call_llm_custom_analysis: no assistant available")
        return None

    sample_block = "\n".join(
        f"- «{(t or '').strip()[:400]}»"
        for t in sample_reviews[:5]
        if t
    ) or "(нет текстов отзывов)"

    full_prompt = (
        "Ты — аналитик B2B-лидов. Тебе дан критерий от пользователя и данные о "
        "компании. Оцени, насколько компания подходит под критерий по шкале 0-10 "
        "и кратко (1-2 предложения) обоснуй.\n\n"
        f"Критерий пользователя:\n«{user_prompt}»\n\n"
        f"Компания: {company_name or '—'}\n"
        f"Ниша: {niche or '—'}\n"
        f"Город: {city or '—'}\n"
        f"Рейтинг: {rating if rating is not None else '—'}\n"
        f"Всего отзывов: {reviews_count}\n"
        f"Негативных: {negative_count}\n"
        f"Владелец отвечает на отзывы: {'да' if has_owner_replies else 'нет'}\n\n"
        f"Примеры отзывов клиентов (до 5):\n{sample_block}\n\n"
        "Верни СТРОГО JSON одной строкой, без markdown-обёртки:\n"
        '{"score": <0-10 integer>, "comment": "<1-2 предложения>"}\n'
        "Если критерий не применим к компании — score=0 и в comment объясни почему."
    )
    try:
        raw = await chat(
            assistant_id=assistant_id,
            messages=[{"role": "user", "content": full_prompt}],
            db=db,
            max_tokens=200,
            temperature=0.3,
        )
    except Exception as e:
        logger.warning("call_llm_custom_analysis: chat() failed: %s", e)
        return None

    data = _extract_json(raw)
    if not isinstance(data, dict):
        return None
    score_raw = data.get("score")
    try:
        score = int(score_raw) if score_raw is not None else None
        if score is not None:
            score = max(0, min(10, score))
    except (TypeError, ValueError):
        score = None
    comment = (data.get("comment") or "").strip()[:1000]
    if score is None and not comment:
        return None
    return {"score": score, "comment": comment or None}
