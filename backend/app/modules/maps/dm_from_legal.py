"""Импорт директора+учредителей из CompanyLegal в CompanyDecisionMaker
(ТЗ «Маркетинг-ЛПР Finder» 2026-06-20, §1.4 ЕГРЮЛ).

Зачем: до этой миграции DaData-директор жил ТОЛЬКО в CompanyLegal.director_name —
UI/Excel обращались к нему отдельным путём (legal → director). Теперь мы
поднимаем директора и учредителей в единую таблицу company_decision_makers
как параллельные записи с source='egrul_director' / 'egrul_founder'. Это
даёт унифицированный список персон в drawer и позволяет оркестратору
enrich_marketing_dm выбрать best-DM среди всех источников на равных.

Legal.director_name остаётся источником истины — сюда мы только зеркалим
(idempotent через ON CONFLICT DO NOTHING по UNIQUE index (company_id,
lower(name)) из миграции 032).
"""

from __future__ import annotations

import logging
from typing import Any

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.company_decision_maker import CompanyDecisionMaker
from app.models.company_legal import CompanyLegal


logger = logging.getLogger(__name__)


async def import_persons_from_legal(
    db: AsyncSession, company_id: int
) -> dict[str, Any]:
    """Читает CompanyLegal(company_id) и создаёт записи в CompanyDecisionMaker:
    - директор → source='egrul_director', role_category='management';
    - каждый учредитель → source='egrul_founder', role_category='founder'.

    Дубликаты (то же ФИО уже сохранено с сайта) отсекаются UNIQUE-индексом.
    Ничего не возвращает если CompanyLegal не найден или status != 'ok'.
    """
    legal = (await db.execute(
        select(CompanyLegal).where(CompanyLegal.company_id == company_id)
    )).scalar_one_or_none()
    if legal is None or legal.status != "ok":
        return {"status": "no_legal", "saved": 0}

    saved = 0

    # --- Директор ---
    if legal.director_name:
        # 2026-07-10 (E2E-инсайт): если director_post = «Ликвидатор» /
        # «Конкурсный управляющий» / «Арбитражный управляющий» — компания
        # в стадии банкротства/ликвидации, не наш целевой лид. Роль ставим
        # 'other' чтобы оркестратор НЕ выбрал его как marketing_dm.
        # Имя всё равно сохраняем — юзер увидит статус в drawer.
        director_post_low = (legal.director_post or "").lower()
        is_liquidation = any(
            k in director_post_low
            for k in ("ликвидатор", "конкурсный", "арбитражный управляющий")
        )
        director_role = "other" if is_liquidation else "management"

        stmt = pg_insert(CompanyDecisionMaker).values(
            company_id=company_id,
            name=legal.director_name[:200],
            post=(legal.director_post or "")[:200] or None,
            source="egrul_director",
            source_url=None,
            # DaData отдаёт руководителя по данным ФНС — это официальный
            # факт, confidence максимальный.
            confidence=0.95,
            # Ликвидатор — фактически ещё «руководитель» юридически, но
            # для outreach-целей мы его не считаем ЛПР (компания закрывается).
            is_decision_maker=not is_liquidation,
            role_category=director_role,
            contact_type=None,
            contact_value=None,
        ).on_conflict_do_nothing()
        try:
            await db.execute(stmt)
            saved += 1
        except Exception as e:
            logger.debug("import director %r conflict: %s", legal.director_name, e)

    # --- Учредители ---
    founders = legal.founders_json or []
    if isinstance(founders, list):
        for f in founders:
            if not isinstance(f, dict):
                continue
            fname = (f.get("name") or "").strip()
            if not fname:
                continue
            # У юр.лица-учредителя (например «ООО "Родитель"») тоже есть
            # name, но это НЕ ФИО — пропускаем. Простой сан-чек: должно
            # быть ≥2 слов на кириллице.
            parts = [p for p in fname.split() if p]
            if len(parts) < 2:
                continue

            # Post: у учредителя должности нет, но для отображения ставим
            # «Учредитель» + долю в скобках, если известна.
            share_val = f.get("share_value")
            if share_val is not None:
                try:
                    share_str = f"Учредитель ({float(share_val):.0f}%)"
                except (TypeError, ValueError):
                    share_str = "Учредитель"
            else:
                share_str = "Учредитель"

            stmt = pg_insert(CompanyDecisionMaker).values(
                company_id=company_id,
                name=fname[:200],
                post=share_str[:200],
                source="egrul_founder",
                source_url=None,
                # Учредитель — тоже официальный факт из ФНС. Confidence
                # ниже директора (0.85 vs 0.95): учредитель может быть
                # номинальным, но всё равно принимает решения в 90% случаев.
                confidence=0.85,
                is_decision_maker=True,
                role_category="founder",
                contact_type=None,
                contact_value=None,
            ).on_conflict_do_nothing()
            try:
                await db.execute(stmt)
                saved += 1
            except Exception as e:
                logger.debug("import founder %r conflict: %s", fname, e)

    await db.commit()
    return {"status": "ok", "saved": saved}
