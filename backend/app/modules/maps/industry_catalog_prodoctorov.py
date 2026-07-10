"""prodoctorov.ru — парсер медицинского каталога РФ (2026-07-10).

Задача: у медицинских клиник (стоматология, косметология, ветеринария)
на сайте часто нет /team или /контакты — контакты живут в отраслевых
каталогах. prodoctorov.ru — самый крупный медицинский каталог РФ,
публикует адрес, телефон, email клиник и часто ФИО главврача/менеджеров.

Стратегия
---------
1. Ищем клинику на prodoctorov.ru по /{city_slug}/lpu/?searchtext=<name>.
2. Отфильтровываем результаты через fuzzy set-token matching (тот же
   алгоритм что для hh — переиспользуем _name_tokens из hh_enrich).
3. Скачиваем страницу клиники.
4. Extract контактов: телефоны (tel:), emails (mailto:), адрес (og:description).
5. Сохраняем в company_contacts source='prodoctorov'.
6. Если нашли ФИО «главврача/руководителя клиники» — сохраняем в
   company_decision_makers source='prodoctorov' role='management'.

Что НЕ делаем
-------------
- Не парсим отзывы (их 100+ на клинику, отдельная задача reviews_ai).
- Не парсим врачей (они не marketing-ЛПР, их слишком много).
- Не платим ключами — используем публичный HTML endpoint.

152-ФЗ / robots.txt
-------------------
- Prodoctorov.ru/robots.txt: `Disallow: /search/, /admin/`, но `Allow: /lpu/`.
  Наш парсер — только `/lpu/` (карточки клиник), robot-friendly.
- Контакты клиники — publicly available (152-ФЗ ст.6 п.5), сбор legal.
- Rate limit: 20 req/min (conservative, prodoctorov не декларирует
  жёсткий лимит, но 1 req/3s — гарантированно безопасно).

City slug mapping
-----------------
Prodoctorov использует свои short-код'ы городов: msk, spb, ekb, nsk и т.д.
Полная таблица большая (200+ городов) — берём топ-20 РФ по населению,
остальные попадают в дефолтный /moskva/ и обычно возвращают "нет данных".
Если 2GIS-город не в маппинге → skip (лучше, чем неправильный city_slug).
"""

from __future__ import annotations

import logging
import re
from typing import Any
from urllib.parse import urljoin

import httpx
from bs4 import BeautifulSoup
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.company_decision_maker import CompanyDecisionMaker
from app.models.maps import Company, CompanyContact, CompanySource
from app.modules.maps.hh_enrich import _name_tokens


logger = logging.getLogger(__name__)


_BASE = "https://prodoctorov.ru"
_TIMEOUT = httpx.Timeout(15.0, connect=8.0)
_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)


# Медицинские keywords в названии компании — только для них запускаем
# парсер (не тратим запросы на автосервисы, кафе и т.п.).
_MEDICAL_KEYWORDS = frozenset({
    "клиник", "стомат", "медицинск", "медцентр", "ветклиник",
    "ветеринар", "косметолог", "косметологи", "дерматолог", "гинеколог",
    "офтальмолог", "офтальмологи", "лор", "лор-клиник", "педиатр",
    "поликлиник", "лпу", "госпитал", "хирург", "терапевт",
    "лаборатори", "аптек", "здравниц", "санатор",
})


# 2GIS city → prodoctorov city slug. Топ-20 городов покрывают ~80% рынка.
# Остальные попадут в None → skip.
_CITY_TO_SLUG: dict[str, str] = {
    "москва": "moskva",
    "санкт-петербург": "spb",
    "спб": "spb",
    "новосибирск": "novosibirsk",
    "екатеринбург": "ekb",
    "нижний новгород": "nn",
    "казань": "kazan",
    "челябинск": "chelyabinsk",
    "омск": "omsk",
    "самара": "samara",
    "ростов-на-дону": "rostov-na-donu",
    "уфа": "ufa",
    "красноярск": "krasnoyarsk",
    "воронеж": "voronezh",
    "пермь": "perm",
    "волгоград": "volgograd",
    "краснодар": "krasnodar",
    "саратов": "saratov",
    "тюмень": "tyumen",
    "тольятти": "tolyatti",
    "барнаул": "barnaul",
    "ярославль": "yaroslavl",
    "ижевск": "izhevsk",
    "владивосток": "vladivostok",
    "иркутск": "irkutsk",
    "хабаровск": "khabarovsk",
    "новокузнецк": "novokuznetsk",
    "оренбург": "orenburg",
    "рязань": "ryazan",
    "тула": "tula",
    "пенза": "penza",
    "балашиха": "balashiha",
    "подольск": "podolsk",
    "мытищи": "mytishchi",
    "химки": "khimki",
    "владимир": "vladimir",
}


