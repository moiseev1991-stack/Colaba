"""
DuckDuckGo search provider for search results.

Использует библиотеку duckduckgo-search для бесплатного поиска без API ключа.
GitHub: https://github.com/deedy5/duckduckgo_search
"""

from typing import List, Dict, Any
from urllib.parse import urlparse
import asyncio
import time

try:
    from duckduckgo_search import DDGS
    from duckduckgo_search.exceptions import DuckDuckGoSearchException
except ImportError:
    DDGS = None
    DuckDuckGoSearchException = Exception


async def fetch_search_results(
    query: str,
    num_results: int = 50,
    region: str = "ru-RU",  # Регион для поиска (ru-RU, en-US и т.д.)
    max_retries: int = 3,
    retry_delay: float = 5.0,  # Увеличена базовая задержка до 5 секунд
    **kwargs,
) -> List[Dict[str, Any]]:
    """
    Получить результаты поиска из DuckDuckGo.
    
    DuckDuckGo - бесплатный поисковик без API ключа.
    Использует библиотеку duckduckgo-search для парсинга результатов.
    
    Args:
        query: Поисковый запрос
        num_results: Количество результатов (максимум 100)
        region: Регион поиска (ru-RU для России, en-US для США и т.д.)
        max_retries: Максимальное количество попыток при ошибках
        retry_delay: Задержка между попытками в секундах
        **kwargs: Дополнительные параметры
    
    Returns:
        List of search results with title, url, snippet, position, domain
    
    Raises:
        ValueError: Если библиотека не установлена или произошла ошибка после всех попыток
    """
    if DDGS is None:
        raise ValueError(
            "Библиотека duckduckgo-search не установлена. "
            "Установите её: pip install duckduckgo-search"
        )

    # Регион из provider_config или аргумент
    region = (kwargs.get("provider_config") or {}).get("region") or region

    # Ограничиваем количество результатов
    num_results = min(num_results, 100)
    
    # Retry логика с экспоненциальной задержкой
    last_error = None
    
    # Добавляем случайную задержку перед первым запросом (1-3 секунды)
    # Это помогает избежать одновременных запросов и снижает риск rate limit
    import random
    initial_delay = random.uniform(1.0, 3.0)
    await asyncio.sleep(initial_delay)
    
    for attempt in range(max_retries):
        try:
            # Добавляем задержку перед запросом (кроме первой попытки)
            if attempt > 0:
                # Увеличиваем задержку для rate limit: 5, 15, 45 секунд
                delay = retry_delay * (3 ** (attempt - 1))
                await asyncio.sleep(delay)
            
            # DuckDuckGo поиск (синхронный, но быстрый)
            # Используем asyncio для неблокирующего выполнения
            def _search():
                """Синхронная функция поиска."""
                results = []
                with DDGS() as ddgs:
                    # Используем text() метод для получения результатов
                    search_results = ddgs.text(
                        keywords=query,
                        region=region,
                        max_results=num_results,
                    )
                    
                    for idx, item in enumerate(search_results, start=1):
                        url = item.get("href", "")
                        domain = urlparse(url).netloc if url else ""
                        
                        results.append({
                            "position": idx,
                            "title": item.get("title", ""),
                            "url": url,
                            "snippet": item.get("body", ""),
                            "domain": domain,
                        })
                        
                        # Останавливаемся когда получили нужное количество
                        if len(results) >= num_results:
                            break
                
                return results
            
            # Выполняем синхронный поиск в executor чтобы не блокировать event loop
            loop = asyncio.get_event_loop()
            results = await loop.run_in_executor(None, _search)
            
            # Если получили результаты, возвращаем их
            if results:
                return results
            
            # Если результатов нет, но и ошибки нет - это нормально
            return []
            
        except DuckDuckGoSearchException as e:
            error_msg = str(e).lower()
            last_error = e
            
            # Если это rate limit, пробуем еще раз с большей задержкой
            if "ratelimit" in error_msg or "rate limit" in error_msg:
                if attempt < max_retries - 1:
                    # Увеличиваем задержку для rate limit: 15, 45, 135 секунд
                    delay = retry_delay * (3 ** (attempt + 1))  # Более агрессивная задержка для rate limit
                    # Добавляем случайную вариацию ±20% для избежания синхронизации
                    delay_variation = delay * random.uniform(-0.2, 0.2)
                    delay = max(5.0, delay + delay_variation)  # Минимум 5 секунд
                    await asyncio.sleep(delay)
                    continue
                else:
                    raise ValueError(
                        f"DuckDuckGo rate limit exceeded после {max_retries} попыток. "
                        f"DuckDuckGo временно блокирует запросы. "
                        f"Рекомендуется: 1) Подождать 5-10 минут и попробовать снова, "
                        f"2) Использовать провайдер Yandex XML (требует настройки API ключей). "
                        f"Ошибка: {str(e)}"
                    )
            else:
                # Для других ошибок пробуем еще раз
                if attempt < max_retries - 1:
                    continue
                else:
                    raise ValueError(f"DuckDuckGo search failed: {str(e)}")
                    
        except Exception as e:
            last_error = e
            if attempt < max_retries - 1:
                continue
            else:
                raise ValueError(f"DuckDuckGo search failed: {str(e)}")
    
    # Если дошли сюда, значит все попытки исчерпаны
    if last_error:
        raise ValueError(f"DuckDuckGo search failed after {max_retries} attempts: {str(last_error)}")
    else:
        raise ValueError("DuckDuckGo search failed: Unknown error")
