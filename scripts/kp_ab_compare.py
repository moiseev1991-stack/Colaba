"""A/B сравнение старого и нового промпта КП (ТЗ 2026-07-11 §5).

Берёт список company_ids, генерирует для каждой 2 варианта КП:
  A: use_4hods=False (старый свободный промпт)
  B: use_4hods=True,  channel='messenger' (новый каркас «4 хода»)
Кладёт результат в Markdown side-by-side для визуального сравнения.

Запуск на проде:
  docker compose -f docker-compose.prod.yml exec -T backend \\
    python scripts/kp_ab_compare.py > /tmp/kp_ab_report.md

Затем скопировать файл на локалку и закоммитить в docs/.
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

# Позволяет запускать напрямую: python scripts/kp_ab_compare.py.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core.database import async_session_factory  # noqa: E402
from app.models.user import User  # noqa: E402
from app.modules.outreach import kp_service  # noqa: E402
from sqlalchemy import select  # noqa: E402


# Компании для A/B. Отобраны по SQL:
#   стоматология с ≥15 упоминаний автоматизационных болей.
TARGET_COMPANIES = [
    3188,  # Стоматологическая поликлиника №4, Балашиха
    2280,  # Скандинавия, СПб
    2315,  # Одонт, СПб
    2328,  # Стоматология №13, СПб
    2296,  # Клиника СМТ, СПб
]

TEMPLATE_KEY = "webstudio"  # системный шаблон, есть на всех проекте
TONE = "neutral"


async def run_one(db, user_id, company_id, use_4hods, channel):
    """Возвращает (subject, body, arguments_used_dict) или ('ERR', err_msg, {})."""
    try:
        result = await kp_service.generate_kp(
            db,
            user_id=user_id,
            company_id=company_id,
            template_key=TEMPLATE_KEY,
            tone=TONE,
            custom_sender_profile=None,
            pain_tag_ids=None,  # top-1 автоматически
            use_4hods=use_4hods,
            channel=channel,
            my_offer_step=(
                "созвон 10 минут — покажу на их примере как убрать дозвон"
                if use_4hods else None
            ),
        )
        return (
            result.draft_row.subject or "",
            result.draft_row.body or "",
            result.arguments_used,
        )
    except Exception as e:
        return "ERR", f"{type(e).__name__}: {e}", {}


def render_markdown(rows: list[dict]) -> str:
    """rows: list of {company_id, company_name, city, niche, a_*, b_*}."""
    out: list[str] = []
    out.append("# A/B сравнение промпта КП: старый vs «4 хода»\n")
    out.append(f"Всего компаний: **{len(rows)}**  ·  Шаблон: `{TEMPLATE_KEY}`  ·  Тон: `{TONE}`\n")
    out.append("Вариант **A** — свободный промпт (текущий продакшн).\n")
    out.append("Вариант **B** — каркас «4 хода» (мессенджер, «созвон 10 минут»).\n")
    out.append("\n---\n")
    for i, r in enumerate(rows, 1):
        out.append(
            f"\n## {i}. {r['company_name']} · {r['city']}  \n"
            f"`company_id={r['company_id']}` · niche=`{r['niche']}`\n"
        )
        out.append("### A — старый свободный промпт\n")
        out.append(f"**Subject:** {r['a_subject']}\n\n")
        out.append("```\n" + (r['a_body'] or "").strip() + "\n```\n")
        va = r.get("a_validation_summary")
        if va:
            out.append(f"_validation: {va}_\n")
        out.append("\n### B — новый каркас «4 хода» (мессенджер)\n")
        out.append(f"**Subject:** {r['b_subject']!r} (для мессенджера обычно пусто)\n\n")
        out.append("```\n" + (r['b_body'] or "").strip() + "\n```\n")
        vb = r.get("b_validation_summary")
        if vb:
            out.append(f"_validation: {vb}_\n")
        out.append("\n---\n")
    return "\n".join(out)


async def main():
    async with async_session_factory() as db:
        # Первого superuser'а берём как user_id — generate_kp пишет draft
        # от его имени. На проде это Дима.
        user = (await db.execute(
            select(User).where(User.is_superuser.is_(True)).limit(1)
        )).scalar_one_or_none()
        if user is None:
            print("Нет superuser'а — не могу подставить user_id", file=sys.stderr)
            sys.exit(1)
        user_id = user.id

        rows = []
        for cid in TARGET_COMPANIES:
            print(f"[+] company {cid}: A (старый)", file=sys.stderr)
            a_subject, a_body, a_args = await run_one(
                db, user_id, cid, use_4hods=False, channel="email",
            )
            print(f"[+] company {cid}: B (4 хода/мессенджер)", file=sys.stderr)
            b_subject, b_body, b_args = await run_one(
                db, user_id, cid, use_4hods=True, channel="messenger",
            )
            # Тянем company name и nichy отдельным запросом (у нас нет из
            # result.draft_row — там только company_id).
            from app.models.company import Company
            c = await db.get(Company, cid)
            rows.append({
                "company_id": cid,
                "company_name": c.name if c else f"#{cid}",
                "city": c.city if c else "",
                "niche": c.niche if c else "",
                "a_subject": a_subject,
                "a_body": a_body,
                "a_validation_summary": a_args.get("validation_summary"),
                "b_subject": b_subject,
                "b_body": b_body,
                "b_validation_summary": b_args.get("validation_summary"),
            })

        md = render_markdown(rows)
        print(md)


if __name__ == "__main__":
    asyncio.run(main())
