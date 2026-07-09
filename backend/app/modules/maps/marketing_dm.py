"""Оркестратор выбора маркетинг-ЛПР — ТЗ «Маркетинг-ЛПР Finder» 2026-06-20 §3.

Задача: пройти все источники ЛПР для компании (сайт /team, ВК, hh.ru, ЕГРЮЛ,
ЕГРН) и выбрать ОДНОГО целевого — того, кому подрядчик по маркетингу пишет
в первую очередь. Помечаем его is_marketing_dm=True (ровно один на компанию).

Приоритет (см. ТЗ §3.5):
    1) role_category='marketing' (явный маркетолог / CMO / бренд / SMM / PR)
    2) role_category='founder' или 'owner' (учредитель — в малом бизнесе
       принимает все решения, включая маркетинг)
    3) role_category='management' (директор — фолбэк, когда маркетолога нет)
    4) прочее — не помечаем (лучше «ЛПР не найден», чем пометить менеджера
       по продажам как маркетинг-ЛПР).
При равном приоритете — выше confidence; при равном confidence — есть контакт
предпочтительнее.

Оркестратор идёмпотентен: перед выбором нового целевого сбрасывает старый
флаг is_marketing_dm по компании (у прошлого прогона могли быть новые записи
из website/hh, и целевой мог поменяться).

Что запускает оркестратор
-------------------------
На вход даём company_id. Внутри:
  1. Убеждаемся, что персоны из ЕГРЮЛ (директор+учредители) перенесены в
     company_decision_makers (import_persons_from_legal). Идёмпотентно.
  2. Считываем всех decision_makers по company_id.
  3. Выбираем best-DM по приоритету и метим is_marketing_dm.

ВК / hh.ru — отдельные Celery-таски, они пишут в ту же таблицу СВОИ записи
до вызова оркестратора. Здесь мы источники не дёргаем — только читаем то,
что уже сохранено. Так проще retry-логика (каждый источник живёт своей
жизнью, оркестратор только скорит).
"""

from __future__ import annotations

import logging
from typing import Any

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.company_decision_maker import CompanyDecisionMaker
from app.modules.maps.dm_from_legal import import_persons_from_legal
from app.modules.maps.egrn_reconcile import reconcile_egrn_for_company


logger = logging.getLogger(__name__)


# Приоритет ролей. Чем ниже число — тем ближе к целевому маркетинг-ЛПР.
# «other» и None НЕ попадают в выборку целевого вообще — лучше «не нашли»,
# чем пометить менеджера по продажам как маркетинг-ЛПР.
_ROLE_PRIORITY: dict[str, int] = {
    "marketing": 0,
    "owner": 1,
    "founder": 1,
    "management": 2,
    "hr": 3,
}


def _has_contact(dm: CompanyDecisionMaker) -> bool:
    """У персоны есть публичный рабочий канал?
    (contact_type + contact_value заполнены — это единственная гарантия,
    что мы сможем реально написать. Директор из ЕГРЮЛ contact_type=None —
    его подсветим как фолбэк-ЛПР, но приоритет ниже.)"""
    return bool(dm.contact_type and dm.contact_value)


def _pick_best(dms: list[CompanyDecisionMaker]) -> CompanyDecisionMaker | None:
    """Из списка выбирает одну персону — целевого маркетинг-ЛПР.
    None — если среди кандидатов нет ни marketing/owner/founder/management/hr.

    Сортировка ключом:
        (role_priority, -confidence_as_float, has_contact_desc, source_priority)
    Меньше — лучше. `has_contact_desc` инвертирован: True → 0, False → 1
    (чтобы «с контактом» шёл раньше при прочих равных).
    """
    candidates = [d for d in dms if (d.role_category or "") in _ROLE_PRIORITY]
    if not candidates:
        return None

    # source_priority: если два учредителя одинаковой роли/confidence,
    # предпочитаем того, что пришёл с сайта (там часто рядом контакт),
    # затем ВК, затем ЕГРЮЛ.
    source_prio: dict[str, int] = {
        "website_team": 0,
        "website_about": 0,
        "website_contacts": 0,
        "vk": 1,
        "hh": 2,
        "egrul_founder": 3,
        "egrul_director": 4,
        "egrn": 5,
    }

    def _key(d: CompanyDecisionMaker) -> tuple[int, float, int, int]:
        role_p = _ROLE_PRIORITY[d.role_category]
        # confidence — Numeric(3,2) в БД, приходит Decimal. Инвертируем
        # для «больше — раньше».
        conf = float(d.confidence or 0.0)
        contact_p = 0 if _has_contact(d) else 1
        src_p = source_prio.get(d.source or "", 9)
        return (role_p, -conf, contact_p, src_p)

    candidates.sort(key=_key)
    return candidates[0]


async def enrich_marketing_dm(
    db: AsyncSession, company_id: int
) -> dict[str, Any]:
    """Оркестратор: подтягивает egrul-персон если ещё не подтянуты, выбирает
    целевого маркетинг-ЛПР, ставит is_marketing_dm=True одной записи.

    Возвращает dict со сводкой: сколько персон в БД, кто выбран, из какого
    источника, было ли обновление флага.
    """
    # Шаг 1. Идёмпотентно поднять ЕГРЮЛ-персон (директор+учредители) в
    # company_decision_makers. Если Legal нет / DaData не отдала — тихо
    # возвращает no_legal, это ок.
    try:
        await import_persons_from_legal(db, company_id)
    except Exception as e:
        # Не роняем оркестратор из-за legal — есть шанс, что website уже
        # нашёл маркетолога, выберем его без ЕГРЮЛ.
        logger.warning(
            "enrich_marketing_dm: import_persons_from_legal failed for #%d: %s",
            company_id, e,
        )

    # Шаг 1b. Сверка ЕГРН↔ЕГРЮЛ (если есть ЕГРН-записи). Тихо no-op'ит
    # если ЕГРН-источник ещё не подключён — сверка нужна только для
    # confidence-буста учредителя.
    try:
        await reconcile_egrn_for_company(db, company_id)
    except Exception as e:
        logger.warning(
            "enrich_marketing_dm: reconcile_egrn failed for #%d: %s",
            company_id, e,
        )

    # Шаг 2. Все decision_makers компании.
    dms = (await db.execute(
        select(CompanyDecisionMaker).where(
            CompanyDecisionMaker.company_id == company_id
        )
    )).scalars().all()

    if not dms:
        return {
            "status": "no_persons",
            "company_id": company_id,
            "total": 0,
            "chosen_id": None,
        }

    # Шаг 3. Выбор best-DM.
    best = _pick_best(list(dms))

    # Шаг 4. Идёмпотентная простановка флага. Даже если best is None —
    # сбрасываем прошлый флаг (данные могли устареть, лучше явное «нет
    # маркетинг-ЛПР» чем стало устаревшее «Иванов И.И.»).
    await db.execute(
        update(CompanyDecisionMaker)
        .where(CompanyDecisionMaker.company_id == company_id)
        .where(CompanyDecisionMaker.is_marketing_dm.is_(True))
        .values(is_marketing_dm=False)
    )
    if best is not None:
        await db.execute(
            update(CompanyDecisionMaker)
            .where(CompanyDecisionMaker.id == best.id)
            .values(is_marketing_dm=True)
        )

    await db.commit()

    return {
        "status": "ok",
        "company_id": company_id,
        "total": len(dms),
        "chosen_id": best.id if best else None,
        "chosen_name": best.name if best else None,
        "chosen_role_category": best.role_category if best else None,
        "chosen_source": best.source if best else None,
        "chosen_has_contact": _has_contact(best) if best else False,
    }
