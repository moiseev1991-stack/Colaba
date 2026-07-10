"""hh.ru enrich — активные вакансии компании (ТЗ «Маркетинг-ЛПР Finder»
2026-06-20 §1.3).

Двойная польза:
  1. Сигнал боли — «ищет маркетолога» = маркетинга нет или слаб → горячий лид
     для маркетингового подрядчика. Пишем в Company.hiring_marketing +
     hiring_url.
  2. Контакт вакансии — hh часто возвращает контактное лицо (обычно HR или
     руководитель отдела). Сохраняем в company_decision_makers с source='hh'.

Что hh отдаёт БЕЗ ключа
-----------------------
Публичный API https://api.hh.ru/vacancies:
- поиск по text= (название вакансии), employer_id= (если знаем id
  работодателя), area= (регион). Отдаёт список вакансий.
- GET /vacancies/{id} — детали, включая contacts.name / contacts.email /
  contacts.phones. Часто contacts=None (работодатель отключил).

Работодателя ищем по названию компании через /employers?text=. Матчинг
слабый (много компаний с одинаковым названием), поэтому фильтруем по:
- совпадение названия (без ООО/ИП/тире, lower);
- совпадение города (если у нас есть Company.city).

Если employer_id не нашли — возвращаемся с status='no_employer'. Не
пытаемся дальше искать по названию: false-positive хуже, чем «не нашли».

Ограничения / этика
-------------------
- hh публикует эти данные сам — забор через официальный API безопасен;
- rate-limit: не более 5 req/сек по документации, у нас 3 запроса на
  компанию → безопасно даже без задержек, но добавляем asyncio.sleep(0.3)
  между запросами для надёжности;
- 152-ФЗ: имя контактного лица — публичные данные (работодатель
  добровольно опубликовал в вакансии), сохраняем. Телефон — тоже публично
  указан, но помечаем confidence=0.5 (контакт — HR, не сам маркетолог).
"""

from __future__ import annotations

import asyncio
import logging
import re
from typing import Any

import httpx
from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.company_decision_maker import CompanyDecisionMaker
from app.models.maps import Company


logger = logging.getLogger(__name__)


_HH_API = "https://api.hh.ru"
_TIMEOUT = httpx.Timeout(10.0, connect=5.0)
_UA = "SpinLid-Colaba/1.0 (contact: moiseev1991@gmail.com)"

# Ключевые слова маркетинговых вакансий. Ищем текстом — hh делает свой
# морфологический поиск, но добавляем варианты чтобы не пропустить SMM/PR.
_MARKETING_QUERY = (
    "маркетолог OR \"директор по маркетингу\" OR CMO OR "
    "\"руководитель отдела маркетинга\" OR SMM OR бренд-менеджер OR PR-менеджер"
)


_LEGAL_FORM_TOKENS = frozenset({
    "ооо", "оао", "зао", "пао", "ао", "ип", "тоо",
    "нко", "ано", "фгуп", "гуп", "муп",
})


def _normalize_company_name(name: str) -> str:
    """Убираем ООО/ИП/АО/кавычки/тире/пунктуацию, схлопываем пробелы, lower.
    Используется для матчинга hh.employers ↔ Company.name.

    Юр-формы вырезаем ТОЛЬКО как отдельные токены — иначе 'ано'
    матчится в 'ив-ано-в' и калечит фамилии. См. baseline-тест
    test_normalize_company_name — на 'ИП Иванов Иван' до этого фикса
    получалось 'ив в иван' вместо 'иванов иван'.
    """
    if not name:
        return ""
    s = name.lower()
    # "+", "&" — часть бренда ("К+31", "S&P"), их НЕ разбиваем, а склеиваем:
    # "К+31" → "к31", чтобы бренд остался одним токеном.
    s = re.sub(r'[+&]', "", s)
    # Остальную пунктуацию (запятые, точки, знаки) — на пробел, чтобы
    # "Астра, клиника" ↔ "клиника Астра" сматчились по set of tokens.
    s = re.sub(r'[«»"\'`\-–—(),.:;/!?]+', " ", s)
    # Токенизация → фильтр стоп-токенов → обратная сборка.
    tokens = [t for t in s.split() if t and t not in _LEGAL_FORM_TOKENS]
    return " ".join(tokens)


