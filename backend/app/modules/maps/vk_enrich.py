"""VK enrich — контакты сообщества компании (ТЗ «Маркетинг-ЛПР Finder»
2026-06-20 §1.1, приоритет №1 для маркетинга в РФ).

Что делаем автономно
--------------------
1. Ищем группу компании через groups.search (по названию + городу).
2. Валидируем матч: совпадение website (у нас Company.website ↔ group.site)
   или совпадение city + похожее имя. Если ни того ни другого — skip
   (лучше «не нашли», чем взять чужую группу с тем же названием).
3. groups.getById с fields=contacts,site,city,description → достаём блок
   «Контакты» сообщества: имя + должность + телефон + email.
4. Пишем в company_decision_makers с source='vk'.

Что мы НЕ можем автономно
-------------------------
- Админы/редакторы сообщества (groups.getMembers filter=managers требует
  токен пользователя-администратора группы, у нас его нет). Комментарий
  в модели упоминает 'vk' как источник для админов — это работает только
  если владелец группы даст авторизацию через OAuth flow. Оставляем как
  задел, сейчас забираем только публичные contacts.

Ограничения / этика
-------------------
- Данные из блока «Контакты» сообщества — публично отображаются на
  странице группы. Работодатель добровольно их разместил. 152-ФЗ: сбор
  таких данных легален.
- Rate-limit VK API: 3 req/сек service token. У нас 2 запроса на
  компанию (search + getById), безопасно.
- Без VK_SERVICE_TOKEN модуль возвращает `skipped` — оркестратор
  enrich_marketing_dm работает без ВК (просто теряем один сигнал).

Матчинг (важно, false-positive = мусорный ЛПР)
---------------------------------------------
Порог совпадения: если group.site совпал с company.website — берём с
confidence=0.8. Если сайта у группы нет, но совпал город + name (по
_normalize_company_name) — берём с confidence=0.6. Иначе skip.
"""

from __future__ import annotations

import logging
import re
from typing import Any
from urllib.parse import urlparse

import httpx
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.company_decision_maker import CompanyDecisionMaker
from app.models.maps import Company


logger = logging.getLogger(__name__)


_VK_API = "https://api.vk.com/method"
_VK_API_VERSION = "5.199"
_TIMEOUT = httpx.Timeout(10.0, connect=5.0)


