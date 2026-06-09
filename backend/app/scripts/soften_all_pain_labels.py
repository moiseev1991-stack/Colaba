"""Однопроходный скрипт: применяет _soften_pain_label ко всем активным
pain-тегам в БД (label + description).

Контекст: до 2026-06-10 recluster создавал теги вроде «Мошенничество с
ценами», «Развод клиентов». Это юридически рискованно в карточке-лиде,
по которой пойдёт холодное письмо. С нового релиза промпт и post-process
не создают таких label'ов, но УЖЕ существующие в БД теги нужно
пере-смягчить одним проходом.

Запуск на проде:
    docker exec colaba-backend-1 python -m app.scripts.soften_all_pain_labels

Печатает JSON: {"scanned": N, "softened": M}.
Скрипт идемпотентный — повторный запуск не сделает ничего.
"""

import asyncio
import json

from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.models.pain_tag import PainTag
from app.modules.reviews_ai.llm import _soften_pain_label


async def run() -> dict[str, int]:
    async with AsyncSessionLocal() as db:
        tags = (
            await db.execute(select(PainTag).where(PainTag.status == "active"))
        ).scalars().all()
        changed = 0
        for t in tags:
            new_label = _soften_pain_label(t.label or "")
            new_desc = _soften_pain_label(t.description or "")
            if new_label != (t.label or "") or new_desc != (t.description or ""):
                t.label = new_label
                if t.description is not None:
                    t.description = new_desc
                changed += 1
        if changed > 0:
            await db.commit()
        return {"scanned": len(tags), "softened": changed}


if __name__ == "__main__":
    result = asyncio.run(run())
    print(json.dumps(result, ensure_ascii=False))
