"""Search providers."""

from typing import List, Dict, Any, Callable, Awaitable


async def fetch_search_results(
    provider: str,
    query: str,
    num_results: int = 50,
    **kwargs,
) -> List[Dict[str, Any]]:
    """
    Получить результаты поиска используя указанный провайдер.
    
    Args:
        provider: Название провайдера ('duckduckgo', 'yandex_xml', 'serpapi')
        query: Поисковый запрос
        num_results: Количество результатов
        **kwargs: Дополнительные параметры для провайдера
    
    Returns:
        List of search results
    
    Raises:
        ValueError: Если провайдер не найден
    """
    if provider == "duckduckgo":
        from app.modules.searches.providers.duckduckgo import fetch_search_results as duckduckgo_fetch
        return await duckduckgo_fetch(query=query, num_results=num_results, **kwargs)
    
    elif provider == "yandex_xml":
        from app.modules.searches.providers.yandex_xml import fetch_search_results as yandex_fetch
        return await yandex_fetch(query=query, num_results=num_results, **kwargs)
    
    elif provider == "serpapi":
        from app.modules.searches.providers.serpapi import fetch_search_results as serpapi_fetch
        return await serpapi_fetch(query=query, num_results=num_results, **kwargs)
    
    else:
        raise ValueError(f"Unknown search provider: {provider}. Available: duckduckgo, yandex_xml, serpapi")
