"""Атрибуция email компании директору/учредителю из ЕГРЮЛ (2026-07-10).

Задача (боль из E2E-теста 2026-07-10):
    Playwright + httpx уже собирают emails с сайта компании (Company.emails,
    company_contacts type='email'). Но директор из ЕГРЮЛ приходит только
    с ФИО, без contact_value. У 100% egrul-директоров нет контакта — писать
    некуда.

    Часто email на сайте персональный: `ivanov@company.ru` при директоре
    Иванове. Или `i.ivanov@`, или `ivan.ivanov@`. Этот модуль эвристически
    связывает найденный email с ФИО директора.

Что делаем
----------
1. Берём CompanyDecisionMaker с source ∈ {egrul_director, egrul_founder} и
   contact_value IS NULL по данной компании.
2. Собираем emails компании (Company.emails + company_contacts type='email').
3. Для каждого email проверяем совпадение local-part с транслитом ФИО:
   - точная фамилия → 0.7
   - фамилия+имя (склеенное/через . _ -) → 0.85
   - initial+фамилия → 0.75
   - имя → 0.5
4. При match >= 0.5 обновляем contact_type='email', contact_value=<email>,
   confidence = min(0.95, existing + 0.05).

Что НЕ делаем
-------------
- **Generic-фолбэк** (info@/office@/contact@) НЕ приписываем директору —
  это нарушит доверие к «marketing-DM», юзер начнёт видеть общие email'ы
  как «email директора». Такие emails остаются в Company.emails без
  привязки к персоне — UI показывает их отдельно как «общий email».

152-ФЗ (этика)
--------------
Email опубликован на сайте компании в publicly доступном виде — сбор
и обработка legal (ст.6 п.5 и п.7 152-ФЗ). Атрибуция ФИО ↔ email —
это структурирование уже публичных данных, дополнительного согласия
субъекта персональных данных не требуется.
"""

from __future__ import annotations

import logging
import re
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.company_decision_maker import CompanyDecisionMaker
from app.models.maps import Company, CompanyContact
from app.modules.maps.contact_validation import (
    is_valid_email,
    is_valid_email_async,
)

logger = logging.getLogger(__name__)


# Упрощённая транслитерация ГОСТ 7.79-2000 (система Б). Для матчинга email
# точная система не критична — важно чтобы Иванов → ivanov, не 'ivanof'.
_CYRILLIC_TO_LATIN = {
    "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "e",
    "ж": "zh", "з": "z", "и": "i", "й": "y", "к": "k", "л": "l", "м": "m",
    "н": "n", "о": "o", "п": "p", "р": "r", "с": "s", "т": "t", "у": "u",
    "ф": "f", "х": "kh", "ц": "ts", "ч": "ch", "ш": "sh", "щ": "shch",
    "ъ": "", "ы": "y", "ь": "", "э": "e", "ю": "yu", "я": "ya",
}


# Обычно юзеры юзают более «мягкие» варианты транслитa. Для «Иванов» — самая
# частая форма 'ivanov', но встречаются и 'ivanoff', 'ivanof'. Список
# алтернативных вариантов surname → set of accepted local-parts.
def _translit(cyr: str) -> str:
    return "".join(_CYRILLIC_TO_LATIN.get(c.lower(), c.lower()) for c in cyr)


def _translit_variants(name: str) -> set[str]:
    """Основной + возможные альтернативы (окончания -ов → -off / -ow / -o).
    Возвращает множество нормализованных строк (a-z0-9, без пунктуации)."""
    base = _translit(name).strip()
    base = re.sub(r"[^a-z0-9]+", "", base)
    if not base:
        return set()
    variants = {base}
    # -ov → -off, -ow, -o
    if base.endswith("ov"):
        variants.add(base[:-2] + "off")
        variants.add(base[:-2] + "ow")
        variants.add(base[:-2] + "o")
    if base.endswith("iy"):  # -ий → -y
        variants.add(base[:-2] + "y")
    if base.endswith("y"):
        variants.add(base + "y")  # -ий → yy
    return variants


def _parse_fio(full_name: str) -> tuple[set[str], set[str], set[str]] | None:
    """Разбирает 'Фамилия Имя Отчество' → (surname_variants, name_variants,
    patronymic_variants). Отчество опц. Каждый — set транслит-вариантов."""
    if not full_name:
        return None
    parts = full_name.strip().split()
    if len(parts) < 2:
        return None
    surname_v = _translit_variants(parts[0])
    name_v = _translit_variants(parts[1])
    patr_v = _translit_variants(parts[2]) if len(parts) > 2 else set()
    if not surname_v or not name_v:
        return None
    return surname_v, name_v, patr_v


def _local_part(email: str) -> str:
    """Возвращает нижний регистр local-part email, без пробелов."""
    if "@" not in email:
        return ""
    return email.split("@", 1)[0].strip().lower()


