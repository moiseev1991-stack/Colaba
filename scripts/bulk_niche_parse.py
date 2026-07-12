#!/usr/bin/env python3
"""Массовое создание maps-запросов через API прод'а.

Пилот: 12 запросов = 2 гео (Мск + СПб) × 6 ниш через Yandex.Карты (без 2GIS,
ключ заблокирован). Каждый запрос → celery-таск в очередь. Возвращает
таблицу id + начальный статус (pending / from_cache).

Использование:
    # логин по email/паролю (креды в env, безопаснее чем в argv):
    PROD_EMAIL="moiseev1991@gmail.com" PROD_PASSWORD="..." \
        python scripts/bulk_niche_parse.py

    # или готовый JWT из DevTools:
    PROD_JWT="eyJhbGc..." python scripts/bulk_niche_parse.py

    # dry-run — только напечатать что бы отправил, без POST'ов:
    python scripts/bulk_niche_parse.py --dry-run

    # свой набор ниш/гео (через запятую) — если хочется расширить пилот:
    NICHES="салоны красоты,стоматология" CITIES="Москва,Санкт-Петербург" \
        python scripts/bulk_niche_parse.py

    # локальная база (для отладки):
    PROD_BASE="http://127.0.0.1:8001/api/v1" python scripts/bulk_niche_parse.py --dry-run
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request
from typing import Any

DEFAULT_BASE = "https://spinlid.ru/api/v1"

# Пилот: 6 ниш × 2 гео. Ниши — те что дают богатую плитку болей на 4hods.
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

# Rate-limit сервера: 10/min. Ставим 7 секунд = 8.5/min, с запасом.
DEFAULT_DELAY_SEC = 7.0

# Только Yandex — 2GIS-ключ заблокирован с 22.06.2026, Google по запросу.
SOURCES = ["yandex_maps"]


def http(
    method: str,
    url: str,
    body: dict[str, Any] | None = None,
    token: str | None = None,
    timeout: float = 30,
) -> tuple[int, dict[str, Any] | str]:
    """Синхронный HTTP-запрос через stdlib. Возвращает (status_code, json_or_text)."""
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


def get_token(base: str) -> str:
    """Получить JWT: сперва пробуем PROD_JWT, иначе логин по email/password."""
    jwt = os.environ.get("PROD_JWT", "").strip()
    if jwt:
        return jwt

    email = os.environ.get("PROD_EMAIL", "").strip()
    password = os.environ.get("PROD_PASSWORD", "").strip()
    if not email or not password:
        sys.exit(
            "ERROR: не задан ни PROD_JWT, ни (PROD_EMAIL + PROD_PASSWORD).\n"
            "Способ 1 (простой): скопируй JWT из DevTools → Network → любой запрос → "
            "Authorization: Bearer <ЭТО> и запусти `PROD_JWT=... python ...`.\n"
            "Способ 2: `PROD_EMAIL=... PROD_PASSWORD=... python ...`."
        )

    code, resp = http("POST", f"{base}/auth/login", {"email": email, "password": password})
    if code != 200 or not isinstance(resp, dict) or "access_token" not in resp:
        sys.exit(f"ERROR: логин не прошёл ({code}): {resp}")
    return resp["access_token"]


def build_matrix(niches: list[str], cities: list[str]) -> list[tuple[str, str]]:
    """Все пары (niche, city). Порядок: город внешний, ниша внутренняя —
    так celery-очередь сначала догонит один город целиком, а не размажет."""
    return [(niche, city) for city in cities for niche in niches]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dry-run", action="store_true", help="Только напечатать план, без POST'ов")
    parser.add_argument("--delay", type=float, default=DEFAULT_DELAY_SEC,
                        help=f"Задержка между запросами, сек (default {DEFAULT_DELAY_SEC})")
    args = parser.parse_args()

    base = os.environ.get("PROD_BASE", DEFAULT_BASE).rstrip("/")
    niches = [n.strip() for n in os.environ.get("NICHES", "").split(",") if n.strip()] or DEFAULT_NICHES
    cities = [c.strip() for c in os.environ.get("CITIES", "").split(",") if c.strip()] or DEFAULT_CITIES

    matrix = build_matrix(niches, cities)
    print(f"BASE:    {base}")
    print(f"SOURCES: {SOURCES}")
    print(f"CITIES:  {cities}")
    print(f"NICHES:  {niches}")
    print(f"TOTAL:   {len(matrix)} запросов, задержка {args.delay:.1f}s между ними")
    print()

    if args.dry_run:
        print("--- DRY-RUN: планируемые запросы ---")
        for i, (niche, city) in enumerate(matrix, 1):
            print(f"  {i:2d}. POST {base}/maps/search  {{niche: {niche!r}, city: {city!r}}}")
        print()
        print("Проверь список. Если ок — запусти без --dry-run.")
        return 0

    token = get_token(base)
    print("Логин OK, начинаю POST'ы…\n")

    results: list[dict[str, Any]] = []
    for i, (niche, city) in enumerate(matrix, 1):
        payload = {
            "niche": niche,
            "city": city,
            "sources": SOURCES,
            "mode": "city",
        }
        code, resp = http("POST", f"{base}/maps/search", body=payload, token=token, timeout=60)
        if code == 201 and isinstance(resp, dict):
            sid = resp.get("id")
            status = resp.get("status")
            print(f"  [{i:2d}/{len(matrix)}] OK   id={sid:<6} status={status:<12} {city} / {niche}")
            results.append({"i": i, "id": sid, "status": status, "niche": niche, "city": city})
        else:
            print(f"  [{i:2d}/{len(matrix)}] FAIL code={code}  {city} / {niche}  →  {resp}")
            results.append({"i": i, "code": code, "error": resp, "niche": niche, "city": city})

        if i < len(matrix):
            time.sleep(args.delay)

    # Сводка
    print()
    ok = [r for r in results if "id" in r]
    from_cache = [r for r in ok if r.get("status") == "from_cache"]
    pending = [r for r in ok if r.get("status") == "pending"]
    failed = [r for r in results if "id" not in r]

    print(f"Итого: OK={len(ok)}  pending={len(pending)}  from_cache={len(from_cache)}  failed={len(failed)}")
    if failed:
        print("\nПровалились:")
        for r in failed:
            print(f"  - {r['city']} / {r['niche']} → HTTP {r.get('code')}: {r.get('error')}")

    # Сохраняем сводку — пригодится для последующего мониторинга.
    out_path = os.path.join(os.path.dirname(__file__), "bulk_niche_parse_last_run.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump({"base": base, "matrix": results}, f, ensure_ascii=False, indent=2)
    print(f"\nСохранил {out_path}")
    return 0 if not failed else 1


if __name__ == "__main__":
    sys.exit(main())