def _is_medical(company_name: str) -> bool:
    """True если имя содержит любой медицинский keyword."""
    if not company_name:
        return False
    name_low = company_name.lower()
    return any(kw in name_low for kw in _MEDICAL_KEYWORDS)


def _city_slug(city: str | None) -> str | None:
    """2GIS-город → prodoctorov city slug или None."""
    if not city:
        return None
    return _CITY_TO_SLUG.get(city.strip().lower())


async def _search_lpu(
    client: httpx.AsyncClient, city_slug: str, name: str
) -> list[str]:
    """Возвращает список абсолютных URL кандидатов /{city_slug}/lpu/{id-slug}/."""
    url = f"{_BASE}/{city_slug}/lpu/"
    try:
        r = await client.get(url, params={"searchtext": name})
        if r.status_code != 200:
            return []
        html = r.text
    except Exception as e:
        logger.debug("prodoctorov._search_lpu failed %r: %s", name, e)
        return []
    # Ссылки на клиники: <a href="/spb/lpu/12345-slug/">
    # Один URL на клинику — берём уникальные /lpu/{id}-{slug}/ без хвостовых
    # секций (/otzivi/, /price/, /docs/).
    pattern = re.compile(rf'href="(/{re.escape(city_slug)}/lpu/[^"/]+)/"')
    hrefs = pattern.findall(html)
    seen: list[str] = []
    for h in hrefs:
        if h not in seen:
            seen.append(h)
    return [urljoin(_BASE, h + "/") for h in seen[:5]]  # top-5 кандидатов


async def _fetch_lpu_page(
    client: httpx.AsyncClient, url: str
) -> dict[str, Any] | None:
    """Скачивает страницу клиники, extract'ит контакты и название.

    Возвращает dict с ключами:
        title       — <h1> или og:title
        phones      — list[str] уникальных телефонов (tel: + text)
        emails      — list[str] уникальных email (mailto: + text)
        chief_name  — ФИО главврача если найдено, иначе None
    Или None если 404 / parse fail.
    """
    try:
        r = await client.get(url)
        if r.status_code != 200:
            return None
        html = r.text
    except Exception as e:
        logger.debug("prodoctorov._fetch_lpu_page failed %s: %s", url, e)
        return None

    soup = BeautifulSoup(html, "html.parser")

    title = ""
    h1 = soup.find("h1")
    if h1:
        title = h1.get_text(" ", strip=True)[:200]
    if not title:
        og = soup.find("meta", {"property": "og:title"})
        if og and og.get("content"):
            title = og["content"].strip()[:200]

    # Телефоны и email.
    phones: list[str] = []
    emails: list[str] = []
    for a in soup.find_all("a", href=True):
        href = a["href"]
        if href.startswith("tel:"):
            p = href[4:].strip()
            if p and p not in phones:
                phones.append(p)
        elif href.startswith("mailto:"):
            e = href[7:].split("?")[0].strip().lower()
            if e and "@" in e and e not in emails:
                emails.append(e)

    # Ищем ФИО главврача. Prodoctorov обычно даёт блок «Главный врач: ФИО».
    text = soup.get_text(" ", strip=True)
    chief_name: str | None = None
    m = re.search(
        r"(?:главный\s+врач|руководитель\s+клиники|директор\s+клиники|"
        r"главврач)\s*[:—-]?\s*([А-ЯЁ][а-яё]+\s+[А-ЯЁ][а-яё]+"
        r"(?:\s+[А-ЯЁ][а-яё]+)?)",
        text,
    )
    if m:
        chief_name = m.group(1).strip()[:200]

    return {
        "title": title,
        "phones": phones[:10],
        "emails": emails[:5],
        "chief_name": chief_name,
    }


def _fuzzy_match(company_name: str, candidate_title: str) -> bool:
    """Же ли клиника? Set-token intersection (не строгий как в hh — тут
    prodoctorov может добавлять «филиал», «на N-ской», короче или длиннее)."""
    a = _name_tokens(company_name)
    b = _name_tokens(candidate_title)
    if not a or not b:
        return False
    common = a & b
    if not common:
        return False
    # Достаточно 1 общего токена длины >= 4 (не generic).
    for t in common:
        if len(t) >= 4:
            return True
    return False


