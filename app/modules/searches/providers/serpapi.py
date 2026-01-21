"""
SerpAPI provider for search results.
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
    if not settings.SERPAPI_KEY:
        # For MVP: return mock data if no API key
        return [
            {
                "position": i,
                "title": f"Mock Result {i} for '{query}'",
                "url": f"https://example{i}.com",
                "snippet": f"This is a mock result {i} for testing purposes.",
                "domain": f"example{i}.com",
            }
            for i in range(1, min(num_results, 10) + 1)
        ]
    
    # Limit num_results to 100
    num_results = min(num_results, 100)
    
    params = {
        "api_key": settings.SERPAPI_KEY,
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
