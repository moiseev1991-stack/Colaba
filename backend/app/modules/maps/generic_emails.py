"""Разделение общих email компании (info@, contact@…) и личных ЛПР.

Юзер (Дима, 16.07): «если сайт+ВК+hh+ЕГРЮЛ ничего не дали, менеджеру всё
равно есть куда написать — на общую почту компании. Показывай её как
fallback-контакт компании, но НЕ приписывай директору».

Что делаем
----------
Company.emails — плоский список всех emails, которые нашёл playwright/
контакт-краулер сайта. Часть из них — «личные» (уже привязаны к персоне
через email_to_dm_attribution или пришли рядом с ФИО в team_extract) и
лежат в CompanyDecisionMaker.contact_value. Остальное — «общие».

split_generic_emails возвращает список «общих»:
  * либо local-part в whitelist (info/contact/hello/…),
  * либо явно не привязаны ни к одной персоне.

Whitelist local-part'ов — по практике российских корп-сайтов. Держим
короткий; неизвестное local-part'ы (например «zakupki@») тоже считаем
общим, если оно не привязано к ЛПР.
"""

from __future__ import annotations


_GENERIC_LOCAL_WHITELIST = frozenset({
    "info", "contact", "contacts", "kontakt", "kontakti", "kontakty",
    "hello", "hi", "office", "mail", "email", "post",
    "order", "orders", "zakaz", "zakazy",
    "sales", "sale", "prodazhi", "prodaji",
    "help", "support", "podderzhka",
    "admin", "administration", "administracia",
    "reception", "priem",
    "reklama", "advertising", "ads",
    "partner", "partners", "partnership",
    "hr", "rabota", "job", "jobs", "career",
    "press", "media", "pr",
})


def split_generic_emails(
    company_emails: list[str] | None,
    personal_emails: set[str] | None,
) -> list[str]:
    """Возвращает подмножество company_emails, которые НЕ привязаны к ЛПР.

    company_emails — все emails компании (Company.emails).
    personal_emails — set нормализованных (lower, strip) emails, которые
        уже сохранены как contact_value персон (директор с email, найденный
        маркетолог и т.п.).

    Правила:
    1. Пустой/невалидный вход → [].
    2. Дедуп по нормализованной форме (lower + strip). Порядок сохраняется —
       первый встретившийся вариант выигрывает.
    3. Emails, входящие в personal_emails — считаются «личными», отсекаются.
    4. Emails с local-part из _GENERIC_LOCAL_WHITELIST — сразу «общие».
    5. Остальные — «общие» ТОЛЬКО если не в personal_emails. Это ловит
       кейсы, когда info@ уже приписался директору Иванову через транслит
       (маловероятно, но пусть будет консервативно): такой email не
       продублируем в общей почте.
    """
    if not company_emails:
        return []
    personal_lower = {(e or "").strip().lower() for e in (personal_emails or set()) if e}
    seen: set[str] = set()
    result: list[str] = []
    for raw in company_emails:
        if not raw or not isinstance(raw, str):
            continue
        normalized = raw.strip().lower()
        if not normalized or "@" not in normalized or normalized in seen:
            continue
        seen.add(normalized)
        if normalized in personal_lower:
            continue
        local = normalized.split("@", 1)[0]
        if local in _GENERIC_LOCAL_WHITELIST:
            result.append(normalized)
            continue
        # Не whitelist и не привязан к ЛПР — тоже общий. Практика: у SMB
        # часто «zakupki@» или «reklama-msk@» — общий канал, но не в списке.
        result.append(normalized)
    return result
