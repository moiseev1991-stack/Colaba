"""Отладка: рендерим 2gis.ru/firm/{id} через Playwright, дампим HTML и
показываем где в нём ссылка на website компании.

Использование (внутри docker exec colaba-celery-worker-search-1):
    python /app/scripts/debug_2gis_html.py <external_id>

external_id — обязательный аргумент. Возьми любую 2gis-компанию из БД:
    docker exec colaba-postgres-1 psql -U leadgen_user -d leadgen_db -tA \\
      -c "SELECT external_id FROM companies WHERE source='2gis' LIMIT 1;"

Показывает:
  - длину HTML
  - количество совпадений `link.2gis.ru/...?url=...`
  - первые 20 внешних `href="https?://..."` (не 2gis-домены) — кандидаты на
    то, как 2GIS реально оформляет ссылку на сайт компании
  - результат fetch_and_extract_2gis_firm для сравнения (что наш парсер
    извлёк)
"""
from __future__ import annotations

import asyncio
import re
import sys


async def main() -> None:
    if len(sys.argv) < 2:
        print("usage: python debug_2gis_html.py <external_id>")
        sys.exit(2)
    ext_id = sys.argv[1]

    print(f"external_id = {ext_id}")
    url = f"https://2gis.ru/firm/{ext_id}"
    print(f"url = {url}")

    from playwright.async_api import async_playwright

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
        )
        try:
            context = await browser.new_context(
                user_agent=(
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                    "(KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36"
                ),
                locale="ru-RU",
                viewport={"width": 1280, "height": 800},
                extra_http_headers={
                    "Referer": "https://2gis.ru/",
                    "Sec-Ch-Ua": '"Chromium";v="148", "Not.A/Brand";v="24", "Google Chrome";v="148"',
                    "Sec-Ch-Ua-Mobile": "?0",
                    "Sec-Ch-Ua-Platform": '"Windows"',
                },
            )
            page = await context.new_page()
            await page.goto(url, wait_until="domcontentloaded", timeout=25_000)
            try:
                await page.wait_for_load_state("networkidle", timeout=12_000)
            except Exception:
                pass
            await page.wait_for_timeout(1_500)
            html = await page.content()
            body_text = await page.evaluate("document.body && document.body.innerText || ''")
            final_url = page.url
        finally:
            await browser.close()

    dump_path = f"/tmp/2gis-dump-{ext_id}.html"
    with open(dump_path, "w", encoding="utf-8") as f:
        f.write(html)

    print(f"\nfinal_url = {final_url}")
    print(f"html length = {len(html)}")
    print(f"innerText length = {len(body_text)}")
    print(f"dump saved to {dump_path}")

    print("\n--- link.2gis.ru matches in HTML ---")
    link_2gis = re.findall(r'https?://link\.2gis\.ru/[^"\s\'<>]*', html)
    print(f"total: {len(link_2gis)}")
    for m in link_2gis[:5]:
        print(f"  {m[:200]}")

    print("\n--- external href= links (not *.2gis.ru / not tel: / not mailto:) ---")
    ext_hrefs = re.findall(r'href="(https?://[^"]+)"', html)
    non_2gis = []
    for h in ext_hrefs:
        if "2gis" in h:
            continue
        if h.startswith(("https://t.me/", "https://wa.me/", "https://vk.com/", "https://instagram.com/", "https://www.instagram.com/", "https://facebook.com/", "https://www.facebook.com/", "https://ok.ru/", "https://www.ok.ru/", "https://youtube.com/", "https://www.youtube.com/", "https://youtu.be/")):
            continue
        non_2gis.append(h)
    print(f"total non-2gis/non-social external hrefs: {len(non_2gis)}")
    for h in non_2gis[:20]:
        print(f"  {h[:200]}")

    print("\n--- 'сайт' nearby (innerText, +/- 100 chars) ---")
    idx = body_text.lower().find("сайт")
    while idx >= 0:
        snippet = body_text[max(0, idx - 50): idx + 150].replace("\n", " ⏎ ")
        print(f"  ...{snippet}...")
        idx = body_text.lower().find("сайт", idx + 1)
        # ограничим вывод
        if idx > 5000:
            break

    print("\n--- our parser result ---")
    from app.modules.maps.enrich_2gis import fetch_and_extract_2gis_firm
    r = await fetch_and_extract_2gis_firm(ext_id)
    print(f"  website = {r.website!r}")
    print(f"  phones  = {r.phones}")
    print(f"  emails  = {r.emails}")
    print(f"  error   = {r.error}")


if __name__ == "__main__":
    asyncio.run(main())
