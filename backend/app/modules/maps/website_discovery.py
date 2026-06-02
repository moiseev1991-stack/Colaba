"""Угадывание website компании по её handle-контактам (блок roadmap 2026-06-02).

Контекст: 2GIS Catalog API на нашем бесплатном плане НЕ отдаёт website в
contact_groups. В итоге множество компаний с реальным сайтом (M23 Клиник
→ m23clinic.ru) показывались в выдаче как «нет сайта». Это критичный
баг: web-студия, которая хочет продать сайт, видит ложного лида,
звонит и получает «у нас уже есть сайт».

Стратегия (по убыванию сильности сигнала):

1. **Telegram handle**: `@m23clinic` → пробуем `https://m23clinic.ru`,
   `https://m23clinic.com`, `https://www.m23clinic.ru`.
2. **VK handle**: `vk.com/m23clinic` → так же, `m23clinic.ru/.com`.
3. **Instagram handle**: `instagram.com/m23clinic` → так же.
4. **Email-домен** (не из public-почт): `info@m23clinic.ru` → проверяем
   `https://m23clinic.ru`. Самый сильный сигнал — почта на собственном
   домене.

«Живой» считается URL, на который HEAD/GET вернул 200/301/302 за 8 сек.

Используется в Celery таске `discover_company_website` (queue=maps).
Триггерится автотриггером после `enrich_company_from_2gis_html` (когда
phone/email/мессенджеры уже подтянуты).
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass

import httpx

from app.models.maps import Company


logger = logging.getLogger(__name__)


# Публичные почтовые домены — не используем как кандидата (gmail.com сайтом
# компании быть не может).
_PUBLIC_MAIL_DOMAINS = {
    "gmail.com", "googlemail.com",
    "mail.ru", "list.ru", "inbox.ru", "bk.ru", "internet.ru",
    "yandex.ru", "ya.ru", "yandex.com", "yandex.by",
    "rambler.ru", "lenta.ru", "icloud.com",
    "outlook.com", "hotmail.com", "live.com",
    "proton.me", "protonmail.com",
    "yahoo.com",
    # 2GIS-плейсхолдер (уже фильтруется _accept_email, но на всякий)
    "2gis.ru", "2gis.com",
}


# Валидный handle: ascii буквы/цифры/_/-, минимум 3 символа,
# не начинается с цифры/дефиса.
_HANDLE_RE = re.compile(r"^[a-z][a-z0-9_-]{2,30}$")


@dataclass
class WebsiteCandidate:
    """Один кандидат + его источник, для аудита откуда угадали."""

    url: str
    source: str  # 'telegram' | 'vk' | 'instagram' | 'email_domain' | 'okru'


def _from_handle(handle: str, source: str) -> list[WebsiteCandidate]:
    """Из telegram/vk/etc handle строит до 4 URL-кандидатов."""
    if not handle:
        return []
    slug = handle.strip().lstrip("@").rstrip("/").lower()
    # Если в handle полный URL — выкусим домен
    if "/" in slug:
        slug = slug.rsplit("/", 1)[-1]
    if not _HANDLE_RE.match(slug):
        return []
    # Для русскоязычного бизнеса .ru приоритетнее, потом .com.
    return [
        WebsiteCandidate(url=f"https://{slug}.ru", source=source),
        WebsiteCandidate(url=f"https://{slug}.com", source=source),
    ]


def _from_email(email: str) -> WebsiteCandidate | None:
    """Email на собственном домене → этот домен и есть сайт."""
    if "@" not in email:
        return None
    domain = email.rsplit("@", 1)[1].strip().lower()
    if not domain or domain in _PUBLIC_MAIL_DOMAINS:
        return None
    if "." not in domain or domain.count(".") > 3:
        return None
    # Очень слабая защита от мусора
    if not re.match(r"^[a-z0-9.-]+\.[a-z]{2,10}$", domain):
        return None
    return WebsiteCandidate(url=f"https://{domain}", source="email_domain")


def build_candidates(company: Company) -> list[WebsiteCandidate]:
    """Собирает упорядоченный список кандидатов из всех контактов."""
    candidates: list[WebsiteCandidate] = []
    seen: set[str] = set()

    def add(c: WebsiteCandidate | None) -> None:
        if c is None:
            return
        if c.url.lower() in seen:
            return
        seen.add(c.url.lower())
        candidates.append(c)

    extra = company.contacts_extra if isinstance(company.contacts_extra, dict) else {}

    # 1. Email на собственном домене — самый сильный сигнал.
    emails = company.emails if isinstance(company.emails, list) else []
    for e in emails[:5]:
        if isinstance(e, str):
            add(_from_email(e))

    # 2. Telegram-handle (часто == домен бренда).
    if isinstance(extra, dict):
        for tg in (extra.get("telegrams") or [])[:5]:
            if isinstance(tg, str):
                for c in _from_handle(tg, "telegram"):
                    add(c)
        for vk in (extra.get("vks") or [])[:3]:
            if isinstance(vk, str):
                for c in _from_handle(vk, "vk"):
                    add(c)
        for ig in (extra.get("instagrams") or [])[:3]:
            if isinstance(ig, str):
                for c in _from_handle(ig, "instagram"):
                    add(c)
        for ok in (extra.get("oks") or [])[:3]:
            if isinstance(ok, str):
                for c in _from_handle(ok, "okru"):
                    add(c)

    return candidates


async def _is_alive(client: httpx.AsyncClient, url: str) -> bool:
    """HEAD-проверка. Если HEAD не отвечает 200/3xx — пробуем GET с
    ограничением размера (не качаем весь HTML)."""
    try:
        r = await client.head(url, follow_redirects=True, timeout=8.0)
        if 200 <= r.status_code < 400:
            return True
        # Некоторые серверы отвечают 405 на HEAD — фолбэк на GET.
        if r.status_code == 405:
            r = await client.get(url, follow_redirects=True, timeout=8.0)
            return 200 <= r.status_code < 400
        return False
    except Exception as e:
        logger.debug("_is_alive %s: %s", url, e)
        return False


async def discover_website(company: Company) -> WebsiteCandidate | None:
    """Главная функция: возвращает первый живой кандидат или None.

    None НЕ означает «у компании точно нет сайта» — означает «мы не
    смогли угадать по handle». website_lead_score такая компания
    сохранит, попадёт в выдачу как «нет сайта».
    """
    candidates = build_candidates(company)
    if not candidates:
        return None

    async with httpx.AsyncClient(
        headers={"User-Agent": "Mozilla/5.0 (compatible; ColabaBot/1.0)"},
        timeout=8.0,
    ) as client:
        for cand in candidates[:8]:  # лимит — не дёргаем больше 8 URL/компанию
            if await _is_alive(client, cand.url):
                logger.info(
                    "discover_website: company=%s found=%s source=%s",
                    company.id, cand.url, cand.source,
                )
                return cand
    return None