def _name_tokens(name: str) -> frozenset[str]:
    """Токены нормализованного имени, для fuzzy set-based matching.
    Односимвольные токены отбрасываем (шум типа 'и', 'а')."""
    normalized = _normalize_company_name(name)
    return frozenset(t for t in normalized.split() if len(t) >= 2)


# Generic-слова, которые в изоляции не подтверждают match: если пересечение
# состоит ТОЛЬКО из них, отклоняем. «Клиника Астра» vs «Клиника Восток»
# пересеклись бы по «клиника» = false-positive.
_HH_GENERIC_TOKENS = frozenset({
    "клиника", "центр", "медицинский", "медицинского", "стоматологическая",
    "магазин", "сеть", "салон", "студия", "агентство", "компания", "группа",
    "торговый", "торговая", "интернет", "онлайн", "офис", "офисы",
    "ресторан", "кафе", "бар", "фитнес", "спа",
    "клиника", "консалтинг", "международный", "мир",
})


# Транслит-запрос для брендов на латинице (Askona, Bello Dente, Secret Vi).
# hh.ru — русскоязычная база: под «Askona» ничего не находит, а под «Аскона» —
# правильный работодатель с городом. Используем упрощённую обратную
# транслитерацию (latin → кириллица) для дополнительного поискового запроса.
_LATIN_TO_CYR = {
    "sh": "ш", "ch": "ч", "zh": "ж", "kh": "х", "yu": "ю", "ya": "я",
    "ts": "ц", "ye": "е", "yo": "ё",
    "a": "а", "b": "б", "c": "с", "d": "д", "e": "е", "f": "ф",
    "g": "г", "h": "х", "i": "и", "j": "дж", "k": "к", "l": "л",
    "m": "м", "n": "н", "o": "о", "p": "п", "q": "к", "r": "р",
    "s": "с", "t": "т", "u": "у", "v": "в", "w": "в", "x": "кс",
    "y": "й", "z": "з",
}


def _latin_to_cyrillic(text: str) -> str:
    """Приблизительная транслитерация англ → рус. Для брендов на латинице:
    «Askona» → «аскона», «Bello Dente» → «белло денте».

    Точность не критична — это дополнительный поисковый запрос к hh,
    а финальный матчинг всё равно через _is_match (set-token)."""
    if not text:
        return ""
    s = text.lower()
    out = []
    i = 0
    while i < len(s):
        # Пробуем 2-char comboj (sh, ch, zh, kh, yu, ya, ts, ye, yo).
        if i + 1 < len(s) and s[i:i + 2] in _LATIN_TO_CYR:
            out.append(_LATIN_TO_CYR[s[i:i + 2]])
            i += 2
            continue
        c = s[i]
        out.append(_LATIN_TO_CYR.get(c, c))
        i += 1
    return "".join(out)


def _looks_like_latin(text: str) -> bool:
    """True если >= 60% ASCII-букв в тексте — тогда пробуем транслит."""
    if not text:
        return False
    letters = [c for c in text if c.isalpha()]
    if not letters:
        return False
    ascii_count = sum(1 for c in letters if c.isascii())
    return ascii_count / len(letters) >= 0.6


async def _hh_search_employers(
    client: httpx.AsyncClient, query: str
) -> list[dict[str, Any]]:
    """Один поисковый запрос к hh.ru/employers. Возвращает items[] или []."""
    try:
        r = await client.get(
            f"{_HH_API}/employers",
            params={"text": query, "per_page": 20},
        )
        if r.status_code != 200:
            return []
        data = r.json()
    except Exception as e:
        logger.debug("hh._hh_search_employers failed for %r: %s", query, e)
        return []
    return data.get("items") or []


