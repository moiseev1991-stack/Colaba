"""ЕГРН↔ЕГРЮЛ сверка (ТЗ «Маркетинг-ЛПР Finder» 2026-06-20 §1.4).

Автоматического ЕГРН-парсера в проекте пока НЕТ: Росреестр не даёт
публичного API без ЭЦП, а платные шлюзы (Kontur/DaData ЕГРН, 1-2 ₽/запрос)
не включены в бюджет. Поэтому этот модуль — сверка: если запись
source='egrn' в company_decision_makers всё-таки появилась (ручной ввод
администратора, будущий импорт из Kontur/etc), мы сравниваем ФИО
собственника с учредителями ЕГРЮЛ и:
  - выставляем egrn_matches_founder=True/False у ЕГРН-записи;
  - повышаем confidence того учредителя, с которым совпал собственник
    (это подтверждённый ЛПР — тот же человек, что владеет и юрлицом,
    и помещением).

Если совпадения нет — оставляем ЕГРН-запись как справку с
egrn_matches_founder=False. Оркестратор enrich_marketing_dm не пометит
её как is_marketing_dm (у 'egrn' role_category обычно 'other'/None).

152-ФЗ: ЕГРН-запись сама по себе — публичная выписка (Росреестр отдаёт
собственника по кадастровому номеру любому желающему). Но использовать
её как контакт для рассылки НЕЛЬЗЯ: у нас нет доказательства, что
собственник помещения — это ЛПР компании (может быть арендодатель).
Помечаем egrn_matches_founder — только тогда UI будет её показывать
как «подтверждённый учредитель».
"""

from __future__ import annotations

import logging
import re
from typing import Any

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.company_decision_maker import CompanyDecisionMaker


logger = logging.getLogger(__name__)


def _normalize_person_name(name: str) -> tuple[str, str, str]:
    """ФИО → (surname, name, patronymic) в нижнем регистре.
    ЕГРЮЛ отдаёт «ИВАНОВ ИВАН ИВАНОВИЧ», ЕГРН — обычно тоже CAPS с
    порядком «Фамилия Имя Отчество». Возвращаем tuple для точного матча.
    Если частей меньше 2, patronymic = ''.
    """
    if not name:
        return ("", "", "")
    parts = re.split(r"\s+", name.strip().lower())
    parts = [p for p in parts if p]
    if len(parts) == 0:
        return ("", "", "")
    if len(parts) == 1:
        return (parts[0], "", "")
    if len(parts) == 2:
        return (parts[0], parts[1], "")
    return (parts[0], parts[1], parts[2])


def _same_person(a: str, b: str) -> bool:
    """Одна и та же персона? Сравниваем surname + name (patronymic
    сравниваем только если он есть у ОБОИХ — часто ЕГРН отдаёт без
    отчества).
    """
    an = _normalize_person_name(a)
    bn = _normalize_person_name(b)
    if not an[0] or not bn[0]:
        return False
    if an[0] != bn[0] or an[1] != bn[1]:
        return False
    # Отчество — сверяем только если есть у обоих; иначе это уже совпадение
    # 2 из 3, чего для матчинга достаточно (совпадение однофамильцев в
    # одной компании крайне маловероятно).
    if an[2] and bn[2] and an[2] != bn[2]:
        return False
    return True


async def reconcile_egrn_for_company(
    db: AsyncSession, company_id: int
) -> dict[str, Any]:
    """Сверяет все ЕГРН-записи компании с учредителями/директором из ЕГРЮЛ.
    Проставляет egrn_matches_founder и повышает confidence совпавшего
    учредителя.
    """
    persons = (await db.execute(
        select(CompanyDecisionMaker).where(
            CompanyDecisionMaker.company_id == company_id
        )
    )).scalars().all()

    egrn_persons = [p for p in persons if p.source == "egrn"]
    if not egrn_persons:
        return {"status": "no_egrn", "company_id": company_id}

    egrul_persons = [
        p for p in persons
        if p.source in ("egrul_founder", "egrul_director")
    ]
    if not egrul_persons:
        # ЕГРН есть, ЕГРЮЛ нет — сверять не с чем. Ставим False всем
        # ЕГРН-записям (это справка, не ЛПР).
        for e in egrn_persons:
            if e.egrn_matches_founder is None or e.egrn_matches_founder is True:
                await db.execute(
                    update(CompanyDecisionMaker)
                    .where(CompanyDecisionMaker.id == e.id)
                    .values(egrn_matches_founder=False)
                )
        await db.commit()
        return {"status": "no_egrul", "egrn_count": len(egrn_persons)}

    matches = 0
    for e in egrn_persons:
        match = None
        for eg in egrul_persons:
            if _same_person(e.name, eg.name):
                match = eg
                break

        matched = match is not None
        await db.execute(
            update(CompanyDecisionMaker)
            .where(CompanyDecisionMaker.id == e.id)
            .values(egrn_matches_founder=matched)
        )
        if match is not None:
            matches += 1
            # Повышаем confidence учредителя — он подтверждён вторым
            # независимым источником (ЕГРН). Ceiling 0.99: 1.0 оставляем
            # для будущего «личное общение проведено».
            new_conf = min(0.99, float(match.confidence or 0.0) + 0.05)
            await db.execute(
                update(CompanyDecisionMaker)
                .where(CompanyDecisionMaker.id == match.id)
                .values(confidence=new_conf)
            )

    await db.commit()
    return {
        "status": "ok",
        "company_id": company_id,
        "egrn_count": len(egrn_persons),
        "matches": matches,
    }