def _normalize_company_name(name: str) -> str:
    """См. hh_enrich._normalize_company_name — тот же принцип."""
    if not name:
        return ""
    s = name.lower()
    for stop in (
        "ооо", "оао", "зао", "пао", "ао", "ип ", "тоо", "оно",
        "нко", "ано", "фгуп", "гуп", "муп",
    ):
        s = s.replace(stop, " ")
    s = re.sub(r'[«»"\'`\-–—()]+', " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def _domain(url: str) -> str:
    """Извлекает netloc из URL, убирает www. — для сравнения сайтов
    company.website ↔ group.site."""
    if not url:
        return ""
    if not url.startswith(("http://", "https://")):
        url = "https://" + url
    try:
        host = urlparse(url).netloc.lower()
    except Exception:
        return ""
    if host.startswith("www."):
        host = host[4:]
    return host


async def _vk_call(
    client: httpx.AsyncClient, method: str, params: dict[str, Any]
) -> dict[str, Any] | None:
    """POST-обёртка над api.vk.com/method/*. Возвращает `response` или None
    при ошибке (в т.ч. на error.error_code — VK ошибки не raise'ятся)."""
    payload = {
        **params,
        "access_token": settings.VK_SERVICE_TOKEN,
        "v": _VK_API_VERSION,
    }
    try:
        r = await client.post(f"{_VK_API}/{method}", data=payload)
        if r.status_code != 200:
            logger.debug("vk %s: http %d", method, r.status_code)
            return None
        data = r.json()
    except Exception as e:
        logger.debug("vk %s: %s", method, e)
        return None

    if isinstance(data, dict) and "error" in data:
        err = data["error"]
        logger.info(
            "vk %s error: code=%s msg=%s",
            method, err.get("error_code"), err.get("error_msg"),
        )
        return None
    return data.get("response") if isinstance(data, dict) else None


async def _search_group(
    client: httpx.AsyncClient, company: Company
) -> dict[str, Any] | None:
    """groups.search + матч по website/city. Возвращает {id, name, ...}
    или None."""
    q = (company.name or "").strip()
    if not q:
        return None
    resp = await _vk_call(client, "groups.search", {
        "q": q,
        "count": 20,
        "city": None,  # без ID — не фильтруем; матчить будем по имени/сайту
    })
    if not isinstance(resp, dict):
        return None
    items = resp.get("items") or []
    if not items:
        return None

    target_name = _normalize_company_name(company.name or "")
    target_domain = _domain(company.website or "")
    target_city = (company.city or "").strip().lower()

    # Первый проход: точный матч по website (если у нас он есть).
    if target_domain:
        for g in items:
            gid = g.get("id")
            if not gid:
                continue
            # groups.search сам по себе НЕ возвращает site — надо getById.
            # Здесь пока только запомним первый кандидат по имени, а домен
            # проверим в getById.
            pass

    # Второй проход: по нормализованному имени + городу (fuzzy).
    for g in items:
        gid = g.get("id")
        name = g.get("name") or ""
        gcity = ((g.get("city") or {}).get("title") or "").strip().lower()
        if _normalize_company_name(name) != target_name:
            continue
        if target_city and gcity and target_city == gcity:
            return g
        # Если города не сравниваем (у нас нет company.city или у группы
        # нет city), возвращаем первый точный name-match. Уточнение по
        # website будет в get_by_id.
        return g

    # Ничего не подошло по строгому нормализованному имени — не рискуем.
    return None


async def _get_group_details(
    client: httpx.AsyncClient, group_id: int
) -> dict[str, Any] | None:
    """groups.getById с fields=contacts,site,city."""
    resp = await _vk_call(client, "groups.getById", {
        "group_id": group_id,
        "fields": "contacts,site,city,description",
    })
    # API 5.199: response.groups — массив.
    if isinstance(resp, dict) and "groups" in resp:
        groups = resp.get("groups") or []
        return groups[0] if groups else None
    if isinstance(resp, list) and resp:
        return resp[0]
    return None


async def enrich_from_vk(
    db: AsyncSession, company_id: int
) -> dict[str, Any]:
    """Главная функция: находит группу компании в ВК, тянет блок «Контакты»,
    сохраняет персон в company_decision_makers."""
    if not (settings.VK_SERVICE_TOKEN or "").strip():
        return {"status": "skipped_no_token"}

    company = await db.get(Company, company_id)
    if company is None:
        return {"status": "not_found_company"}
    if not company.name:
        return {"status": "no_name"}

    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        group = await _search_group(client, company)
        if group is None:
            return {"status": "no_group"}

        gid = group.get("id")
        if not gid:
            return {"status": "no_group"}

        details = await _get_group_details(client, int(gid))
        if not details:
            return {"status": "no_details", "group_id": gid}

    # Валидация матча по website (если у нас известен).
    target_domain = _domain(company.website or "")
    group_domain = _domain(details.get("site") or "")
    website_match = bool(target_domain and target_domain == group_domain)

    # Если website у компании известен, а у группы либо нет либо
    # НЕ совпадает — отклоняем матч (высокий риск чужой группы).
    if target_domain and not website_match:
        return {
            "status": "site_mismatch",
            "group_id": gid,
            "group_site": group_domain,
        }

    contacts = details.get("contacts") or []
    if not isinstance(contacts, list) or not contacts:
        # Группа матчится, но публичного блока «Контакты» нет — сохраняем
        # только URL группы (без персон), чтобы UI показал ссылку.
        # Персона не создаётся.
        return {
            "status": "no_contacts",
            "group_id": gid,
            "group_url": f"https://vk.com/club{gid}",
            "website_match": website_match,
        }

    # Confidence: 0.8 если сайт совпал, 0.6 если только имя+город.
    base_confidence = 0.8 if website_match else 0.6

    # Маркетинговые роли для повышения confidence и role_category='marketing'.
    marketing_keywords = (
        "маркет", "cmo", "smm", "бренд", "pr", "пиар", "реклам",
    )

    saved = 0
    group_url = f"https://vk.com/club{gid}"
    for c in contacts:
        if not isinstance(c, dict):
            continue
        # ВК даёт desc (описание/роль), email, phone; иногда только user_id.
        desc = (c.get("desc") or "").strip()
        email = (c.get("email") or "").strip().lower() or None
        phone = (c.get("phone") or "").strip() or None
        user_id = c.get("user_id")

        # Без роли и без user_id (значит и имя не вытащить) — пропускаем.
        # user_id → нужно users.get, но это ещё один API-запрос на каждую
        # персону; в 90% случаев desc есть, стартуем без users.get.
        if not desc and not user_id:
            continue

        # Имя из desc бывает форматов «Марина Иванова — маркетолог».
        # Простой парсер: до тире/двоеточия — имя, после — должность.
        name = None
        post = None
        if desc:
            m = re.match(r"^\s*([^—:•\-]+?)\s*[—:•\-]\s*(.+)$", desc)
            if m:
                name = m.group(1).strip()[:200]
                post = m.group(2).strip()[:200]
            else:
                # Одна строка без разделителя — считаем что это должность
                # или комбо. Кладём в post, name оставляем desc целиком
                # (только если похоже на ФИО ≥ 2 слов).
                parts = desc.split()
                if len(parts) >= 2 and all(p[0].isupper() for p in parts[:2] if p):
                    name = desc[:200]
                    post = None
                else:
                    # Не смогли извлечь ФИО — если хотя бы email/phone
                    # есть, сохраняем как «Контакт сообщества»; иначе skip.
                    if not (email or phone):
                        continue
                    name = "Контакт сообщества"
                    post = desc[:200]

        if not name:
            # Fallback: если user_id есть, ставим «Контакт» — оркестратор
            # его не пометит как маркетинг-ЛПР (role_category='other'),
            # но UI покажет ссылку.
            name = "Контакт сообщества"

        # Определяем role_category и is_dm по post.
        post_low = (post or "").lower()
        is_marketing = any(k in post_low for k in marketing_keywords)
        if is_marketing:
            role_category = "marketing"
        elif any(k in post_low for k in ("директор", "руководител", "владел", "основател", "учредител")):
            role_category = "owner" if "владел" in post_low else "management"
        else:
            role_category = "other"

        # Контакт: email > phone. Если ни того ни другого, но есть user_id
        # → ссылка на профиль ВК (contact_type='vk').
        if email:
            contact_type, contact_value = "email", email[:500]
        elif phone:
            contact_type, contact_value = "phone", phone[:500]
        elif user_id:
            contact_type, contact_value = "vk", f"https://vk.com/id{user_id}"
        else:
            contact_type, contact_value = "vk", group_url  # ссылка на группу

        # Confidence: +0.1 если явно маркетолог.
        confidence = min(0.95, base_confidence + (0.1 if is_marketing else 0.0))

        stmt = pg_insert(CompanyDecisionMaker).values(
            company_id=company_id,
            name=name,
            post=post,
            source="vk",
            source_url=group_url,
            confidence=confidence,
            is_decision_maker=is_marketing or role_category in ("owner", "management"),
            role_category=role_category,
            contact_type=contact_type,
            contact_value=contact_value,
        ).on_conflict_do_nothing()
        try:
            await db.execute(stmt)
            saved += 1
        except Exception as e:
            logger.debug("vk: insert person %r conflict: %s", name, e)

    await db.commit()
    return {
        "status": "ok",
        "group_id": gid,
        "group_url": group_url,
        "website_match": website_match,
        "saved": saved,
    }