async def _search_employer(
    client: httpx.AsyncClient, company_name: str, city: str | None
) -> int | None:
    """Пытается найти employer_id на hh.ru по названию компании.

    Стратегия (2026-07-10):
      1. Прямой запрос по company_name.
      2. Если 0 матчей и название латиницей (Askona, Bello Dente) —
         дополнительный запрос по транслиту в кириллицу (Аскона).
      3. Set-token матч на объединённых результатах.
    """
    q = company_name.strip()
    if not q:
        return None

    items = await _hh_search_employers(client, q)

    # Латиница? Добавляем транслит-запрос.
    if _looks_like_latin(q):
        cyr_q = _latin_to_cyrillic(q).strip()
        if cyr_q and cyr_q != q.lower():
            extra = await _hh_search_employers(client, cyr_q)
            # Дедуп по id.
            seen_ids = {it.get("id") for it in items}
            items = items + [it for it in extra if it.get("id") not in seen_ids]

    if not items:
        return None

    target_tokens = _name_tokens(company_name)
    # Если у нас latin-имя, добавим ещё транслит-варианты токенов для match.
    if _looks_like_latin(company_name):
        cyr_name = _latin_to_cyrillic(company_name)
        target_tokens = target_tokens | _name_tokens(cyr_name)
    city_low = (city or "").strip().lower()

    # Матчинг: set-token intersection. Порог зависит от размера:
    #   len(target) == 1 → нужен exact match (единственный токен присутствует)
    #   len(target) >= 2 → нужно >= 2 общих токена, из которых хотя бы 1 не generic
    # Это защищает от «Клиника Восток» ↔ «Клиника Астра» (общий только 'клиника').
    def _is_match(hh_name: str) -> bool:
        hh_tokens = _name_tokens(hh_name)
        common = target_tokens & hh_tokens
        if not common:
            return False
        specific = common - _HH_GENERIC_TOKENS
        if len(target_tokens) == 1:
            return target_tokens.issubset(hh_tokens)
        # Хотя бы 1 specific токен в пересечении.
        if not specific:
            return False
        # И >= 50% от размера меньшего множества.
        smaller = min(len(target_tokens), len(hh_tokens))
        return len(common) / max(smaller, 1) >= 0.5

    matches = [it for it in items if _is_match(it.get("name") or "")]
    if not matches:
        return None

    # Если у нас известен город — предпочитаем совпадение по городу.
    if city_low:
        for it in matches:
            area = (it.get("area") or {}).get("name") or ""
            if area and area.lower() == city_low:
                try:
                    return int(it["id"])
                except (KeyError, TypeError, ValueError):
                    continue

    # Иначе — берём первый (hh сортирует по релевантности).
    for it in matches:
        try:
            return int(it["id"])
        except (KeyError, TypeError, ValueError):
            continue

    return None


async def _search_marketing_vacancy(
    client: httpx.AsyncClient, employer_id: int
) -> dict[str, Any] | None:
    """Есть ли у employer_id активная маркетинговая вакансия? Возвращаем
    первую подходящую (dict с id/name/alternate_url) или None.
    """
    try:
        r = await client.get(
            f"{_HH_API}/vacancies",
            params={
                "employer_id": employer_id,
                "text": _MARKETING_QUERY,
                "per_page": 5,
                # only_with_salary=False — сохраняем максимум,
                # ниша маркетинга часто без зарплаты в вакансии.
            },
        )
        if r.status_code != 200:
            return None
        data = r.json()
    except Exception as e:
        logger.debug("hh._search_marketing_vacancy failed emp=%d: %s", employer_id, e)
        return None

    items = data.get("items") or []
    for it in items:
        # Финальная фильтрация: hh иногда возвращает нерелевантные (напр.
        # «менеджер по продажам» под текст «маркетолог»). Проверяем что
        # в названии вакансии есть маркетинговое ключевое слово.
        title = (it.get("name") or "").lower()
        if any(k in title for k in (
            "маркетолог", "маркетинг", "cmo", "smm", "бренд",
            "pr-", "pr ", "пиар", "реклам",
        )):
            return {
                "id": it.get("id"),
                "name": it.get("name"),
                "url": it.get("alternate_url"),  # человекочитаемая ссылка
            }
    return None


