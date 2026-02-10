"""Search providers."""

from typing import List, Dict, Any, Callable, Awaitable


async def fetch_search_results(
    provider: str,
    query: str,
    num_results: int = 50,
    enable_fallback: bool = True,
    provider_config: dict | None = None,
    **kwargs,
) -> List[Dict[str, Any]]:
    """
    Получить результаты поиска используя указанный провайдер.
    
    Args:
        provider: Название провайдера ('duckduckgo', 'yandex_xml', 'yandex_html', 'google_html', 'serpapi')
        query: Поисковый запрос
        num_results: Количество результатов
        enable_fallback: Включить автоматический fallback на другой провайдер при блокировке
        **kwargs: Дополнительные параметры для провайдера
    
    Returns:
        List of search results
    
    Raises:
        ValueError: Если провайдер не найден или все провайдеры заблокированы
    """
    import logging
    logger = logging.getLogger(__name__)
    
    # Определяем fallback провайдеры для каждого типа
    fallback_map = {
        "yandex_html": ["yandex_xml", "duckduckgo"],
        "google_html": ["duckduckgo"],
        "yandex_xml": ["yandex_html", "duckduckgo"],
        "duckduckgo": ["yandex_html", "google_html"],
    }
    
    providers_to_try = [provider]
    if enable_fallback and provider in fallback_map:
        providers_to_try.extend(fallback_map[provider])
    
    last_error = None
    
    for current_provider in providers_to_try:
        try:
            if current_provider == "duckduckgo":
                from app.modules.searches.providers.duckduckgo import fetch_search_results as duckduckgo_fetch
                return await duckduckgo_fetch(query=query, num_results=num_results, provider_config=provider_config, **kwargs)
            
            elif current_provider == "yandex_xml":
                from app.modules.searches.providers.yandex_xml import fetch_search_results as yandex_fetch
                return await yandex_fetch(query=query, num_results=num_results, provider_config=provider_config, **kwargs)
            
            elif current_provider == "serpapi":
                from app.modules.searches.providers.serpapi import fetch_search_results as serpapi_fetch
                return await serpapi_fetch(query=query, num_results=num_results, provider_config=provider_config, **kwargs)
            
            elif current_provider == "yandex_html":
                from app.modules.searches.providers.yandex_html import fetch_search_results as yandex_html_fetch
                return await yandex_html_fetch(query=query, num_results=num_results, provider_config=provider_config, **kwargs)
            
            elif current_provider == "google_html":
                from app.modules.searches.providers.google_html import fetch_search_results as google_html_fetch
                return await google_html_fetch(query=query, num_results=num_results, provider_config=provider_config, **kwargs)
            
        except ValueError as e:
            error_msg = str(e).lower()
            # Проверяем, является ли это блокировкой
            if any(keyword in error_msg for keyword in ["blocked", "captcha", "forbidden", "rate limit", "403", "429"]):
                logger.warning(f"Provider {current_provider} blocked, trying fallback...")
                last_error = e
                continue
            else:
                # Для других ошибок пробуем fallback
                if current_provider != providers_to_try[-1]:  # Не последний провайдер
                    logger.warning(f"Provider {current_provider} failed: {e}, trying fallback...")
                    last_error = e
                    continue
                else:
                    raise
        except Exception as e:
            # Для неожиданных ошибок пробуем fallback
            if current_provider != providers_to_try[-1]:  # Не последний провайдер
                logger.warning(f"Provider {current_provider} error: {e}, trying fallback...")
                last_error = e
                continue
            else:
                raise
    
    # Если дошли сюда, значит все провайдеры провалились
    if last_error:
        raise ValueError(f"All search providers failed. Last error: {str(last_error)}")
    else:
        raise ValueError(f"Unknown search provider: {provider}. Available: duckduckgo, yandex_xml, yandex_html, google_html, serpapi")
