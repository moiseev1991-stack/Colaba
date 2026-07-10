"""VK enrich — контакты сообщества компании (ТЗ «Маркетинг-ЛПР Finder»
2026-06-20 §1.1, приоритет №1 для маркетинга в РФ).

Что делаем автономно
--------------------
1. Берём VK-slug из company_contacts (type='vk') — 2GIS уже сам привязал
   сообщества к компаниям при парсинге.
2. groups.getById(vk_slug) с fields=contacts,site,city,description → достаём
   блок «Контакты» сообщества: имя + должность + телефон + email.
3. Валидируем матч по website (если у группы есть site и он не совпадает с
   Company.website — отклоняем как чужую группу).
4. Пишем в company_decision_makers с source='vk'.

История стратегии
-----------------
До 2026-07-10 использовался groups.search + fuzzy name/city match. VK
ограничил метод для service token'ов (code=1051 method unavailable), поэтому
перешли на getById с уже известным slug'ом. Плюс: 2GIS-slug — более надёжный
источник чем name-search (нет ambiguity с одноимёнными сообществами).

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
- Rate-limit VK API: 3 req/сек service token. У нас 1 запрос на компанию
  (getById), безопасно.
- Без VK_SERVICE_TOKEN модуль возвращает `skipped` — оркестратор
  enrich_marketing_dm работает без ВК (просто теряем один сигнал).
- Без company_contacts (type='vk') — возвращаем `no_vk_link`, оркестратор
  тоже без ВК-сигнала. Влияет только на компании, где 2GIS не связал VK.

Матчинг (важно, false-positive = мусорный ЛПР)
---------------------------------------------
- Если group.site явно совпал с company.website → confidence=0.9.
- Если site у группы пустой → confidence=0.7 (доверяем 2GIS-привязке).
- Если group.site есть, но НЕ совпал с company.website → skip (чужая группа).
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
from app.models.maps import Company, CompanyContact


logger = logging.getLogger(__name__)


_VK_API = "https://api.vk.com/method"
_VK_API_VERSION = "5.199"
_TIMEOUT = httpx.Timeout(10.0, connect=5.0)


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


_VK_URL_RE = re.compile(
    r"(?:https?://)?(?:m\.|www\.)?vk\.com/(?:club|public|id)?([A-Za-z0-9_.]{3,60})/?",
    re.IGNORECASE,
)


def _extract_vk_slug(vk_value: str) -> str | None:
    """Из строки company_contacts (тип vk) возвращает screen_name / group_id
    для VK API. Примеры:
        'https://vk.com/lame_clinic' → 'lame_clinic'
        'vk.com/club123' → 'club123'  (числовой club id остаётся как есть)
        '@lame_clinic' → 'lame_clinic'
        'lame_clinic' → 'lame_clinic'
    Возвращает None если строка мусорная (типа 'vk.com' без slug'а).
    """
    if not vk_value:
        return None
    raw = vk_value.strip().lstrip("@").rstrip("/")
    m = _VK_URL_RE.match(raw)
    if m:
        slug = m.group(1).strip("_.-")
    else:
        # Может быть чистый handle без URL — примем его как есть.
        slug = raw.strip("_.-")
    # Валидатор: 3-60 символов, только ASCII + `_` + `.`.
    if not re.match(r"^[A-Za-z0-9_.]{3,60}$", slug):
        return None
    # Мусорные значения от 2GIS-парсера
    if slug.lower() in {"vk", "vkcom", "www", "com", "share"}:
        return None
    return slug


async def _pick_vk_slug_for_company(
    db: AsyncSession, company_id: int
) -> str | None:
    """Достаёт VK-slug из company_contacts (type='vk'). Первый is_primary=True
    выигрывает; иначе — любая свежая запись."""
    stmt = (
        select(CompanyContact.value, CompanyContact.is_primary)
        .where(CompanyContact.company_id == company_id)
        .where(CompanyContact.type == "vk")
        .order_by(CompanyContact.is_primary.desc(), CompanyContact.id.desc())
        .limit(10)
    )
    rows = (await db.execute(stmt)).all()
    for value, _ in rows:
        slug = _extract_vk_slug(value or "")
        if slug:
            return slug
    return None


async def _get_group_details(
    client: httpx.AsyncClient, group_id: str
) -> dict[str, Any] | None:
    """groups.getById с fields=contacts,site,city. group_id принимает как
    числовой id, так и screen_name (VK API сам резолвит slug)."""
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

    # 2026-07-10: VK ограничил groups.search для service token
    # (code=1051 method unavailable). Переходим на groups.getById с уже
    # известным VK-slug'ом из company_contacts (2GIS парсит их массово).
    vk_slug = await _pick_vk_slug_for_company(db, company_id)
    if not vk_slug:
        return {"status": "no_vk_link"}

    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        details = await _get_group_details(client, vk_slug)
        if not details:
            return {"status": "no_details", "vk_slug": vk_slug}

    # gid — числовой id, нужен для формирования vk.com/club{gid} URL.
    gid = details.get("id")
    if not gid:
        return {"status": "no_group_id", "vk_slug": vk_slug}

    # Валидация матча по website (если у нас известен).
    # 2026-07-10: VK-slug теперь берётся из company_contacts (2GIS его сам
    # привязал к компании), поэтому «пусто у группы» — норма (не заполнили site),
    # НЕ повод отклонить. Отклоняем только явный mismatch (сайт есть, но чужой).
    target_domain = _domain(company.website or "")
    group_domain = _domain(details.get("site") or "")
    website_match = bool(target_domain and target_domain == group_domain)

    if target_domain and group_domain and not website_match:
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

    # Confidence: 0.9 если сайт совпал явно, 0.7 если сайта у группы нет
    # (доверяем что 2GIS правильно привязал VK к компании).
    base_confidence = 0.9 if website_match else 0.7

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
