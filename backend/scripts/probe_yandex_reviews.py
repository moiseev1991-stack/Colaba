"""Разведка нового формата Yandex Maps reviews (2026-06-04).

Гипотеза: с обновлением API первичная страница отзывов
/maps/org/{businessId}/reviews/ инлайнит первые N отзывов в HTML как
initial state. Парсим оттуда.

Запуск:
  scp probe_yandex_reviews.py root@prod:/tmp/
  docker cp /tmp/probe_yandex_reviews.py colaba-celery-worker-search-1:/tmp/
  docker exec colaba-celery-worker-search-1 python /tmp/probe_yandex_reviews.py
"""

import asyncio
import re
import json
import httpx

BUSINESS_ID = "1174861674"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"


def find_in_html(html: str, label: str, max_show: int = 500):
    """Ищем где встречается label и печатаем окрестность."""
    idx = html.find(label)
    if idx < 0:
        print(f"{label}: NOT FOUND")
        return None
    print(f"{label}: at offset {idx}, context:")
    start = max(0, idx - 60)
    end = min(len(html), idx + 300)
    print(html[start:end])
    print("---")
    return idx


async def main():
    headers = {"User-Agent": UA, "Accept-Language": "ru-RU,ru;q=0.9"}
    async with httpx.AsyncClient(timeout=20.0, headers=headers, follow_redirects=True) as c:
        r0 = await c.get(f"https://yandex.ru/maps/org/{BUSINESS_ID}/reviews/")
        html = r0.text
        print("HTML status:", r0.status_code, "len:", len(html))

        # Где могут быть отзывы:
        for label in [
            '"reviews"',
            'business-reviews-card-view',
            '"items"',
            "fetchReviews",
            "initialState",
            "BOOTSTRAP",
            "__PRELOADED_STATE__",
            "ChevronOptions",
            "reviewSpot",
            "businessReviews",
            "data-business-id",
            "reviewCount",
            "ratingValue",
        ]:
            find_in_html(html, label)

        # Также сохраним HTML в файл чтобы изучить отдельно.
        with open("/tmp/yandex_reviews.html", "w", encoding="utf-8") as f:
            f.write(html)
        print("Saved HTML to /tmp/yandex_reviews.html")


if __name__ == "__main__":
    asyncio.run(main())
