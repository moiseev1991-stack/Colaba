"""
Яндекс XML API provider for search results.

Документация: https://yandex.ru/dev/xml/doc/dg/concepts/about.html
"""

import httpx
from typing import List, Dict, Any, Optional
from urllib.parse import urlparse
from xml.etree import ElementTree as ET

from app.core.config import settings


async def fetch_search_results(
    query: str,
    num_results: int = 50,
    region: int = 213,  # Москва по умолчанию (список регионов: https://yandex.ru/dev/xml/doc/dg/reference/regions.html)
    page: int = 0,
) -> List[Dict[str, Any]]:
    """
    Получить результаты поиска из Яндекс XML API.
    
    Args:
        query: Поисковый запрос (максимум 40 слов и 400 символов)
        num_results: Количество результатов (максимум 100 на страницу)
        region: ID региона поиска (213 = Москва, 1 = Санкт-Петербург, 2 = Екатеринбург и т.д.)
        page: Номер страницы (0 = первая страница, 10 результатов на страницу)
    
    Returns:
        List of search results with title, url, snippet, position, domain
    
    Raises:
        ValueError: Если API ключ не настроен или произошла ошибка запроса
    """
    if not settings.YANDEX_XML_USER or not settings.YANDEX_XML_KEY:
        # Для MVP: возвращаем mock данные если нет API ключа
        return _get_mock_results(query, num_results)
    
    # Ограничиваем количество результатов (максимум 100 на страницу)
    num_results = min(num_results, 100)
    
    # Яндекс XML API возвращает по 10 результатов на страницу
    # Нужно сделать несколько запросов если нужно больше результатов
    all_results = []
    pages_needed = (num_results + 9) // 10  # Округляем вверх
    
    for page_num in range(pages_needed):
        page_results = await _fetch_page(query, region, page_num)
        all_results.extend(page_results)
        
        # Если получили меньше 10 результатов, значит больше нет
        if len(page_results) < 10:
            break
        
        # Если уже получили нужное количество, останавливаемся
        if len(all_results) >= num_results:
            break
    
    # Возвращаем только нужное количество результатов
    return all_results[:num_results]


async def _fetch_page(
    query: str,
    region: int,
    page: int,
) -> List[Dict[str, Any]]:
    """
    Получить одну страницу результатов (до 10 результатов).
    
    Args:
        query: Поисковый запрос
        region: ID региона
        page: Номер страницы (0-based)
    
    Returns:
        List of search results
    """
    # Яндекс XML API endpoint (можно настроить через YANDEX_XML_URL в .env)
    # Официальный API: https://yandex.ru/dev/xml/
    # Также можно использовать сторонние прокси (xmlriver.com, xmlstock.com)
    url = settings.YANDEX_XML_URL
    
    params = {
        "user": settings.YANDEX_XML_USER,
        "key": settings.YANDEX_XML_KEY,
        "query": query,
        "lr": region,  # Регион поиска
        "page": page,  # Номер страницы (0-based)
        "groupby": "attr=d.mode=deep.groups-on-page=10.docs-in-group=1",  # Группировка результатов
    }
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            response = await client.get(url, params=params)
            response.raise_for_status()
            
            # Парсим XML ответ
            root = ET.fromstring(response.text)
            
            # Проверяем на ошибки
            error = root.find(".//error")
            if error is not None:
                error_code = error.get("code", "unknown")
                error_text = error.text or "Unknown error"
                raise ValueError(f"Yandex XML API error {error_code}: {error_text}")
            
            # Извлекаем результаты
            results = []
            response_elem = root.find(".//response")
            if response_elem is None:
                return results
            
            # Находим все группы результатов
            groups = response_elem.findall(".//group")
            
            for idx, group in enumerate(groups, start=page * 10 + 1):
                # Берем первый документ из группы (docs-in-group=1)
                doc = group.find(".//doc")
                if doc is None:
                    continue
                
                # Извлекаем данные
                url_elem = doc.find(".//url")
                title_elem = doc.find(".//title")
                snippet_elem = doc.find(".//passages/passage")
                
                url = url_elem.text if url_elem is not None and url_elem.text else ""
                title = title_elem.text if title_elem is not None and title_elem.text else ""
                snippet = snippet_elem.text if snippet_elem is not None and snippet_elem.text else ""
                
                # Извлекаем домен из URL
                domain = urlparse(url).netloc if url else ""
                
                results.append({
                    "position": idx,
                    "title": title,
                    "url": url,
                    "snippet": snippet,
                    "domain": domain,
                })
            
            return results
            
        except httpx.HTTPStatusError as e:
            raise ValueError(f"Yandex XML API HTTP error: {e.response.status_code} - {e.response.text}")
        except ET.ParseError as e:
            raise ValueError(f"Yandex XML API parse error: {str(e)}")
        except Exception as e:
            raise ValueError(f"Yandex XML API request failed: {str(e)}")


def _get_mock_results(query: str, num_results: int) -> List[Dict[str, Any]]:
    """
    Генерирует mock результаты для тестирования без API ключа.
    
    Args:
        query: Поисковый запрос
        num_results: Количество результатов
    
    Returns:
        List of mock search results
    """
    return [
        {
            "position": i,
            "title": f"Mock Result {i} for '{query}'",
            "url": f"https://example{i}.com",
            "snippet": f"This is a mock result {i} for testing purposes. Query: {query}",
            "domain": f"example{i}.com",
        }
        for i in range(1, min(num_results, 10) + 1)
    ]
