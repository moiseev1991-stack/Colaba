"""Извлечение ЛПР со страниц сайта компании (ТЗ A.2 2026-06-04).

Стратегия:
1. Краулим серию страниц-кандидатов: /team /komanda /о-нас /about /контакты ...
2. Из HTML каждой страницы вытаскиваем чистый текст (BeautifulSoup → .get_text()).
3. Отправляем в LLM `call_llm_extract_team` — на выходе [{name, post, is_dm}].
4. Сохраняем в company_decision_makers с дедупом по lower(name) (UNIQUE индекс
   в БД, см. миграцию 032).

Whitelist ролей для is_decision_maker=True (если LLM не разметил):
руководитель/директор/владелец/основатель/учредитель/CEO/CMO/CTO/COO/
главврач/маркетолог/управляющий/шеф-повар.

Запускается Celery-таском `enrich_company_team_from_website` (см. tasks.py).
Триггерится после `enrich_company_contacts` если у компании есть website.
"""

from __future__ import annotations

import asyncio
import logging
import re
from urllib.parse import urljoin, urlparse

import httpx
from bs4 import BeautifulSoup
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.company_decision_maker import CompanyDecisionMaker
from app.models.maps import Company
from app.modules.maps.contact_validation import is_valid_email, is_valid_phone_ru
from app.modules.reviews_ai.llm import call_llm_extract_team


logger = logging.getLogger(__name__)


_TIMEOUT = httpx.Timeout(15.0, connect=10.0)
_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)

# Страницы-кандидаты на наличие ФИО + должностей. Порядок — от наиболее
# вероятных к менее. Краулер ходит по первым N (см. _MAX_PAGES).
#
# Группы:
#   website_team     — /team, /о-нас, /руководство — прямые ФИО+должности
#   website_contacts — /контакты — обычно офис-менеджеры, но иногда PR/marketing
#   website_partnership — /partnership, /reklama, /media — прямые контакты
#     отдела маркетинга/PR. B2B-страницы (франшиза, реклама, пресс-релизы).
#     Здесь чаще всего сидит именно marketing-DM (потому что эти страницы
#     сделаны для того, чтобы с отделом связывались рекламодатели).
#   website_career   — /career, /vacancies — иногда HR-контакт + прямой email
#     руководителя направления «ищем маркетолога».
_TEAM_PATHS: tuple[tuple[str, str], ...] = (
    ("/team", "website_team"),
    ("/komanda", "website_team"),
    ("/komand", "website_team"),
    ("/our-team", "website_team"),
    ("/staff", "website_team"),
    ("/personal", "website_team"),
    ("/sotrudniki", "website_team"),
    ("/o-nas", "website_about"),
    ("/about", "website_about"),
    ("/o-kompanii", "website_about"),
    ("/rukovodstvo", "website_about"),
    ("/management", "website_about"),
    # B2B / marketing / partnership — прямые контакты отдела маркетинга-PR
    ("/partnership", "website_partnership"),
    ("/partners", "website_partnership"),
    ("/franchise", "website_partnership"),
    ("/franchising", "website_partnership"),
    ("/franshiza", "website_partnership"),
    ("/reklama", "website_partnership"),
    ("/reklamodatelyam", "website_partnership"),
    ("/advertising", "website_partnership"),
    ("/media", "website_partnership"),
    ("/media-kit", "website_partnership"),
    ("/press", "website_partnership"),
    ("/pr", "website_partnership"),
    # Вакансии — часто «Ищем маркетолога» с прямым email руководителя
    ("/career", "website_career"),
    ("/careers", "website_career"),
    ("/vacancies", "website_career"),
    ("/vakansii", "website_career"),
    ("/jobs", "website_career"),
    # Контакты — в самом конце, там обычно ресепшн, а не ЛПР
    ("/contacts", "website_contacts"),
    ("/kontakty", "website_contacts"),
    ("/contact", "website_contacts"),
)
# Увеличили с 6 до 9: партнёрские/маркетинговые страницы редко в top-6, но
# ценность высокая — прямые контакты отдела маркетинга. LLM всё равно вернёт
# пусто, если на странице ФИО нет — токены расходуются только на страницах
# с релевантным текстом (>100 символов после _clean_text).
_MAX_PAGES = 9

