"""Часть 4 ТЗ «автоматизация приёма клиентов» — два файла выгрузки для подрядчиков.

Источник: БД `companies_with_pains` (Company + CompanyPainScore + PainTag +
CompanyContact + CompanyDecisionMaker). Берём ВСЕ компании, у которых есть хотя
бы одна негативная активная боль. Никого не отсеиваем: доминирующая боль даёт
группу оффера — A/B/D1 → ссылка на страницу группы (/razbor/{zvonki,ocheredi,
zakazy}), C/D2 → общий /razbor. Боль, чей ключ словарь не распознал, НЕ режем —
компания уходит в D2 (общий оффер), чтобы в файл попали все компании с болью.

На выходе (папка data/exports/, имена с сегодняшней датой):
  • rassylka_email_YYYY-MM-DD.xlsx    — только валидные email (синтаксис + MX)
  • rassylka_telegram_YYYY-MM-DD.xlsx — TG-контакты с типом (личный/канал/бот)

В каждой строке — ГОТОВЫЙ текст касания под свою боль (каркас «4 хода», без LLM,
детерминированно), с контактами оффера (email: подпись бот+почта+сайт; TG: @бот,
без ссылок). Подрядчик копирует и шлёт, ничего не дописывая.

Сортировка — температура ↓. Убираем сетевых/ведомственных гигантов, компании
без валидного контакта канала и дубли контактов.

Персона «Дмитрий». НИГДЕ не упоминаем SpinLid/Colaba.

Запуск (внутри backend-контейнера, где есть доступ к БД):
    docker exec -w /app colaba-backend-1 python scripts/build_rassylka_exports.py
Флаги:
    --no-mx     пропустить MX-проверку email (быстрее, но останутся мёртвые домены)
    --limit N   ограничить число компаний (для отладки)
    --llm       генерировать тексты через LLM (каркас «4 хода», ProxyAPI) вместо
                детерминированного шаблона. Медленнее и тратит квоту, зато тексты
                различаются между строками одной боли (не спам-шаблон). Если ассистент
                'outreach_draft' не настроен — скрипт падает с понятным сообщением.
                При ошибке генерации конкретной строки — тихий фолбэк на шаблон.
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import re
from contextlib import AsyncExitStack
from datetime import date
from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
from sqlalchemy import select

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.models.company_decision_maker import CompanyDecisionMaker
from app.models.maps import Company, CompanyContact
from app.models.pain_tag import CompanyPainScore, PainTag
from app.modules.maps.contact_validation import is_valid_email
from app.modules.outreach.pain_dictionaries import (
    AUTOMATION,
    landing_slug_for_key,
    match_pain_key,
    offer_group_for_key,
)

logger = logging.getLogger("rassylka_export")


# Контакты оффера резолвим устойчиво: ENV → settings (getattr, без падения на
# отсутствующем поле) → дефолт. Так скрипт работает и против конфигов, где
# offer-поля ещё не заведены.
def _cfg(name: str, default: str = "") -> str:
    import os

    v = os.environ.get(name)
    if v:
        return v
    v = getattr(settings, name, None)
    return str(v) if v else default


def _cfg_bot() -> str:
    """Username бота-приёмника (без @). Deep-link ?start=<группа>_<id> и контакт
    в TG-текстах ведут именно на него — лид входит в бота с известной компанией."""
    return _cfg("PUBLIC_BOT_USERNAME", "bolshe_lidov_bot")


def _cfg_contact_tg() -> str:
    """Личный TG-контакт Дмитрия для холодных касаний (не бот)."""
    return _cfg("PUBLIC_CONTACT_TG", "Demetrio19")


def _cfg_landing() -> str:
    return _cfg("PUBLIC_LANDING_URL", "https://spinlid.ru/razbor")


def _cfg_email() -> str:
    return _cfg("PUBLIC_CONTACT_EMAIL", "dmitry@spinlid-team.ru")

# ── Какие боли берём в выгрузку ───────────────────────────────────────────────
# ТЗ 2026-09-07: НЕ отсеиваем по группам — в файл попадают все распознанные боли
# (любой pain_key из справочника → одна из 5 групп A/B/C/D1/D2). Раньше брали
# только automation-семейство (A/B/D1); теперь C (персонал) и D2 (прочее) тоже
# входят, со ссылкой на общий /razbor и deep-link start=general_<id>.
# Отсекаем лишь теги, для которых match_pain_key вернул None (боль вообще не про
# оффер — грязь в помещении, качество услуг и т.п.): по ним нечего предложить.

# Темы письма под каждый pain_key (сжатый ход 1).
_SUBJECTS: dict[str, str] = {
    "call_no_answer": "Пропущенные звонки в «{name}»",
    "callback_lost": "Потерянные заявки в «{name}»",
    "chat_no_response": "Сообщения клиентов «{name}» без ответа",
    "schedule_hard": "Запись клиентов в «{name}»",
    "schedule_wait": "Долгое ожидание записи в «{name}»",
    "order_online_hard": "Оформление заказа на сайте «{name}»",
    "order_wait": "«Где мой заказ?» — сроки в «{name}»",
    "queue_wait": "Очереди и ожидание в «{name}»",
}

# ── Сетевые/ведомственные гиганты — фильтруем по имени (best-effort) ─────────
# Цель: не слать холодную рассылку в банки/операторов/федеральные сети/госорганы,
# где нет «владельца», который откликнется. Матчим по нижнему регистру подстрокой.
GIANT_STOPWORDS: tuple[str, ...] = (
    # банки / финтех
    "сбербанк", "сбер", "втб", "альфа-банк", "тинькофф", "т-банк", "росбанк",
    "газпромбанк", "райффайзен", "открытие банк", "совкомбанк", "почта банк",
    # мобильные операторы / телеком
    "мтс", "билайн", "мегафон", "теле2", "tele2", "ростелеком", "yota", "йота",
    # федеральный ретейл / маркетплейсы
    "пятёрочка", "пятерочка", "магнит", "перекрёсток", "перекресток", "дикси",
    "лента", "ашан", "auchan", "метро cash", "окей ", "вкусвилл", "wildberries",
    "вайлдберриз", "озон", "ozon", "яндекс маркет", "яндекс.маркет", "днс ",
    "эльдорадо", "м.видео", "мвидео", "leroy", "леруа", "спортмастер",
    # госорганы / ведомства
    "мфц", "гбуз", "гауз", "фгбу", "фку", "мвд", "администрация", "департамент",
    "министерств", "росреестр", "пенсионный фонд", "налоговая", "фнс ",
    "почта россии", "ржд", "аэрофлот",
)

_MENT = re.compile(r"\s*\((\d+)\)\s*$")


def _is_giant(name: str | None) -> bool:
    low = (name or "").lower()
    return any(w in low for w in GIANT_STOPWORDS)


def _clip(s: str | None, n: int) -> str:
    s = (s or "").strip().replace("\n", " ")
    return s if len(s) <= n else s[: n - 1] + "…"


def _tg_type(value: str) -> str:
    """Грубая классификация TG-контакта: личный / канал / бот."""
    v = (value or "").strip().lower()
    handle = v.rsplit("/", 1)[-1].lstrip("@")
    if handle.endswith("bot"):
        return "бот"
    # инвайт-ссылки закрытых каналов/групп и служебные пути → канал/группа
    if "/+" in v or "joinchat" in v or "/c/" in v:
        return "канал"
    return "личный"


# ── Готовые тексты касания (каркас «4 хода», детерминированно, без LLM) ───────


def _landing_link(company_id: int, key: str | None) -> str:
    """Персональная ссылка на лендинг под группу боли: для A/B/D1 — страница
    группы (/razbor/<slug>), для C/D2 — общий /razbor. С ?c=<id>&utm_source=email."""
    base = _cfg_landing().strip().rstrip("/") or "[сайт_не_задан]"
    if base == "[сайт_не_задан]":
        return base
    slug = landing_slug_for_key(key)
    url = f"{base}/{slug}" if slug else base
    return f"{url}?c={company_id}&utm_source=email"


def _bot_deeplink(company_id: int, key: str | None) -> str:
    """Deep-link в бота: t.me/<bot>?start=<группа>_<id>. Для A/B/D1 группа=slug
    страницы (zvonki/ocheredi/zakazy), для C/D2 группа='general' (отдельной
    страницы нет, но бот всё равно узнаёт компанию по id и даёт персональный
    разбор)."""
    bot = _cfg_bot().lstrip("@").strip() or "[бот_не_задан]"
    if bot == "[бот_не_задан]":
        return bot
    group = landing_slug_for_key(key) or "general"
    return f"https://t.me/{bot}?start={group}_{company_id}"


def _contact_block_email(company_id: int, key: str | None) -> list[str]:
    """Подпись email с персональными ссылками под компанию/группу боли."""
    email = _cfg_email().strip() or "[email_не_задан]"
    return [
        "—",
        "Дмитрий",
        f"Разбор по вашей компании: {_landing_link(company_id, key)}",
        f"Или сразу в Telegram: {_bot_deeplink(company_id, key)}",
        f"Почта: {email}",
    ]


def _bot_handle() -> str:
    """Контакт для TG-текста — username бота-приёмника (не личный контакт),
    чтобы лид входил в бота. Без ссылок (ТЗ), просто @username."""
    handle = _cfg_bot().lstrip("@").strip()
    return f"@{handle}" if handle else "[контакт_не_задан]"


def build_email_text(
    name: str, key: str | None, quote: str | None, pain_label: str, company_id: int
) -> tuple[str, str]:
    """(subject, body) для email-варианта. Подпись с персональными ссылками."""
    subj = (_SUBJECTS.get(key or "") or "Про клиентов, которые не дошли до «{name}»").format(name=name)
    cons = AUTOMATION.consequence.get(key) if key else None
    sol = AUTOMATION.solution.get(key) if key else None
    if quote:
        opener = f"Здравствуйте! Смотрел отзывы о «{name}» — клиент пишет: «{_clip(quote, 280)}»."
    else:
        opener = f"Здравствуйте! Смотрел отзывы о «{name}» и вижу повторяющуюся проблему: {pain_label.lower()}."
    lines = [opener]
    if cons:
        lines.append(f"{cons.capitalize()}.")
    if sol:
        lines.append(f"Обычно помогает вот что: {sol}.")
    lines.append("Могу за 5 минут показать на вашем примере, как это выглядит, — когда удобно ответить?")
    lines.append("")
    lines.extend(_contact_block_email(company_id, key))
    return subj, "\n".join(lines)


def build_tg_text(name: str, key: str | None, quote: str | None, pain_label: str) -> str:
    """TG-вариант: 4-6 строк, БЕЗ ссылок, контакт = @бот, один вопрос."""
    cons = AUTOMATION.consequence.get(key) if key else None
    sol = AUTOMATION.solution.get(key) if key else None
    if quote:
        opener = f"Здравствуйте! Смотрел отзывы о «{name}» — клиент пишет: «{_clip(quote, 200)}»."
    else:
        opener = f"Здравствуйте! Смотрел отзывы о «{name}»: повторяется проблема — {pain_label.lower()}."
    lines = [opener]
    if cons:
        lines.append(f"{cons.capitalize()}.")
    if sol:
        lines.append(f"Обычно помогает так: {sol}.")
    lines.append(
        f"Могу показать на вашем примере — ответить можно здесь или в Telegram {_bot_handle()}. Когда удобно?"
    )
    return "\n".join(lines)


# ── LLM-генерация (опция --llm): каркас «4 хода» через ProxyAPI ───────────────
# Персона «Дмитрий», НИГДЕ не упоминаем SpinLid/Colaba. sender_profile и
# my_offer_step держим здесь, чтобы LLM-ветка и её фолбэк были согласованы
# с детерминированным вариантом (тот же микрошаг «покажу на вашем примере»).

_SENDER_PROFILE = (
    "Дмитрий — помогаю локальному бизнесу не терять клиентов на этапе обращения: "
    "звонки, заявки, запись, сообщения в чатах. Пишу точечно под конкретную боль."
)
_OFFER_STEP = "за 5 минут покажу на вашем примере, как это выглядит"


async def _gen_llm(db, assistant_id: int, channel: str, company, d: dict, dms: dict) -> tuple[str, str]:
    """(subject, body) через LLM-каркас «4 хода». channel: 'email'|'messenger'.

    Собирает те же данные, что и детерминированный билдер (боли+счётчики+лучшая
    цитата, привязанная к доминирующей боли), но текст пишет модель — поэтому
    строки одной боли различаются. Бросает исключение при сбое LLM — вызывающий
    ловит и падает на шаблон.
    """
    from app.modules.outreach.kp_prompts_v2 import build_prompt_4hods
    from app.modules.outreach.kp_service import _call_llm_with_retry
    from app.modules.outreach.pain_dictionaries import fill_pains

    dom = _dominant(d)
    best_quote = d["best"][0] if d["best"] else None
    pains_dicts: list[dict] = []
    attached = False
    for lbl, m in sorted(d["pains"], key=lambda x: -x[1]):
        pd = {"label": lbl, "mention_count": m, "top_quote": None, "source": None, "pain_tag_id": None}
        if not attached and best_quote and match_pain_key(lbl) == dom:
            pd["top_quote"] = best_quote
            attached = True
        pains_dicts.append(pd)
    if best_quote and not attached and pains_dicts:
        pains_dicts[0]["top_quote"] = best_quote

    filled = fill_pains(pains_dicts, offer_theme="automation")
    dm = dms.get(company.id)
    first = None
    if dm and dm.name and dm.name.strip():
        first = dm.name.strip().split()[0]

    prompt = build_prompt_4hods(
        channel=channel,
        sender_profile=_SENDER_PROFILE,
        company_name=company.name or "",
        niche=company.niche or "",
        city=company.city or "",
        pains=filled,
        my_offer_step=_OFFER_STEP,
        tone="neutral",
        recipient_first_name=first,
        bot_username=_cfg_contact_tg(),
        contact_email=_cfg_email(),
        landing_url=_cfg_landing(),
    )
    parsed = await _call_llm_with_retry(db, assistant_id, prompt)
    return (parsed.get("subject") or "").strip(), (parsed.get("body") or "").strip()


# ── Загрузка из БД ───────────────────────────────────────────────────────────


async def load() -> tuple[dict, dict, dict, dict]:
    """per_company (боли/цитата/dominant key), companies, contacts, dms."""
    async with AsyncSessionLocal() as db:
        tag_rows = (
            await db.execute(
                select(PainTag.id, PainTag.label).where(
                    PainTag.status == "active", PainTag.sentiment == "negative"
                )
            )
        ).all()
        tag_label = {tid: label for tid, label in tag_rows}
        tag_key = {tid: match_pain_key(label) for tid, label in tag_rows}
        # ТЗ 2026-09-06: в файл попадают ВСЕ компании с болью. Тег без ключа
        # (match_pain_key → None) НЕ отсеиваем — компания просто уходит в
        # группу D2 (общий /razbor, общий оффер без ХОД2/ХОД3). Ключ лишь
        # уточняет группу (A/B/C/D1). Раньше фильтр `k is not None` резал ~6× —
        # выпадали все компании, чью доминирующую боль словарь не распознал.
        tag_ids = list(tag_label)
        if not tag_ids:
            return {}, {}, {}, {}

        cps_rows = (
            await db.execute(
                select(
                    CompanyPainScore.company_id,
                    CompanyPainScore.pain_tag_id,
                    CompanyPainScore.mention_count,
                    CompanyPainScore.top_quote,
                    CompanyPainScore.top_quote_similarity,
                ).where(CompanyPainScore.pain_tag_id.in_(tag_ids))
            )
        ).all()

        per_company: dict[int, dict] = {}
        for cid, tid, mentions, quote, sim in cps_rows:
            d = per_company.setdefault(cid, {"pains": [], "mentions": 0, "best": None, "keycount": {}})
            key = tag_key.get(tid)
            m = int(mentions or 0)
            d["pains"].append((tag_label[tid], m))
            d["mentions"] += m
            if key:
                d["keycount"][key] = d["keycount"].get(key, 0) + m
            simf = float(sim or 0)
            if quote and (d["best"] is None or simf > d["best"][1]):
                d["best"] = (quote, simf)

        ids = list(per_company)
        companies = {
            c.id: c for c in (await db.execute(select(Company).where(Company.id.in_(ids)))).scalars()
        }
        contacts: dict[int, list[CompanyContact]] = {}
        for cc in (
            await db.execute(select(CompanyContact).where(CompanyContact.company_id.in_(ids)))
        ).scalars():
            contacts.setdefault(cc.company_id, []).append(cc)
        dms: dict[int, CompanyDecisionMaker] = {}
        for dm in (
            await db.execute(
                select(CompanyDecisionMaker).where(
                    CompanyDecisionMaker.company_id.in_(ids),
                    CompanyDecisionMaker.is_marketing_dm.is_(True),
                )
            )
        ).scalars():
            dms.setdefault(dm.company_id, dm)

    return per_company, companies, contacts, dms


def _channel_values(cid: int, kind: str, companies: dict, contacts: dict) -> list[str]:
    """Уникальные значения канала (kind ∈ {email, telegram})."""
    out, seen = [], set()
    for cc in contacts.get(cid, []):
        if cc.type == kind and cc.value and cc.value not in seen:
            seen.add(cc.value)
            out.append(cc.value)
    c = companies[cid]
    if kind == "email":
        for e in c.emails or []:
            if e and e not in seen:
                seen.add(e)
                out.append(e)
    else:
        for v in (c.contacts_extra or {}).get("telegrams", []) or []:
            if v and v not in seen:
                seen.add(v)
                out.append(v)
    return out


def _dominant(d: dict) -> str | None:
    return max(d["keycount"], key=d["keycount"].get) if d["keycount"] else None


def _pains_txt(d: dict) -> str:
    return "; ".join(f"{lbl} ({m})" for lbl, m in sorted(d["pains"], key=lambda x: -x[1]))


def _dm_name(dms: dict, cid: int) -> str:
    dm = dms.get(cid)
    return (dm.name or "").strip() if dm else ""


# ── Запись xlsx ──────────────────────────────────────────────────────────────

_HFONT = Font(bold=True, color="FFFFFF")
_HFILL = PatternFill("solid", fgColor="1E3A5F")


def _write_xlsx(path: Path, title: str, columns: list[tuple[str, int, str]], rows: list[dict], wrap: set[str]) -> None:
    wb = Workbook()
    ws = wb.active
    ws.title = "Рассылка"
    ws.append([f"{title} · компаний: {len(rows)}"])
    ws.append([])
    hidx = ws.max_row + 1
    ws.append([c[0] for c in columns])
    for i, (_t, w, _k) in enumerate(columns, start=1):
        cell = ws.cell(row=hidx, column=i)
        cell.font = _HFONT
        cell.fill = _HFILL
        cell.alignment = Alignment(vertical="center")
        ws.column_dimensions[get_column_letter(i)].width = w
    for r in rows:
        ws.append([r.get(k) for _t, _w, k in columns])
        rr = ws.max_row
        for i, (t, _w, _k) in enumerate(columns, start=1):
            if t in wrap:
                ws.cell(row=rr, column=i).alignment = Alignment(wrap_text=True, vertical="top")
    ws.freeze_panes = ws.cell(row=hidx + 1, column=1)
    wb.save(path)


_EMAIL_COLS = [
    ("Название", 32, "name"),
    ("Ниша", 20, "niche"),
    ("Город", 15, "city"),
    ("Рейтинг", 8, "rating"),
    ("Отзывов", 8, "reviews"),
    ("Негатив", 8, "neg"),
    ("Температура", 11, "temp"),
    ("Группа", 8, "group"),
    ("Боли (с счётчиками)", 42, "pains"),
    ("Цитата (коротко)", 50, "quote"),
    ("Email", 30, "contact"),
    ("Имя ЛПР", 20, "dm"),
    ("Тема письма", 34, "subject"),
    ("Текст письма (готовый)", 80, "body"),
    ("Статус", 11, "_st"),
    ("Дата отправки", 13, "_dt"),
    ("Ответил", 9, "_rep"),
    ("Заявка", 9, "_deal"),
    ("Комментарий", 24, "_cmt"),
]
_EMAIL_WRAP = {"Боли (с счётчиками)", "Цитата (коротко)", "Текст письма (готовый)"}

_TG_COLS = [
    ("Название", 32, "name"),
    ("Ниша", 20, "niche"),
    ("Город", 15, "city"),
    ("Рейтинг", 8, "rating"),
    ("Отзывов", 8, "reviews"),
    ("Негатив", 8, "neg"),
    ("Температура", 11, "temp"),
    ("Группа", 8, "group"),
    ("Боли", 42, "pains"),
    ("Цитата (коротко)", 50, "quote"),
    ("Telegram (@username / ссылка)", 28, "contact"),
    ("Тип (личный/канал/бот)", 16, "tg_type"),
    ("Текст сообщения (готовый, без ссылок)", 70, "body"),
    ("Статус", 11, "_st"),
    ("Дата отправки", 13, "_dt"),
    ("Ответил", 9, "_rep"),
    ("Заявка", 9, "_deal"),
    ("Комментарий", 24, "_cmt"),
]
_TG_WRAP = {"Боли", "Цитата (коротко)", "Текст сообщения (готовый, без ссылок)"}


def _base(cid: int, d: dict, companies: dict, dms: dict) -> dict:
    c = companies[cid]
    return {
        "name": c.name,
        "niche": c.niche,
        "city": c.city,
        "rating": float(c.rating) if c.rating is not None else None,
        "reviews": c.reviews_count,
        "neg": c.reviews_negative_count,
        "temp": c.lead_temperature,
        "group": offer_group_for_key(_dominant(d)),
        "pains": _pains_txt(d),
        "quote": _clip(d["best"][0] if d["best"] else None, 300),
        "dm": _dm_name(dms, cid),
    }


async def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    parser = argparse.ArgumentParser()
    parser.add_argument("--no-mx", action="store_true", help="не проверять MX email")
    parser.add_argument("--limit", type=int, default=0, help="ограничить число компаний")
    parser.add_argument(
        "--llm",
        action="store_true",
        help="генерировать тексты через LLM (разнообразие вместо шаблона)",
    )
    parser.add_argument(
        "--date",
        default="",
        help="дата в имени файлов (YYYY-MM-DD); по умолчанию сегодня",
    )
    args = parser.parse_args()

    if not _cfg_bot():
        logger.warning(
            "PUBLIC_BOT_USERNAME не задан — в deep-link и TG-текстах уйдёт плейсхолдер "
            "вместо @бота. Задай его в .env перед боевой выгрузкой."
        )

    out_dir = Path(__file__).resolve().parents[1] / "data" / "exports"
    out_dir.mkdir(parents=True, exist_ok=True)
    stamp = args.date.strip() or date.today().isoformat()

    per_company, companies, contacts, dms = await load()
    logger.info("[rassylka] компаний с распознанными болями: %d", len(companies))
    if not companies:
        logger.warning("[rassylka] нет компаний с распознанными болями — файлы не создаём.")
        return

    # Сорт компаний: температура ↓ (None в конец).
    order = sorted(
        companies.keys(),
        key=lambda cid: (companies[cid].lead_temperature or -1),
        reverse=True,
    )
    if args.limit:
        order = order[: args.limit]

    stats = {
        "giants": 0, "no_email": 0, "bad_email": 0, "no_tg": 0, "dup_email": 0,
        "llm_fail_email": 0, "llm_fail_tg": 0,
    }

    # LLM-режим: заранее резолвим ассистента, чтобы не гнать 5000 строк и упасть
    # на первой. Нет ассистента → падаем сразу с понятным сообщением.
    assistant_id: int | None = None
    if args.llm:
        from app.modules.reviews_ai.llm import pick_assistant_id
        async with AsyncSessionLocal() as _probe_db:
            assistant_id = await pick_assistant_id(_probe_db, "outreach_draft")
        if assistant_id is None:
            raise SystemExit(
                "--llm: LLM-ассистент 'outreach_draft' не настроен (проверь "
                "OPENAI_API_KEY / OPENAI_BASE_URL и наличие ассистента "
                "'reviews_ai_outreach_draft'). Убери --llm или настрой ключ."
            )
        logger.info(
            "[rassylka] LLM-режим: тексты пишет модель (медленнее, тратит квоту ProxyAPI). "
            "При сбое строки — фолбэк на шаблон."
        )

    email_rows: list[dict] = []
    tg_rows: list[dict] = []
    # Одна сессия на всю LLM-генерацию (открываем только при --llm).
    async with AsyncExitStack() as stack:
        gen_db = await stack.enter_async_context(AsyncSessionLocal()) if args.llm else None

        # ── Email ──────────────────────────────────────────────────────────────
        seen_emails: set[str] = set()
        for cid in order:
            c = companies[cid]
            if _is_giant(c.name):
                stats["giants"] += 1
                continue
            d = per_company[cid]
            vals = _channel_values(cid, "email", companies, contacts)
            if not vals:
                stats["no_email"] += 1
                continue
            valid_email = None
            for e in vals:
                ok, _reason, norm = is_valid_email(e, check_mx=not args.no_mx)
                if ok:
                    valid_email = norm or e
                    break
            if not valid_email:
                stats["bad_email"] += 1
                continue
            if valid_email.lower() in seen_emails:
                stats["dup_email"] += 1
                continue
            seen_emails.add(valid_email.lower())
            key = _dominant(d)
            best_q = d["best"][0] if d["best"] else None
            if args.llm:
                try:
                    subj, body = await _gen_llm(gen_db, assistant_id, "email", c, d, dms)
                    if not subj:  # email обязан иметь тему — фолбэк на детерм. тему
                        subj = (_SUBJECTS.get(key or "") or "Про клиентов, которые не дошли до «{name}»").format(name=c.name)
                    if not body:
                        raise ValueError("пустое body от LLM")
                except Exception as e:  # noqa: BLE001
                    stats["llm_fail_email"] += 1
                    logger.warning("[rassylka] LLM email fail (%s): %s — фолбэк на шаблон", c.name, e)
                    subj, body = build_email_text(c.name, key, best_q, d["pains"][0][0], cid)
            else:
                subj, body = build_email_text(c.name, key, best_q, d["pains"][0][0], cid)
            rec = _base(cid, d, companies, dms)
            rec.update({"contact": valid_email, "subject": subj, "body": body})
            email_rows.append(rec)

        # ── Telegram ─────────────────────────────────────────────────────────────
        seen_tg: set[str] = set()
        for cid in order:
            c = companies[cid]
            if _is_giant(c.name):
                continue  # уже посчитан в email-проходе
            d = per_company[cid]
            vals = _channel_values(cid, "telegram", companies, contacts)
            if not vals:
                stats["no_tg"] += 1
                continue
            tg_val = vals[0]
            if tg_val.lower() in seen_tg:
                continue
            seen_tg.add(tg_val.lower())
            key = _dominant(d)
            best_q = d["best"][0] if d["best"] else None
            if args.llm:
                try:
                    _subj, body = await _gen_llm(gen_db, assistant_id, "messenger", c, d, dms)
                    if not body:
                        raise ValueError("пустое body от LLM")
                except Exception as e:  # noqa: BLE001
                    stats["llm_fail_tg"] += 1
                    logger.warning("[rassylka] LLM tg fail (%s): %s — фолбэк на шаблон", c.name, e)
                    body = build_tg_text(c.name, key, best_q, d["pains"][0][0])
            else:
                body = build_tg_text(c.name, key, best_q, d["pains"][0][0])
            rec = _base(cid, d, companies, dms)
            rec.update({"contact": tg_val, "tg_type": _tg_type(tg_val), "body": body})
            tg_rows.append(rec)

    # Guardrail: при LLM-режиме не льём полушаблонную выгрузку, если модель
    # сбоила слишком часто. Порог 20% — по требованию Димы (2026-09-01).
    if args.llm:
        _MAX_FALLBACK_PCT = 20.0
        e_fb = 100.0 * stats["llm_fail_email"] / len(email_rows) if email_rows else 0.0
        t_fb = 100.0 * stats["llm_fail_tg"] / len(tg_rows) if tg_rows else 0.0
        logger.info(
            "[rassylka] LLM-фолбэков: email=%d/%d (%.1f%%), telegram=%d/%d (%.1f%%)",
            stats["llm_fail_email"], len(email_rows), e_fb,
            stats["llm_fail_tg"], len(tg_rows), t_fb,
        )
        if e_fb > _MAX_FALLBACK_PCT or t_fb > _MAX_FALLBACK_PCT:
            raise SystemExit(
                f"--llm: доля фолбэков на шаблон превысила {_MAX_FALLBACK_PCT:.0f}% "
                f"(email {e_fb:.1f}%, telegram {t_fb:.1f}%). Файлы НЕ записаны. "
                "Разберись с ассистентом 'outreach_draft' (ключ/квота/модель) и перезапусти."
            )

    email_path = out_dir / f"rassylka_email_{stamp}.xlsx"
    _write_xlsx(email_path, "AI-автоматизация приёма клиентов · email", _EMAIL_COLS, email_rows, _EMAIL_WRAP)
    tg_path = out_dir / f"rassylka_telegram_{stamp}.xlsx"
    _write_xlsx(tg_path, "AI-автоматизация приёма клиентов · Telegram", _TG_COLS, tg_rows, _TG_WRAP)

    # ── Отчёт ──────────────────────────────────────────────────────────────────
    logger.info("[rassylka] режим текста: %s", "LLM (4 хода)" if args.llm else "детерминированный шаблон")
    logger.info("[rassylka] email    : %5d строк -> %s", len(email_rows), email_path)
    logger.info("[rassylka] telegram : %5d строк -> %s", len(tg_rows), tg_path)
    logger.info(
        "[rassylka] отсеяно: гиганты=%d, без_email=%d, невалид_email=%d, дубль_email=%d, без_tg=%d",
        stats["giants"], stats["no_email"], stats["bad_email"], stats["dup_email"], stats["no_tg"],
    )

    # Разбивка по группам: сколько строк получили ссылку на страницу группы
    # (A/B/D1) против общего /razbor (C/D2). ТЗ «НА ВЫХОДЕ».
    def _group_report(label: str, rows: list[dict]) -> None:
        by_group: dict[str, int] = {}
        for r in rows:
            by_group[r.get("group") or "?"] = by_group.get(r.get("group") or "?", 0) + 1
        grouped = sum(v for g, v in by_group.items() if g in ("A", "B", "D1"))
        general = len(rows) - grouped
        detail = ", ".join(f"{g}={by_group[g]}" for g in sorted(by_group))
        logger.info(
            "[rassylka] %s: групповая ссылка (A/B/D1)=%d, общая /razbor (C/D2)=%d | по группам: %s",
            label, grouped, general, detail,
        )

    _group_report("email   ", email_rows)
    _group_report("telegram", tg_rows)
    # 5 примеров текстов для проверки глазами (ТЗ «НА ВЫХОДЕ»).
    logger.info("\n[rassylka] === 5 примеров EMAIL-текстов ===")
    for r in email_rows[:5]:
        logger.info("--- %s (%s, %s) t=%s ---\nТема: %s\n%s\n", r["name"], r["niche"], r["city"], r["temp"], r["subject"], r["body"])
    logger.info("\n[rassylka] === 5 примеров TG-текстов ===")
    for r in tg_rows[:5]:
        logger.info("--- %s (%s, %s) t=%s [%s] ---\n%s\n", r["name"], r["niche"], r["city"], r["temp"], r["tg_type"], r["body"])


if __name__ == "__main__":
    asyncio.run(main())
