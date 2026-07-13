#!/usr/bin/env python3
"""Пересбор pain_tags для (niche, city) через прод-API.

Зачем: pilot bulk-парс наполнил БД компаниями по 5 нишам через
from_cache — но старая ветка `create_map_search` не запускала reviews_ai
для кешированных компаний, поэтому /app/pains показывал 0. Этот скрипт
дёргает admin endpoint `/maps/admin/rebuild-pain-tags-for-niche`
для всех пилот-ниш, что затригерит: analyze_reviews_for_company
(sentiment + embeddings) → recluster_pains_for_niche (кластеризация +
LLM-именование PainTag).

Требует суперюзерский JWT.

Использование:
    PROD_JWT="eyJ..." python scripts/rebuild_pain_tags_for_niche.py

    # dry-run (только распечатать план):
    python scripts/rebuild_pain_tags_for_niche.py --dry-run

    # свой набор:
    NICHES="стоматология,косметология" CITIES="Москва" \
        python scripts/rebuild_pain_tags_for_niche.py

    # только позитивная сторона (сильные стороны, не боли):
    SENTIMENT=positive python scripts/rebuild_pain_tags_for_niche.py

Планово занимает ~5-8 минут на нишу (analyze для всех компаний +
countdown 180с + сам recluster). Скрипт возвращает сразу после
постановки задач; смотри статус в /app/pains через 10 мин.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

DEFAULT_BASE = "https://spinlid.ru/api/v1"

# Дефолт — пилот-матрица (12 пар). Совпадает с bulk_niche_parse.py.
DEFAULT_NICHES: list[str] = [
    "салоны красоты",
    "стоматология",
    "косметология",
    "барбершоп",
    "автосервис",
    "фитнес клуб",
]
DEFAULT_CITIES: list[str] = [
    "Москва",
    "Санкт-Петербург",
]

# Rate-limit endpoint'а: 3/минуту. Ставим 22 секунды = 2.7/min с запасом.
DEFAULT_DELAY_SEC = 22.0


def http(
    method: str,
    url: str,
    body: dict[str, Any] | None = None,
    token: str | None = None,
    timeout: float = 60,
) -> tuple[int, dict[str, Any] | str]:
    headers = {"Content-Type": "application/json", "Accept": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            raw = res.read().decode("utf-8", errors="replace")
            try:
                return res.status, json.loads(raw)
            except json.JSONDecodeError:
                return res.status, raw
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", errors="replace")
        try:
            return e.code, json.loads(raw)
        except json.JSONDecodeError:
            return e.code, raw


def get_token() -> str:
    jwt = os.environ.get("PROD_JWT", "").strip()
    if not jwt:
        sys.exit(
            "ERROR: не задан PROD_JWT.\n"
            "1. `bash scripts/_local_mint_jwt.sh` — выпустит JWT суперюзера.\n"
            "2. Или скопируй Authorization: Bearer <ЭТО> из DevTools/Network.\n"
            "Затем: `PROD_JWT=<TOKEN> python scripts/rebuild_pain_tags_for_niche.py`."
        )
    return jwt


def build_matrix(niches: list[str], cities: list[str]) -> list[tuple[str, str]]:
    # Порядок: город внешний, ниша внутренняя — очередь celery разгребёт
    # один город целиком, потом второй.
    return [(niche, city) for city in cities for niche in niches]


def main() -> int:
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--dry-run", action="store_true", help="Только напечатать план")
    parser.add_argument(
        "--delay", type=float, default=DEFAULT_DELAY_SEC,
        help=f"Пауза между запросами, сек (rate-limit 3/min; default {DEFAULT_DELAY_SEC})",
    )
    args = parser.parse_args()

    base = os.environ.get("PROD_BASE", DEFAULT_BASE).rstrip("/")
    niches = [n.strip() for n in os.environ.get("NICHES", "").split(",") if n.strip()] or DEFAULT_NICHES
    cities_env = os.environ.get("CITIES", "")
    if cities_env == "":
        cities = DEFAULT_CITIES
    else:
        # Пустая строка в CITIES → пересбор без фильтра по городу (по всей БД).
        cities = [c.strip() for c in cities_env.split(",") if c.strip()] or [""]
    sentiment = os.environ.get("SENTIMENT", "negative").strip() or "negative"
    if sentiment not in ("negative", "positive"):
        sys.exit(f"ERROR: SENTIMENT должен быть negative или positive, не {sentiment!r}")

    matrix = build_matrix(niches, cities)
    print(f"BASE:      {base}")
    print(f"SENTIMENT: {sentiment}")
    print(f"CITIES:    {cities if cities != [''] else '(все)'}")
    print(f"NICHES:    {niches}")
    print(f"TOTAL:     {len(matrix)} пар, задержка {args.delay:.1f}s (rate-limit 3/min)")
    print()

    if args.dry_run:
        print("--- DRY-RUN: планируемые запросы ---")
        for i, (niche, city) in enumerate(matrix, 1):
            city_show = city if city else "(все города)"
            print(f"  {i:2d}. POST {base}/maps/admin/rebuild-pain-tags-for-niche  "
                  f"niche={niche!r}  city={city_show!r}  sentiment={sentiment!r}")
        print()
        print("Если план ок — запусти без --dry-run.")
        return 0

    token = get_token()
    print("Токен получен, начинаю…\n")

    results: list[dict[str, Any]] = []
    for i, (niche, city) in enumerate(matrix, 1):
        params: dict[str, str] = {"niche": niche, "sentiment": sentiment}
        if city:
            params["city"] = city
        url = f"{base}/maps/admin/rebuild-pain-tags-for-niche?{urllib.parse.urlencode(params)}"
        code, resp = http("POST", url, token=token)
        if code == 200 and isinstance(resp, dict) and resp.get("queued"):
            n = resp.get("companies_queued_for_analyze", 0)
            city_show = city if city else "(все)"
            print(f"  [{i:2d}/{len(matrix)}] OK   {city_show:<20} / {niche:<20}  analyze={n}")
            results.append({
                "niche": niche, "city": city, "queued": True,
                "companies": n, "hint": resp.get("hint"),
            })
        elif code == 200 and isinstance(resp, dict):
            # queued=False → в БД нет компаний
            city_show = city if city else "(все)"
            print(f"  [{i:2d}/{len(matrix)}] SKIP {city_show:<20} / {niche:<20}  {resp.get('hint', '')}")
            results.append({"niche": niche, "city": city, "queued": False, "hint": resp.get("hint")})
        elif code == 403:
            sys.exit("ERROR: 403 — токен не суперюзерский. Дёрни _local_mint_jwt.sh под суперюзером.")
        else:
            print(f"  [{i:2d}/{len(matrix)}] FAIL code={code}  {city} / {niche}  →  {resp}")
            results.append({"niche": niche, "city": city, "code": code, "error": resp})

        if i < len(matrix):
            time.sleep(args.delay)

    # Сводка
    print()
    ok = [r for r in results if r.get("queued")]
    skipped = [r for r in results if r.get("queued") is False]
    failed = [r for r in results if "code" in r]
    total_companies = sum(r.get("companies", 0) for r in ok)
    print(f"Итого: OK={len(ok)}  skipped={len(skipped)}  failed={len(failed)}"
          f"  всего компаний в analyze: {total_companies}")

    if ok:
        print(f"\nЖди ~5-8 минут, потом проверь /app/pains — pain_tags должны появиться.")

    if failed:
        print("\nПровалились:")
        for r in failed:
            print(f"  - {r['city']} / {r['niche']} → HTTP {r.get('code')}: {r.get('error')}")

    out_path = os.path.join(
        os.path.dirname(os.path.abspath(__file__)),
        "rebuild_pain_tags_last_run.json",
    )
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump({"base": base, "sentiment": sentiment, "results": results}, f, ensure_ascii=False, indent=2)
    print(f"\nСохранил {out_path}")
    return 0 if not failed else 1


if __name__ == "__main__":
    sys.exit(main())