_DM_ROLE_KEYWORDS = (
    "руководител", "директор", "владел", "основател", "учредител",
    "управляющ", "генеральный", "главврач", "главный врач", "шеф-повар",
    "маркетолог", "ceo", "cmo", "cto", "coo",
)

# Ключевые слова для маркетинг-роли (для определения role_category='marketing'
# и is_marketing_dm=True). Также включает SMM/PR/бренд/рекламу.
_MARKETING_KEYWORDS = (
    "маркетолог", "маркетинг", "cmo", "директор по маркетинг",
    "руководитель отдела маркетинг", "начальник отдела маркетинг",
    "smm", "pr-", "pr ", "pr,", "пиар", "бренд-менедж", "бренд менедж",
    "реклам",
)


def _is_decision_maker_role(post: str | None) -> bool:
    if not post:
        return False
    low = post.lower()
    return any(k in low for k in _DM_ROLE_KEYWORDS)


def _infer_role_category(post: str | None) -> str | None:
    """Грубая классификация должности в role_category. Возвращает один из
    marketing/owner/founder/management/hr/other или None если пусто.
    Нужен как фолбэк если LLM не выставил категорию или выставил невалидную.
    """
    if not post:
        return None
    low = post.lower()
    if any(k in low for k in _MARKETING_KEYWORDS):
        return "marketing"
    if "учредител" in low or "основател" in low or "соучредител" in low:
        return "founder"
    if "владел" in low or "собственник" in low:
        return "owner"
    if any(k in low for k in (
        "директор", "руководител", "управляющ", "генеральный",
        "ceo", "cto", "coo", "главврач", "главный врач",
    )):
        return "management"
    if low.startswith("hr") or "рекрут" in low or "кадровик" in low:
        return "hr"
    return "other"


def _clean_text(html: str) -> str:
    """HTML → plain text. Убираем скрипты/стили, схлопываем пробелы."""
    if not html:
        return ""
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style", "noscript", "svg", "iframe"]):
        tag.decompose()
    text = soup.get_text(separator=" ", strip=True)
    return re.sub(r"\s+", " ", text).strip()


async def _fetch_html(client: httpx.AsyncClient, url: str) -> str | None:
    try:
        r = await client.get(url)
        if r.status_code >= 400:
            return None
        return r.text
    except Exception:
        return None


