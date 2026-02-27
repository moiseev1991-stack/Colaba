"""Tenders module — proxy to zakupki.gov.ru search API."""

import re
from typing import Any, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
import httpx

from app.modules.auth.router import get_current_user_id

router = APIRouter(prefix="/tenders", tags=["tenders"])

ZAKUPKI_SEARCH_URL = "https://zakupki.gov.ru/epz/order/extendedsearch/results.html"
ZAKUPKI_NOTICE_URL = "https://zakupki.gov.ru/epz/order/notice/printForm/view.html"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "ru-RU,ru;q=0.9",
    "Referer": "https://zakupki.gov.ru/",
}


def _parse_price(text: str) -> Optional[float]:
    """Extract numeric price from string like '1 234 567,89 руб.'"""
    cleaned = re.sub(r'[^\d,.]', '', text.replace('\xa0', '').replace(' ', ''))
    cleaned = cleaned.replace(',', '.')
    try:
        return float(cleaned)
    except ValueError:
        return None


def _parse_results_html(html: str, base_url: str) -> tuple[list[dict[str, Any]], int]:
    """Parse zakupki.gov.ru search results page (HTML)."""
    from html.parser import HTMLParser
    import re

    items = []
    total = 0

    # Extract total count
    total_match = re.search(r'найдено[:\s]*<[^>]*>\s*([\d\s]+)', html, re.IGNORECASE)
    if not total_match:
        total_match = re.search(r'Всего записей.*?(\d[\d\s]*)', html, re.IGNORECASE)
    if total_match:
        try:
            total = int(re.sub(r'\D', '', total_match.group(1)))
        except Exception:
            pass

    # Extract tender cards via regex patterns
    card_pattern = re.compile(
        r'registry-entry__header-mid__number.*?>(.*?)</.*?'
        r'registry-entry__body-title.*?href="([^"]+)"[^>]*>(.*?)</a.*?'
        r'customer-name[^>]*>(.*?)</.*?'
        r'price-block__value[^>]*>(.*?)</.*?'
        r'(?:registry-entry__header-top__title[^>]*>(.*?)</|)',
        re.DOTALL,
    )

    # Simpler per-card extraction
    card_blocks = re.split(r'class="registry-entry__header', html)
    for i, block in enumerate(card_blocks[1:], 1):  # skip first empty part
        try:
            num_m = re.search(r'registry-entry__header-mid__number[^>]*>[^<]*<[^>]+>([^<]+)<', block)
            number = num_m.group(1).strip() if num_m else f"#{i}"

            # Title and URL
            title_m = re.search(r'registry-entry__body-title[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([^<]+)</a', block, re.DOTALL)
            if not title_m:
                title_m = re.search(r'href="(/epz/order/notice[^"]+)"[^>]*>([^<]{5,})</a', block, re.DOTALL)
            title = title_m.group(2).strip() if title_m else "Без названия"
            href = title_m.group(1) if title_m else ""
            url = f"https://zakupki.gov.ru{href}" if href.startswith('/') else href

            # Customer
            cust_m = re.search(r'customer-name[^>]*>([^<]+)<', block)
            customer = cust_m.group(1).strip() if cust_m else "Неизвестен"

            # Price
            price_m = re.search(r'price-block__value[^>]*>([^<]+)<', block)
            price_str = price_m.group(1).strip() if price_m else ""
            price = _parse_price(price_str) if price_str else None

            # Status
            status_m = re.search(r'registry-entry__header-top__title[^>]*>([^<]+)<', block)
            status = status_m.group(1).strip() if status_m else ""

            # Dates
            pub_m = re.search(r'(?:Дата размещения|Опубликовано)[:\s]*([0-9.]+)', block, re.IGNORECASE)
            end_m = re.search(r'(?:Дата окончания|окончания приёма)[:\s]*([0-9.]+)', block, re.IGNORECASE)
            publish_date = pub_m.group(1) if pub_m else ""
            end_date = end_m.group(1) if end_m else None

            # Law type
            law_m = re.search(r'(44-ФЗ|223-ФЗ|615)', block)
            law = law_m.group(1) if law_m else ""

            # Region
            region_m = re.search(r'region[^>]*>([^<]{3,})<', block, re.IGNORECASE)
            region = region_m.group(1).strip() if region_m else ""

            if not title or title == "Без названия":
                continue

            items.append({
                "id": number.replace("/", "-").replace(" ", ""),
                "number": number,
                "name": title,
                "customerName": customer,
                "price": price,
                "currency": "руб.",
                "status": status,
                "publishDate": publish_date,
                "endDate": end_date,
                "region": region,
                "type": law,
                "url": url or ZAKUPKI_SEARCH_URL,
            })
        except Exception:
            continue

    return items, total


@router.get("/search")
async def search_tenders(
    searchString: str = Query("", description="Search keyword"),
    pageNumber: int = Query(1, ge=1),
    sortBy: str = Query("PUBLISH_DATE"),
    sortDirection: str = Query("false"),
    fz44: str = Query("on"),
    fz223: str = Query("on"),
    ppRf615: str = Query("on"),
    _user_id: int = Depends(get_current_user_id),
):
    """Proxy search request to zakupki.gov.ru and return structured JSON."""
    if not searchString.strip():
        return {"items": [], "total": 0}

    params = {
        "searchString": searchString,
        "morphology": "on",
        "pageNumber": str(pageNumber),
        "sortDirection": sortDirection,
        "recordsPerPage": "_10",
        "showLotsInfoHidden": "false",
        "sortBy": sortBy,
        "fz44": fz44,
        "fz223": fz223,
        "ppRf615": ppRf615,
        "af": "on",
        "ca": "on",
        "pc": "on",
        "pa": "on",
    }

    try:
        async with httpx.AsyncClient(timeout=20, follow_redirects=True, headers=HEADERS) as client:
            resp = await client.get(ZAKUPKI_SEARCH_URL, params=params)
            resp.raise_for_status()
            html = resp.text
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Zakupki.gov.ru не ответил за 20 секунд")
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=502, detail=f"HTTP {e.response.status_code} from zakupki.gov.ru")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Ошибка при обращении к zakupki.gov.ru: {e}")

    items, total = _parse_results_html(html, ZAKUPKI_SEARCH_URL)

    return {"items": items, "total": total, "page": pageNumber}