async def _fetch_vacancy_contacts(
    client: httpx.AsyncClient, vacancy_id: str | int
) -> dict[str, Any] | None:
    """GET /vacancies/{id} → contacts. Часто contacts=None."""
    try:
        r = await client.get(f"{_HH_API}/vacancies/{vacancy_id}")
        if r.status_code != 200:
            return None
        data = r.json()
    except Exception as e:
        logger.debug("hh._fetch_vacancy_contacts failed id=%s: %s", vacancy_id, e)
        return None

    contacts = data.get("contacts")
    if not isinstance(contacts, dict):
        return None
    return contacts


async def enrich_from_hh(
    db: AsyncSession, company_id: int
) -> dict[str, Any]:
    """Главная функция: ищет employer_id, проверяет наличие маркетинговой
    вакансии, при наличии — тянет контактное лицо, обновляет Company +
    company_decision_makers.
    """
    company = await db.get(Company, company_id)
    if company is None:
        return {"status": "not_found_company"}
    if not company.name:
        return {"status": "no_name"}

    headers = {"User-Agent": _UA, "Accept": "application/json"}
    async with httpx.AsyncClient(
        timeout=_TIMEOUT, headers=headers, follow_redirects=True
    ) as client:
        employer_id = await _search_employer(client, company.name, company.city)
        if employer_id is None:
            return {"status": "no_employer"}

        await asyncio.sleep(0.3)
        vacancy = await _search_marketing_vacancy(client, employer_id)
        if vacancy is None:
            # Работодателя нашли, но маркетолога не ищет — очищаем возможный
            # прошлый флаг (вакансия могла закрыться), контакты не трогаем.
            if company.hiring_marketing:
                await db.execute(
                    update(Company)
                    .where(Company.id == company_id)
                    .values(hiring_marketing=False, hiring_url=None)
                )
                await db.commit()
            return {"status": "no_marketing_vacancy", "employer_id": employer_id}

        # Ставим флаг «ищет маркетолога» + URL вакансии.
        await db.execute(
            update(Company)
            .where(Company.id == company_id)
            .values(
                hiring_marketing=True,
                hiring_url=(vacancy.get("url") or "")[:1000] or None,
            )
        )

        # Пробуем достать контактное лицо.
        await asyncio.sleep(0.3)
        contacts = await _fetch_vacancy_contacts(client, vacancy["id"]) if vacancy.get("id") else None

    saved_person = False
    if contacts and contacts.get("name"):
        name = (contacts.get("name") or "").strip()[:200]
        # Тип контакта: приоритет email > phone.
        email = (contacts.get("email") or "").strip().lower() or None
        phone = None
        phones = contacts.get("phones") or []
        if isinstance(phones, list) and phones:
            p = phones[0]
            if isinstance(p, dict):
                # hh отдаёт {country, city, number, comment}. Собираем в +7...
                country = (p.get("country") or "").strip()
                city_code = (p.get("city") or "").strip()
                number = (p.get("number") or "").strip()
                phone = f"+{country}{city_code}{number}".replace(" ", "") if country else number
                phone = phone or None
        if email:
            contact_type, contact_value = "email", email[:500]
        elif phone:
            contact_type, contact_value = "phone", phone[:500]
        else:
            contact_type, contact_value = None, None

        # Контактное лицо в hh — почти всегда HR (не сам маркетолог).
        # Ставим role_category='hr', confidence=0.5 — оркестратор поставит
        # is_marketing_dm только если ничего лучше не нашлось.
        stmt = pg_insert(CompanyDecisionMaker).values(
            company_id=company_id,
            name=name,
            post="HR / контакт вакансии",
            source="hh",
            source_url=(vacancy.get("url") or "")[:1000] or None,
            confidence=0.5,
            is_decision_maker=False,
            role_category="hr",
            contact_type=contact_type,
            contact_value=contact_value,
        ).on_conflict_do_nothing()
        try:
            await db.execute(stmt)
            saved_person = True
        except Exception as e:
            logger.debug("hh: insert person %r conflict: %s", name, e)

    await db.commit()
    return {
        "status": "ok",
        "employer_id": employer_id,
        "vacancy_id": vacancy.get("id"),
        "vacancy_url": vacancy.get("url"),
        "saved_person": saved_person,
    }
