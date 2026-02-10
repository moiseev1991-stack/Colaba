"""
SerpAPI provider for search results.

DEPRECATED: Этот провайдер устарел. Используйте yandex_xml.py вместо этого.
Оставлен для обратной совместимости.
"""

import httpx
from typing import List, Dict, Any
from urllib.parse import urlparse

from app.core.config import settings


async def fetch_search_results(
    query: str,
    num_results: int = 50,
    region: str = "ru",
    engine: str = "yandex",
    **kwargs,
) -> List[Dict[str, Any]]:
    """
    Fetch search results from SerpAPI.
    
    Args:
        query: Search query
        num_results: Number of results to fetch (max 100)
        region: Search region (ru, us, etc.)
        engine: Search engine (yandex, google, bing)
    
    Returns:
        List of search results with title, url, snippet, position
    """
    api_key = (kwargs.get("provider_config") or {}).get("api_key") or settings.SERPAPI_KEY

    if not api_key:
        raise ValueError(
            "SerpAPI key not configured. Set in .env or Provider settings. Use duckduckgo, yandex_html or google_html for free search."
        )

    # Limit num_results to 100
    num_results = min(num_results, 100)

    params = {
        "api_key": api_key,
        "q": query,
        "engine": engine,
        "num": num_results,
    }
    
    if engine == "yandex":
        params["lr"] = region  # Language region for Yandex
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            response = await client.get("https://serpapi.com/search", params=params)
            response.raise_for_status()
            data = response.json()
            
            results = []
            organic_results = data.get("organic_results", [])
            
            for idx, item in enumerate(organic_results[:num_results], start=1):
                url = item.get("link", "")
                domain = urlparse(url).netloc if url else ""
                
                results.append({
                    "position": idx,
                    "title": item.get("title", ""),
                    "url": url,
                    "snippet": item.get("snippet", ""),
                    "domain": domain,
                })
            
            return results
            
        except httpx.HTTPStatusError as e:
            raise ValueError(f"SerpAPI error: {e.response.status_code} - {e.response.text}")
        except Exception as e:
            raise ValueError(f"SerpAPI request failed: {str(e)}")
