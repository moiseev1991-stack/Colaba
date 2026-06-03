"""Phase 2 ТЗ multi-source-companies: дедуп существующих 2gis + yandex_maps пар.

После Phase 1 каждой companies-записи соответствует ровно один company_sources.
Но одна и та же реальная компания (например, «Глобал Дент») может присутствовать
дважды — как companies(source='2gis') и как companies(source='yandex_maps'). Эта
скрипт находит такие пары и склеивает: один из company_sources переподцепляется
к другому company_id, дубликат companies-запись удаляется.

Якоря матчинга (от сильного к слабому):
  1. Нормализованный телефон совпадает И тот же город → confidence 0.95.
  2. Координаты в радиусе 100м И name similarity ≥ 0.7 → confidence 0.85.
  3. Тот же город И name similarity ≥ 0.85 → confidence 0.7.

Высокий threshold для apply — 0.85. Ниже — в отчёт «требует ручной проверки».

Что переподвязывается на master.company_id:
  - company_sources.company_id (дубликат-source становится вторым профилем master)
  - company_contacts.company_id (контакты сохраняются как есть, не схлопываются)
  - reviews.company_id

Master выбирается по приоритету:
  1. У кого больше отзывов (rich data)
  2. При равенстве — 2GIS (Catalog API обычно богаче)
  3. При равенстве — меньший id (раньше создан)

Использование:
  python -m scripts.dedup_multisource_phase2 --dry-run        # отчёт без изменений
  python -m scripts.dedup_multisource_phase2 --apply          # применить
  python -m scripts.dedup_multisource_phase2 --apply --min-confidence 0.9  # строже
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import math
import re
import sys
from dataclasses import dataclass, field
from typing import Iterable

from sqlalchemy import text

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("dedup_phase2")


# ---------------------------------------------------------------------------
# Нормализация
# ---------------------------------------------------------------------------


_NAME_NOISE_RE = re.compile(
    r"\b(ооо|ао|зао|пао|нко|ип|ан|клиника|компания|center|центр|company|llc|inc|ltd)\b",
    re.IGNORECASE,
)
_NAME_NON_ALNUM_RE = re.compile(r"[^\w\s]+", re.UNICODE)


def _norm_name(name: str | None) -> str:
    if not name:
        return ""
    s = name.lower().strip()
    s = _NAME_NOISE_RE.sub(" ", s)
    s = _NAME_NON_ALNUM_RE.sub(" ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def _norm_phone(phone: str | None) -> str | None:
    if not phone:
        return None
    digits = re.sub(r"\D", "", phone)
    if not digits:
        return None
    if len(digits) == 10:
        return "+7" + digits
    if len(digits) == 11 and digits.startswith("8"):
        return "+7" + digits[1:]
    if len(digits) == 11 and digits.startswith("7"):
        return "+" + digits
    return "+" + digits if len(digits) >= 10 else None


def _haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Расстояние в метрах между точками."""
    R = 6_371_000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


def _name_similarity(a: str, b: str) -> float:
    """0.0..1.0 фуззи-сравнение нормализованных имён."""
    from difflib import SequenceMatcher
    if not a or not b:
        return 0.0
    return SequenceMatcher(None, a, b).ratio()


# ---------------------------------------------------------------------------
# Загрузка компаний
# ---------------------------------------------------------------------------


@dataclass
class Cand:
    id: int
    source: str
    name: str
    norm_name: str
    city: str | None
    lat: float | None
    lng: float | None
    phones: set[str] = field(default_factory=set)
    reviews_count: int = 0


async def _load(db, source: str) -> list[Cand]:
    """Все компании одного source + их нормализованные телефоны (из companies.phone
    + company_contacts.type='phone')."""
    rows = (await db.execute(text(
        """
        SELECT
            c.id, c.source, c.name, c.city, c.lat, c.lng, c.phone AS main_phone,
            COALESCE(c.reviews_count, 0) AS reviews_count,
            (SELECT array_agg(cc.value)
             FROM company_contacts cc
             WHERE cc.company_id = c.id AND cc.type = 'phone') AS extra_phones
        FROM companies c
        WHERE c.source = :src
        """
    ), {"src": source})).mappings().all()

    out: list[Cand] = []
    for r in rows:
        phones: set[str] = set()
        if r["main_phone"]:
            np = _norm_phone(r["main_phone"])
            if np:
                phones.add(np)
        for p in (r["extra_phones"] or []):
            np = _norm_phone(p)
            if np:
                phones.add(np)
        out.append(Cand(
            id=int(r["id"]),
            source=str(r["source"]),
            name=str(r["name"]) if r["name"] else "",
            norm_name=_norm_name(r["name"]),
            city=str(r["city"]).lower().strip() if r["city"] else None,
            lat=float(r["lat"]) if r["lat"] is not None else None,
            lng=float(r["lng"]) if r["lng"] is not None else None,
            phones=phones,
            reviews_count=int(r["reviews_count"]),
        ))
    return out