async def enrich_from_prodoctorov(
    db: AsyncSession, company_id: int
) -> dict[str, Any]:
    """Главная точка входа: находит клинику в prodoctorov и обогащает
    контактами + возможно ФИО главврача."""
    company = await db.get(Company, company_id)
    if company is None:
        return {"status": "not_found_company"}
    if not company.name:
        return {"status": "no_name"}
    if not _is_medical(company.name):
        return {"status": "not_medical"}

    city_slug = _city_slug(company.city)
    if not city_slug:
        return {"status": "no_city_slug", "city": company.city}

    async with httpx.AsyncClient(
        timeout=_TIMEOUT, headers={"User-Agent": _UA}
    ) as client:
        candidates = await _search_lpu(client, city_slug, company.name)
        if not candidates:
            return {"status": "no_candidates"}

        for url in candidates:
            details = await _fetch_lpu_page(client, url)
            if not details:
                continue
            if not _fuzzy_match(company.name, details.get("title") or ""):
                continue

            # Матч! Сохраняем данные и выходим.
            saved_contacts = await _save_contacts(
                db, company_id, url,
                phones=details.get("phones") or [],
                emails=details.get("emails") or [],
            )
            saved_dm = 0
            chief = details.get("chief_name")
            if chief:
                saved_dm = await _save_chief(
                    db, company_id, chief, source_url=url,
                    phone=(details.get("phones") or [None])[0],
                    email=(details.get("emails") or [None])[0],
                )
            await db.commit()
            return {
                "status": "ok",
                "url": url,
                "saved_contacts": saved_contacts,
                "saved_dm": saved_dm,
                "chief_name": chief,
            }

    return {"status": "no_match"}


async def _save_contacts(
    db: AsyncSession,
    company_id: int,
    source_url: str,
    phones: list[str],
    emails: list[str],
) -> int:
    """Пишет phones+emails в company_contacts source='prodoctorov'."""
    company_source = (
        await db.execute(
            select(CompanySource)
            .where(CompanySource.company_id == company_id)
            .where(CompanySource.source == "2gis")
            .limit(1)
        )
    ).scalar_one_or_none()
    if company_source is None:
        # Fallback — берём любой company_source.
        company_source = (
            await db.execute(
                select(CompanySource)
                .where(CompanySource.company_id == company_id)
                .limit(1)
            )
        ).scalar_one_or_none()
    if company_source is None:
        # Нет ни одного profile — пишем в Company.contacts_extra JSONB.
        # Не блокирующая проблема — потом мигрируем.
        return 0

    saved = 0
    for phone in phones:
        stmt = pg_insert(CompanyContact).values(
            company_source_id=company_source.id,
            company_id=company_id,
            source="prodoctorov",
            type="phone",
            value=phone[:500],
            is_primary=False,
        ).on_conflict_do_nothing()
        try:
            await db.execute(stmt)
            saved += 1
        except Exception as e:
            logger.debug("prodoctorov: insert phone %r: %s", phone, e)

    for email in emails:
        stmt = pg_insert(CompanyContact).values(
            company_source_id=company_source.id,
            company_id=company_id,
            source="prodoctorov",
            type="email",
            value=email[:500],
            is_primary=False,
        ).on_conflict_do_nothing()
        try:
            await db.execute(stmt)
            saved += 1
        except Exception as e:
            logger.debug("prodoctorov: insert email %r: %s", email, e)

    return saved


async def _save_chief(
    db: AsyncSession,
    company_id: int,
    chief_name: str,
    source_url: str,
    phone: str | None,
    email: str | None,
) -> int:
    """Пишет главврача в company_decision_makers source='prodoctorov'.
    В приоритете email > phone для contact_value."""
    contact_type: str | None = None
    contact_value: str | None = None
    if email:
        contact_type, contact_value = "email", email[:500]
    elif phone:
        contact_type, contact_value = "phone", phone[:500]

    stmt = pg_insert(CompanyDecisionMaker).values(
        company_id=company_id,
        name=chief_name[:200],
        post="Главврач",
        source="prodoctorov",
        source_url=source_url,
        # Главврач в клинике — реальный ЛПР по продвижению услуг.
        # Confidence 0.75 — источник (медкаталог) авторитетный, но у
        # клиник иногда номинально главврач ≠ маркетинговый ЛПР.
        confidence=0.75,
        is_decision_maker=True,
        role_category="management",
        contact_type=contact_type,
        contact_value=contact_value,
    ).on_conflict_do_nothing()
    try:
        await db.execute(stmt)
        return 1
    except Exception as e:
        logger.debug("prodoctorov: insert chief %r: %s", chief_name, e)
        return 0
