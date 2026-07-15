"""Playwright email/phone-парсер сайта компании (pending 2026-06-25).

Задача: у части компаний email/телефон отрендерены JS (SPA-сайты, React-
формы контактов, «показать email» кнопки). Наш httpx-краулер видит только
статичный HTML и упускает эти данные. Playwright исполняет JS и достаёт
mailto:/tel: из финального DOM.

Дополняет Marketing-DM Finder: у ЛПР найденных через ЕГРЮЛ/hh часто
contact_value=None. Если у компании есть email на сайте (после JS-рендера),
подкладываем его как fallback-канал (пишет фронт «общая почта», а не
конкретное лицо).

Что делаем
----------
1. Идём по кандидатным путям: `/`, `/contacts`, `/kontakty`, `/о-нас`.
2. На каждой странице:
   - Ждём domcontentloaded → networkidle (макс 8с);
   - Кликаем видимые кнопки «показать email»/«показать телефон» (частые
     на bitrix/тильда-шаблонах);
   - Извлекаем из финального DOM: mailto:, tel:, plain-текст email/phone.
3. Дедупим, отсеиваем no-reply@ / info@ (по флагу prefer_personal).
4. Пишем в Company.emails (merge с существующим) + contacts_extra.playwright_at
   для идемпотентности.

Отделено от `team_enrich.py` (LLM-путь) — это дешёвый deterministic-парсер.
Запускается ПОСЛЕ team_enrich как fallback только если у компании 0 emails.

Ограничения
-----------
- Playwright тяжёлый: ~2-3 сек на компанию + ~200MB RAM на chromium. Rate-limit
  таска 20/m — прод-worker с 2GB RAM выдержит один parallel-инстанс.
- Псевдо-сайты (vk.com, 2gis.ru, yandex.ru) пропускаем — там email не найти.
- Прокси НЕ используем (сайт компании — не anti-bot таргет, httpx-парсер
  тоже без прокси работает).
"""

from __future__ import annotations

import asyncio
import logging
import re
from typing import Any
from urllib.parse import urljoin, urlparse

from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.maps import Company
from app.modules.maps.contact_validation import is_valid_email


logger = logging.getLogger(__name__)


_PAGE_TIMEOUT_MS = 15_000
_NETWORK_IDLE_TIMEOUT_MS = 8_000
_POST_RENDER_WAIT_MS = 800

_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36"
)

# Кандидатные страницы. Первый — корень (там часто futer с mailto),
# дальше явные контактные.
_PATHS: tuple[str, ...] = (
    "/",
    "/contacts",
    "/kontakty",
    "/kontakti",
    "/contact",
    "/o-nas",
    "/about",
)

_SKIP_HOSTS = (
    "vk.com", "instagram.com", "facebook.com",
    "ok.ru", "t.me", "2gis.ru", "yandex.",
)

# Кнопки «показать email/телефон» — селекторы, характерные для CMS
# Битрикс/тильда/wordpress. Кликаем ВСЕ найденные, ошибки игнорируем.
_REVEAL_SELECTORS = (
    'button:has-text("показать e-mail")',
    'button:has-text("показать email")',
    'button:has-text("показать телефон")',
    'a:has-text("показать e-mail")',
    'a:has-text("показать email")',
    '[data-role="showphone"]',
    '.showphone',
    '.show-phone',
    '.show-email',
    '.b-showphone',
)

# Email должен выглядеть валидно; отбрасываем изображения (svg/png в imghover),
# escape-sequences и явно опечатки типа «example@example.com».
_RE_EMAIL_PLAIN = re.compile(
    r'\b([A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,})\b'
)
_RE_MAILTO = re.compile(r'mailto:([^"\'<>\s?]+)', re.IGNORECASE)
_RE_TEL = re.compile(r'tel:([+\d\s\-\(\)]+)', re.IGNORECASE)

def _looks_like_real_email(email: str) -> bool:
    """Фильтр: не placeholder, не системная почта CMS, не sentry-id.

    Делегирует общему contact_validation.is_valid_email (без MX-check —
    playwright hot-path, много кандидатов; MX проверит оркестратор перед
    использованием email в outreach).
    """
    ok, _reason, _norm = is_valid_email(email, check_mx=False)
    return ok


def _normalize_phone_ru(raw: str) -> str | None:
    """+7/8/пробелы → +7XXXXXXXXXX. None если 10 цифр не собралось."""
    digits = re.sub(r"\D", "", raw or "")
    if len(digits) == 11 and digits.startswith("8"):
        digits = "7" + digits[1:]
    if len(digits) == 11 and digits.startswith("7"):
        return "+" + digits
    if len(digits) == 10:
        return "+7" + digits
    return None