# ---------------------------------------------------------------------------
# Матчинг
# ---------------------------------------------------------------------------


@dataclass
class Match:
    primary_id: int        # master, остаётся
    duplicate_id: int      # дубликат, его company_sources переедет на primary
    confidence: float
    matched_by: str
    note: str


def _pick_master(a: Cand, b: Cand) -> tuple[Cand, Cand]:
    """(master, duplicate) — master сохраняется, duplicate удаляется.

    Приоритет:
      1. Больше отзывов
      2. source='2gis' (Catalog API богаче)
      3. Меньший id (раньше создан)
    """
    if a.reviews_count != b.reviews_count:
        return (a, b) if a.reviews_count > b.reviews_count else (b, a)
    if a.source != b.source:
        return (a, b) if a.source == "2gis" else (b, a)
    return (a, b) if a.id < b.id else (b, a)


@dataclass
class _Candidate:
    """Сырой кандидат матча — пара (tg, y) с метриками, до выбора лучшего."""
    tg: Cand
    y: Cand
    confidence: float
    matched_by: str
    note: str


def _find_matches(twogis: list[Cand], yandex: list[Cand]) -> list[Match]:
    """Для каждой пары (2gis, yandex_maps) выбирает лучший якорь, потом разрешает
    конфликты (один yandex может матчиться только к одному 2gis и наоборот) жадно
    по убыванию confidence.
    """
    # Индекс yandex по телефону и городу для быстрого поиска
    y_by_phone: dict[str, list[Cand]] = {}
    for y in yandex:
        for p in y.phones:
            y_by_phone.setdefault(p, []).append(y)
    y_by_city: dict[str, list[Cand]] = {}
    for y in yandex:
        if y.city:
            y_by_city.setdefault(y.city, []).append(y)

    # Лучший якорь для каждой пары (tg.id, y.id)
    best_per_pair: dict[tuple[int, int], _Candidate] = {}

    def consider(tg: Cand, y: Cand, conf: float, by: str, note: str) -> None:
        key = (tg.id, y.id)
        prev = best_per_pair.get(key)
        if prev is None or conf > prev.confidence:
            best_per_pair[key] = _Candidate(tg=tg, y=y, confidence=conf, matched_by=by, note=note)

    for tg in twogis:
        # 1. По нормализованному телефону + город (если оба заданы)
        for p in tg.phones:
            for y in y_by_phone.get(p, []):
                if tg.city and y.city and tg.city != y.city:
                    continue
                consider(tg, y, 0.95, "phone", f"phone {p}")

        # 2. По координатам ≤100м + name similarity ≥0.7
        if tg.lat is not None and tg.lng is not None and tg.city:
            for y in y_by_city.get(tg.city, []):
                if y.lat is None or y.lng is None:
                    continue
                dist = _haversine_m(tg.lat, tg.lng, y.lat, y.lng)
                if dist > 100:
                    continue
                sim = _name_similarity(tg.norm_name, y.norm_name)
                if sim < 0.7:
                    continue
                consider(tg, y, 0.85, "coords+name", f"dist={dist:.0f}m sim={sim:.2f}")

        # 3. По имени + город (без требования к координатам) — слабее
        if tg.city and tg.norm_name:
            for y in y_by_city.get(tg.city, []):
                sim = _name_similarity(tg.norm_name, y.norm_name)
                if sim < 0.85:
                    continue
                consider(tg, y, 0.70, "name+city", f"sim={sim:.2f}")

    # Разрешаем конфликты жадно: сильнейшие пары первыми; каждый tg / y привязывается
    # максимум к одному партнёру.
    sorted_cands = sorted(best_per_pair.values(), key=lambda c: -c.confidence)
    used_tg: set[int] = set()
    used_y: set[int] = set()
    out: list[Match] = []
    for c in sorted_cands:
        if c.tg.id in used_tg or c.y.id in used_y:
            continue
        used_tg.add(c.tg.id)
        used_y.add(c.y.id)
        master, dup = _pick_master(c.tg, c.y)
        out.append(Match(
            primary_id=master.id,
            duplicate_id=dup.id,
            confidence=c.confidence,
            matched_by=c.matched_by,
            note=c.note,
        ))
    return out