async def enrich_company_team(db: AsyncSession, company_id: int) -> dict:
    """Главная функция: фетчит страницы команды/контактов сайта компании,
    извлекает ФИО+должности через LLM, сохраняет в company_decision_makers."""
    company = await db.get(Company, company_id)
    if company is None:
        return {"status": "not_found_company"}

    website = (company.website or "").strip()
    if not website:
        return {"status": "no_website"}
    # Псевдо-сайты соцсетей — там нет /team /о-нас в традиционном виде.
    low = website.lower()
    if any(h in low for h in ("vk.com", "instagram.com", "facebook.com",
                              "ok.ru", "t.me", "2gis.ru", "yandex.")):
        return {"status": "skip_social_website"}

    if not website.startswith(("http://", "https://")):
        website = "https://" + website

    # Skip если у компании уже есть записи (повторно не дёргаем — LLM-токены
    # дорогие). Явный re-run делается отдельным force-флагом, который пока
    # не выставляем UI.
    existing_cnt = (await db.execute(
        select(CompanyDecisionMaker.id).where(
            CompanyDecisionMaker.company_id == company_id
        ).limit(1)
    )).scalar_one_or_none()
    if existing_cnt is not None:
        return {"status": "skip_already_processed"}

    headers = {
        "User-Agent": _UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.8",
    }

    parsed = urlparse(website)
    base = f"{parsed.scheme}://{parsed.netloc}"
    saved = 0
    pages_tried = 0

    async with httpx.AsyncClient(
        timeout=_TIMEOUT, follow_redirects=True, headers=headers, max_redirects=4
    ) as client:
        for path, source_tag in _TEAM_PATHS:
            if pages_tried >= _MAX_PAGES:
                break
            url = urljoin(base, path)
            await asyncio.sleep(0.3)
            html = await _fetch_html(client, url)
            if not html:
                continue
            text = _clean_text(html)
            if len(text) < 100:
                continue
            pages_tried += 1
            extracted = await call_llm_extract_team(
                db, company_name=company.name or "", page_text=text
            )
            if not extracted:
                continue
            for item in extracted:
                name = item.get("name")
                if not name:
                    continue
                post = item.get("post")
                # Если LLM сказала is_dm=true — доверяем. Если нет — пере-проверяем
                # по нашему whitelist (LLM мог быть консервативен).
                is_dm = bool(item.get("is_dm")) or _is_decision_maker_role(post)
                # Confidence: высокий если на /team или /rukovodstvo и есть роль,
                # средний — если без должности (имя одно).
                confidence = 0.7 if post else 0.4
                if source_tag == "website_contacts" and not is_dm:
                    # На страницах контактов часто перечислены менеджеры/админы —
                    # их не помечаем как ЛПР, но всё равно сохраняем.
                    confidence = min(confidence, 0.4)

                # role_category: доверяем LLM, если валидное значение;
                # иначе выводим по ключевым словам должности.
                role_category = item.get("role_category") or _infer_role_category(post)

                # Личный контакт: приоритет email > vk > phone (для UI это
                # означает: кликабельная почта → чат → звонок). Сохраняем
                # только один — самый подходящий.
                # Валидация: email — формат + blacklist без MX (MX тянуть на
                # каждую компанию в hot-path парсера дорого; оркестратор
                # enrich_marketing_dm перед outreach сделает MX-check).
                # Phone — нормализация к +7XXXXXXXXXX + отсечь placeholder'ы.
                contact_email = item.get("contact_email")
                contact_phone = item.get("contact_phone")
                contact_vk = item.get("contact_vk")

                valid_email, _e_reason, norm_email = is_valid_email(
                    contact_email, check_mx=False
                )
                valid_phone, _p_reason, norm_phone = is_valid_phone_ru(contact_phone)

                if valid_email:
                    contact_type, contact_value = "email", norm_email
                elif contact_vk:
                    contact_type, contact_value = "vk", contact_vk
                elif valid_phone:
                    contact_type, contact_value = "phone", norm_phone
                else:
                    contact_type, contact_value = None, None

                # on_conflict_do_nothing применяется к нашему функциональному
                # UNIQUE index по (company_id, lower(name)) автоматически.
                # is_marketing_dm НЕ выставляем здесь — это делает оркестратор
                # enrich_marketing_dm после сбора всех источников.
                stmt = pg_insert(CompanyDecisionMaker).values(
                    company_id=company_id,
                    name=name,
                    post=post,
                    source=source_tag,
                    source_url=url[:1000],
                    confidence=confidence,
                    is_decision_maker=is_dm,
                    role_category=role_category,
                    contact_type=contact_type,
                    contact_value=contact_value,
                ).on_conflict_do_nothing()
                try:
                    await db.execute(stmt)
                    saved += 1
                except Exception as e:
                    # При гонке вставок конфликт по UNIQUE index — норма.
                    logger.debug(
                        "enrich_company_team: insert conflict for %s: %s",
                        name, e,
                    )

    await db.commit()
    return {"status": "ok", "pages_tried": pages_tried, "saved": saved}