async def _extract_from_page(page) -> tuple[set[str], set[str]]:
    """Возвращает (emails, phones) со страницы после JS-рендера +
    попытки кликнуть reveal-кнопки. Оба множества lowercased."""
    # 1. Клики по reveal-кнопкам (tolerant — селектора может не быть).
    for sel in _REVEAL_SELECTORS:
        try:
            handles = await page.locator(sel).all()
            for h in handles[:3]:  # не увлекаемся, часто их 1-2
                try:
                    await h.click(timeout=1000)
                except Exception:
                    pass
        except Exception:
            pass

    # 2. Дадим JS-фреймворкам применить состояние.
    await page.wait_for_timeout(_POST_RENDER_WAIT_MS)

    # 3. Достаём финальный HTML + видимый текст.
    html = await page.content()
    text = await page.inner_text("body") if await page.locator("body").count() else ""

    emails: set[str] = set()
    for m in _RE_MAILTO.findall(html):
        cleaned = (m or "").split("?", 1)[0].strip().lower()
        if _looks_like_real_email(cleaned):
            emails.add(cleaned)
    for m in _RE_EMAIL_PLAIN.findall(html + " " + text):
        cleaned = (m or "").strip().lower()
        if _looks_like_real_email(cleaned):
            emails.add(cleaned)

    phones: set[str] = set()
    for m in _RE_TEL.findall(html):
        norm = _normalize_phone_ru(m)
        if norm:
            phones.add(norm)
    # Из видимого текста — только российский формат чтобы не хватать мусор.
    phone_pattern = re.compile(
        r'(?:\+7|8)[\s\-\(\)]*\d{3}[\s\-\(\)]*\d{3}[\s\-\(\)]*\d{2}[\s\-\(\)]*\d{2}'
    )
    for m in phone_pattern.findall(text):
        norm = _normalize_phone_ru(m)
        if norm:
            phones.add(norm)

    return emails, phones


async def enrich_from_website_playwright(
    db: AsyncSession, company_id: int
) -> dict[str, Any]:
    """Открывает сайт компании в headless-chromium, обходит /contacts /о-нас,
    кликает «показать email»-кнопки, извлекает email/phone из финального DOM.
    Сохраняет в Company.emails (merge) + отметку contacts_extra.playwright_at.
    """
    company = await db.get(Company, company_id)
    if company is None:
        return {"status": "not_found_company"}

    website = (company.website or "").strip()
    if not website:
        return {"status": "no_website"}
    low = website.lower()
    if any(h in low for h in _SKIP_HOSTS):
        return {"status": "skip_social_website"}
    if not website.startswith(("http://", "https://")):
        website = "https://" + website

    # Идемпотентность: не бегаем повторно если уже пробовали <30 дней назад.
    extra = company.contacts_extra or {}
    if "playwright_website_at" in extra and (company.emails or []):
        return {"status": "skip_already_processed"}

    try:
        from playwright.async_api import async_playwright, TimeoutError as PWTimeout
    except ImportError:
        return {"status": "playwright_not_installed"}

    parsed = urlparse(website)
    base = f"{parsed.scheme}://{parsed.netloc}"

    all_emails: set[str] = set()
    all_phones: set[str] = set()
    pages_tried = 0
    pages_ok = 0

    try:
        async with async_playwright() as pw:
            browser = await pw.chromium.launch(
                headless=True,
                args=[
                    "--disable-blink-features=AutomationControlled",
                    "--no-sandbox",
                    "--disable-dev-shm-usage",
                ],
            )
            try:
                ctx = await browser.new_context(
                    user_agent=_UA,
                    locale="ru-RU",
                    viewport={"width": 1366, "height": 900},
                    extra_http_headers={"Accept-Language": "ru-RU,ru;q=0.9"},
                )
                page = await ctx.new_page()
                for path in _PATHS:
                    if pages_tried >= 4:
                        break
                    url = urljoin(base, path)
                    pages_tried += 1
                    try:
                        await page.goto(
                            url, wait_until="domcontentloaded",
                            timeout=_PAGE_TIMEOUT_MS,
                        )
                    except PWTimeout:
                        continue
                    except Exception as e:
                        logger.debug("website_playwright goto %s failed: %s", url, e)
                        continue
                    # Ждём networkidle с ограничением — иначе таск подвиснет
                    # на аналитиках/чат-виджетах.
                    try:
                        await page.wait_for_load_state(
                            "networkidle", timeout=_NETWORK_IDLE_TIMEOUT_MS,
                        )
                    except PWTimeout:
                        pass
                    emails, phones = await _extract_from_page(page)
                    all_emails.update(emails)
                    all_phones.update(phones)
                    pages_ok += 1
                    # Если корень уже дал email — /contacts часто дубль, скипаем.
                    if pages_ok == 1 and all_emails:
                        break
                    await asyncio.sleep(0.2)
            finally:
                await browser.close()
    except Exception as e:
        logger.warning("website_playwright failed for #%d: %s", company_id, e)
        return {"status": "error", "error": str(e)[:200]}

    # Merge: не затираем существующие emails, добавляем новые.
    existing_emails = set((company.emails or []) if isinstance(company.emails, list) else [])
    merged_emails = sorted(existing_emails | all_emails)

    # contacts_extra.playwright_website_at — отметка для идемпотентности.
    from datetime import datetime, timezone
    new_extra = dict(extra) if isinstance(extra, dict) else {}
    new_extra["playwright_website_at"] = datetime.now(timezone.utc).isoformat()
    if all_phones:
        # Кладём phones в contacts_extra.phones_playwright (не в company.phone,
        # чтобы не затирать источник карт). UI/экспорт могут показать этот
        # список отдельно.
        new_extra["phones_playwright"] = sorted(all_phones)

    await db.execute(
        update(Company)
        .where(Company.id == company_id)
        .values(emails=merged_emails, contacts_extra=new_extra)
    )
    await db.commit()

    return {
        "status": "ok",
        "pages_tried": pages_tried,
        "pages_ok": pages_ok,
        "emails_new": sorted(all_emails - existing_emails),
        "emails_total": merged_emails,
        "phones_found": sorted(all_phones),
    }