# ---------------------------------------------------------------------------
# Применение матчей (UPDATE + DELETE)
# ---------------------------------------------------------------------------


async def _apply_match(db, m: Match) -> None:
    """Перепривязать дубликат к master + удалить дубликат-companies запись."""
    # company_sources дубликата → к master
    await db.execute(text(
        "UPDATE company_sources SET company_id = :master, "
        "match_confidence = :conf, matched_by = :by "
        "WHERE company_id = :dup"
    ), {"master": m.primary_id, "dup": m.duplicate_id, "conf": m.confidence, "by": m.matched_by})
    # company_contacts.company_id → master (source не трогаем — он остаётся источниковым)
    await db.execute(text(
        "UPDATE company_contacts SET company_id = :master WHERE company_id = :dup"
    ), {"master": m.primary_id, "dup": m.duplicate_id})
    # reviews.company_id → master (company_source_id остаётся таким же)
    await db.execute(text(
        "UPDATE reviews SET company_id = :master WHERE company_id = :dup"
    ), {"master": m.primary_id, "dup": m.duplicate_id})
    # Удалить дубликат companies (CASCADE его не должен затронуть, потому что
    # все FK на него уже переехали выше). Если останутся FK, DELETE упадёт —
    # это сигнал что мы что-то забыли переподключить.
    await db.execute(text("DELETE FROM companies WHERE id = :dup"), {"dup": m.duplicate_id})


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


async def run(dry_run: bool, min_confidence: float) -> None:
    from app.core.database import AsyncSessionLocal

    async with AsyncSessionLocal() as db:
        logger.info("Загружаю компании из БД…")
        twogis = await _load(db, "2gis")
        yandex = await _load(db, "yandex_maps")
        logger.info("2gis: %d, yandex_maps: %d", len(twogis), len(yandex))

        matches = _find_matches(twogis, yandex)
        logger.info("Найдено матчей: %d", len(matches))

        by_bucket = {"high (≥0.95)": 0, "medium (0.85-0.94)": 0, "low (<0.85)": 0}
        for m in matches:
            if m.confidence >= 0.95:
                by_bucket["high (≥0.95)"] += 1
            elif m.confidence >= 0.85:
                by_bucket["medium (0.85-0.94)"] += 1
            else:
                by_bucket["low (<0.85)"] += 1
        for k, v in by_bucket.items():
            logger.info("  %s: %d", k, v)

        eligible = [m for m in matches if m.confidence >= min_confidence]
        logger.info("К применению (confidence ≥ %.2f): %d", min_confidence, len(eligible))

        if dry_run:
            for m in eligible[:20]:
                logger.info(
                    "  master=%d ← dup=%d  conf=%.2f  by=%s  (%s)",
                    m.primary_id, m.duplicate_id, m.confidence, m.matched_by, m.note,
                )
            if len(eligible) > 20:
                logger.info("  … и ещё %d матчей", len(eligible) - 20)
            logger.info("DRY-RUN — изменения НЕ применены.")
            return

        applied = 0
        for m in eligible:
            await _apply_match(db, m)
            applied += 1
            if applied % 50 == 0:
                await db.commit()
                logger.info("  применено: %d / %d", applied, len(eligible))
        await db.commit()
        logger.info("ГОТОВО. Применено: %d", applied)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="Только отчёт, без изменений")
    parser.add_argument("--apply", action="store_true", help="Применить матчи")
    parser.add_argument("--min-confidence", type=float, default=0.85)
    args = parser.parse_args()

    if not args.dry_run and not args.apply:
        parser.error("Укажите --dry-run или --apply")
    if args.dry_run and args.apply:
        parser.error("--dry-run и --apply взаимоисключают")

    asyncio.run(run(dry_run=args.dry_run, min_confidence=args.min_confidence))
    return 0


if __name__ == "__main__":
    sys.exit(main())
