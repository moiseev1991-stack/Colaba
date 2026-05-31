"""HTML-парсер карточки 2GIS — fallback когда Catalog API не отдал contact_groups.

На нашем тарифе 2GIS Catalog API contact_groups приходят пустыми для большинства
компаний (только реклама/проверенные карточки). HTML-страница 2gis.ru/firm/{id}
доступна всем и обычно содержит телефоны, мессенджеры, ссылки на соцсети.

Стратегия извлечения:
  1) Пробуем найти JSON в <script>window.__INITIAL_STATE__ = {...}</script> —
     это SSR-нагрузка React-приложения 2GIS. Парсим контакты структурно.
  2) Если __INITIAL_STATE__ нет / парсинг JSON упал — фолбэк на regex по тексту
     HTML (tel:, mailto:, t.me/, vk.com/, wa.me/ и пр. — те же regex что в
     enrich.py для сайтов компаний).

Принципы:
- Никогда не бросает исключений: при любой ошибке возвращает ContactEnrichResult
  с error и остальное пустое.
- Лимит размера тела (1.5 МБ), как и у краулера сайтов.
- НЕ использует прокси по умолчанию (env-флаг TWOGIS_HTML_USE_PROXY можно
  включить позже, когда упрёмся в капчу/429).
- Rate-limit оставляем на Celery-уровне (только одна задача в момент времени
  по очереди `maps_2gis_html`).
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any

import httpx

from app.modules.maps.enrich import (
    ContactEnrichResult,
    _extract_from_html,
    _normalize_phone,
    _accept_email,
)

logger = logging.getLogger(__name__)

_FIRM_URL = "https://2gis.ru/firm/{external_id}"

_TIMEOUT = 12.0
_MAX_BYTES = 1_500_000
_MAX_REDIRECTS = 3
_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)

# Поиск __INITIAL_STATE__ в HTML. У 2GIS бывает несколько вариантов:
#   window.__INITIAL_STATE__ = {...};
#   window['__INITIAL_STATE__'] = {...};
# Берём максимально лояльный regex с lazy matching до закрывающей `;</script>`.
# multiline + dotall чтобы JSON с переносами строк поймать.
_INITIAL_STATE_RE = re.compile(
    r"window\.__INITIAL_STATE__\s*=\s*(\{.*?\})\s*;\s*</script>",
    re.DOTALL,
)

# Captcha/anti-bot страница 2GIS — короткое тело, в нём фраза «not a robot»
# или ссылка на captcha. Без точной разметки на руках детектим эвристикой
# по размеру + ключевым словам.
_CAPTCHA_MARKERS = ("captcha", "not_a_robot", "Доступ временно ограничен")


def _walk_json_for_contacts(node: Any, result: ContactEnrichResult) -> None:
    """Рекурсивно обходит JSON 2GIS __INITIAL_STATE__ и собирает контакты.

    Структура 2GIS-карточки нам точно не известна (она может меняться от
    версии к версии), поэтому ищем универсально:
      - dict с ключом "type" в {phone, website, email, telegram, whatsapp,
        viber, vkontakte, instagram, facebook} и ключом "value" — это
        contact-объект.
      - dict с ключами "url"/"href" + value, содержащим t.me/vk.com/etc —
        захватываем как ссылку.

    Глубина рекурсии не ограничена, но JSON 2GIS не циклический — обычная
    SSR-нагрузка ~100-500 КБ. Если случайно попадётся цикл — RecursionError
    отлавливается outer-блоком и мы фолбэкнемся на regex.
    """
    if isinstance(node, dict):
        ctype = (node.get("type") or "").lower() if isinstance(node.get("type"), str) else ""
        value = node.get("value")
        if ctype and isinstance(value, str):
            v = value.strip()
            if ctype == "phone":
                n = _normalize_phone(v)
                if n and n not in result.phones and len(result.phones) < 5:
                    result.phones.append(n)
            elif ctype in ("website", "url") and v:
                # сайт компании — складываем в phones-как-fetched_url? Нет,
                # для website отдельной строки в ContactEnrichResult нет;
                # её отдают в companies.website через основной upsert.
                pass
            elif ctype == "email":
                el = v.lower()
                if _accept_email(el) and el not in result.emails and len(result.emails) < 10:
                    result.emails.append(el)
            elif ctype == "telegram" and v:
                handle = v.lstrip("@").lower()
                if "/" in handle:
                    handle = handle.rsplit("/", 1)[-1]
                if handle and handle not in result.telegrams and len(result.telegrams) < 5:
                    result.telegrams.append(handle)
            elif ctype == "whatsapp" and v:
                n = _normalize_phone(v)
                if n and n not in result.whatsapps and len(result.whatsapps) < 5:
                    result.whatsapps.append(n)
            elif ctype in ("vkontakte", "vk") and v:
                handle = v.rstrip("/").rsplit("/", 1)[-1].lower()
                if handle and handle not in result.vks and len(result.vks) < 5:
                    result.vks.append(handle)
            elif ctype == "instagram" and v:
                handle = v.lstrip("@").rstrip("/").rsplit("/", 1)[-1].lower()
                if handle and handle not in result.instagrams and len(result.instagrams) < 3:
                    result.instagrams.append(handle)
            elif ctype == "facebook" and v:
                handle = v.rstrip("/").rsplit("/", 1)[-1].lower()
                if handle and handle not in result.facebooks and len(result.facebooks) < 3:
                    result.facebooks.append(handle)

        for v in node.values():
            _walk_json_for_contacts(v, result)
    elif isinstance(node, list):
        for item in node:
            _walk_json_for_contacts(item, result)


def _extract_from_initial_state(html: str) -> ContactEnrichResult | None:
    """Пытается найти и распарсить __INITIAL_STATE__. None если не нашли."""
    m = _INITIAL_STATE_RE.search(html)
    if not m:
        return None
    raw = m.group(1)
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        logger.debug("2gis __INITIAL_STATE__ JSON decode failed: %s", e)
        return None
    result = ContactEnrichResult()
    try:
        _walk_json_for_contacts(data, result)
    except RecursionError:
        logger.warning("2gis __INITIAL_STATE__ walk hit RecursionError")
        return None
    return result


def _looks_like_captcha(html: str) -> bool:
    """Эвристика: 2GIS вернул нам страницу-заглушку анти-бота."""
    if len(html) < 5000 and any(marker.lower() in html.lower() for marker in _CAPTCHA_MARKERS):
        return True
    return False


async def fetch_and_extract_2gis_firm(external_id: str) -> ContactEnrichResult:
    """Главная функция: GET 2gis.ru/firm/{id} → extract контактов.

    Не использует прокси по умолчанию. Если упрёмся в капчу — будем смотреть,
    включать ли TWOGIS_HTML_USE_PROXY (env-флаг, добавим позже при
    необходимости).
    """
    if not external_id:
        return ContactEnrichResult(error="empty external_id")

    url = _FIRM_URL.format(external_id=external_id)
    headers = {
        "User-Agent": _UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.8",
        # Referer тоже похож на 2gis-карточку — снижает шанс блока.
        "Referer": "https://2gis.ru/",
    }

    try:
        async with httpx.AsyncClient(
            timeout=_TIMEOUT,
            follow_redirects=True,
            max_redirects=_MAX_REDIRECTS,
            headers=headers,
        ) as client:
            resp = await client.get(url)
            if resp.status_code == 404:
                return ContactEnrichResult(
                    error="firm 404 (карточка недоступна)",
                    fetched_url=str(resp.url),
                )
            if resp.status_code == 429:
                return ContactEnrichResult(
                    error="2gis rate-limit (429)",
                    fetched_url=str(resp.url),
                )
            if resp.status_code >= 400:
                return ContactEnrichResult(
                    error=f"http {resp.status_code}",
                    fetched_url=str(resp.url),
                )

            body = resp.content[:_MAX_BYTES]
            ctype = (resp.headers.get("content-type") or "").lower()
            if "html" not in ctype:
                return ContactEnrichResult(
                    error=f"content-type {ctype!r}",
                    fetched_url=str(resp.url),
                )

            try:
                html = body.decode(resp.encoding or "utf-8", errors="ignore")
            except (LookupError, TypeError):
                html = body.decode("utf-8", errors="ignore")

            if _looks_like_captcha(html):
                return ContactEnrichResult(
                    error="2gis captcha",
                    fetched_url=str(resp.url),
                )

            # Сначала пробуем структурный JSON
            result = _extract_from_initial_state(html)
            if result is None:
                # Фолбэк: regex по тексту HTML
                result = _extract_from_html(html)
            else:
                # __INITIAL_STATE__ дало структурные данные — но HTML может
                # ещё содержать ссылки на соцсети, которые в JSON не лежат.
                # Сливаем оба.
                regex_result = _extract_from_html(html)
                result.merge(regex_result)

            result.fetched_url = str(resp.url)
            return result
    except httpx.TimeoutException:
        return ContactEnrichResult(error="timeout")
    except httpx.HTTPError as e:
        return ContactEnrichResult(error=f"http error: {type(e).__name__}")
    except Exception as e:
        logger.debug("fetch_and_extract_2gis_firm: unexpected error for %r: %s", external_id, e)
        return ContactEnrichResult(error=f"unexpected: {type(e).__name__}")