def _match_email_to_person(
    local: str,
    surname_v: set[str],
    name_v: set[str],
) -> float:
    """Возвращает confidence 0.0-0.9 для конкретной пары (email, персона).

    Правила (в порядке приоритета — берётся первый сработавший):
      1) `ivan.ivanov@` / `ivanov.ivan@` / `ivanov_ivan@` → 0.85
      2) `ivanov@` → 0.7
      3) `iivanov@` / `i.ivanov@` (initial + surname) → 0.75
      4) `ivanov.i` / `ivanovi` (surname + initial) → 0.7
      5) `ivan@` → 0.5 (слабый сигнал — имена частые)
      6) иначе → 0.0
    """
    if not local:
        return 0.0
    local_clean = re.sub(r"[^a-z0-9._-]", "", local)
    # Разбиваем по разделителям (точка/подчёркивание/дефис).
    tokens = [t for t in re.split(r"[._-]+", local_clean) if t]
    tokens_lower = [t.lower() for t in tokens]
    normalized = "".join(tokens_lower)

    # (1) two tokens = имя+фамилия в любом порядке
    if len(tokens_lower) == 2:
        a, b = tokens_lower
        if (a in name_v and b in surname_v) or (a in surname_v and b in name_v):
            return 0.85
        # initial+surname
        if len(a) == 1 and any(n.startswith(a) for n in name_v) and b in surname_v:
            return 0.75
        if a in surname_v and len(b) == 1 and any(n.startswith(b) for n in name_v):
            return 0.7

    # (2) одно длинное слово — склеенное имя+фамилия
    if len(tokens_lower) == 1 and len(normalized) > 6:
        for s in surname_v:
            for n in name_v:
                if normalized == s + n or normalized == n + s:
                    return 0.85
                if normalized == n[0] + s:
                    return 0.75  # 'iivanov'
                if normalized == s + n[0]:
                    return 0.7  # 'ivanovi'

    # (3) только фамилия
    if normalized in surname_v:
        return 0.7

    # (4) только имя — слабо, но всё же
    if normalized in name_v and len(normalized) >= 4:
        return 0.5

    return 0.0


async def _collect_company_emails(
    db: AsyncSession, company_id: int
) -> list[str]:
    """Все emails компании — из Company.emails (JSONB) + company_contacts.
    Дедупликация по нижнему регистру.

    Фильтрация: пропускаем через is_valid_email (без MX — тут hot-path
    матчинга по ФИО, MX-check для одобренного best_email делается позже
    в attribute_emails_to_dms перед сохранением как contact_value).
    Отсекаем placeholder'ы, noreply@, невалидный формат — иначе директор
    получит `noreply@company.ru` как «свой» email.
    """
    company = await db.get(Company, company_id)
    out: dict[str, str] = {}  # lowercased → original

    def _maybe_add(raw: str) -> None:
        v_ok, _r, norm = is_valid_email(raw, check_mx=False)
        if v_ok:
            out.setdefault(norm, norm)

    if company and company.emails:
        for e in company.emails:
            if isinstance(e, str) and "@" in e:
                _maybe_add(e)
    rows = (
        await db.execute(
            select(CompanyContact.value)
            .where(CompanyContact.company_id == company_id)
            .where(CompanyContact.type == "email")
        )
    ).all()
    for (value,) in rows:
        if isinstance(value, str) and "@" in value:
            _maybe_add(value)
    return list(out.values())


async def attribute_emails_to_dms(
    db: AsyncSession, company_id: int
) -> dict[str, Any]:
    """Основная точка входа: для одной компании пробует связать найденные
    emails с директорами/учредителями из ЕГРЮЛ.

    Возвращает {status, attributed, considered_dms, considered_emails}.
    Идёмпотентно: DM с уже заполненным contact_value не трогает.
    """
    dms = list(
        (
            await db.execute(
                select(CompanyDecisionMaker)
                .where(CompanyDecisionMaker.company_id == company_id)
                .where(
                    CompanyDecisionMaker.source.in_(
                        ["egrul_director", "egrul_founder"]
                    )
                )
                .where(CompanyDecisionMaker.contact_value.is_(None))
            )
        )
        .scalars()
        .all()
    )
    if not dms:
        return {"status": "no_dms_without_contact", "attributed": 0}

    emails = await _collect_company_emails(db, company_id)
    if not emails:
        return {
            "status": "no_emails",
            "attributed": 0,
            "considered_dms": len(dms),
        }

    attributed = 0
    for dm in dms:
        parsed = _parse_fio(dm.name or "")
        if not parsed:
            continue
        surname_v, name_v, _ = parsed
        best_email: str | None = None
        best_conf = 0.0
        for email in emails:
            local = _local_part(email)
            conf = _match_email_to_person(local, surname_v, name_v)
            if conf > best_conf:
                best_conf = conf
                best_email = email
        if best_email and best_conf >= 0.5:
            # Финальный MX-check перед сохранением как contact_value —
            # тут кандидат ровно один, стоимость DNS ≈0 после LRU-кэша.
            # Если MX нет, письмо заведомо не дойдёт — не приписываем.
            mx_ok, _r, _norm = await is_valid_email_async(best_email, check_mx=True)
            if not mx_ok:
                logger.info(
                    "email_to_dm: skip company=%d dm=%d email=%r no_mx",
                    company_id, dm.id, best_email,
                )
                continue
            dm.contact_type = "email"
            dm.contact_value = best_email[:500]
            # confidence бустится немного (не переписываем полностью — 0.95
            # ЕГРЮЛ-директора это гарантия что ФИО правильное, а email
            # добавляет уверенности что можно писать).
            try:
                current = float(dm.confidence or 0.0)
            except (TypeError, ValueError):
                current = 0.0
            dm.confidence = min(0.95, current + 0.05)
            attributed += 1
            logger.info(
                "email_to_dm: company=%d dm=%d name=%r attributed email=%r conf=%.2f",
                company_id, dm.id, dm.name, best_email, best_conf,
            )

    if attributed:
        await db.commit()

    return {
        "status": "ok",
        "attributed": attributed,
        "considered_dms": len(dms),
        "considered_emails": len(emails),
    }
