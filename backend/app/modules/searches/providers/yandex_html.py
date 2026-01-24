"""
Яндекс HTML провайдер для парсинга результатов обычного поиска Яндекса.
Парсит HTML страницы результатов поиска без использования API.
"""

import re
import logging
from typing import List, Dict, Any, Optional
from urllib.parse import urlparse, quote_plus
from bs4 import BeautifulSoup

from app.modules.searches.providers.common import fetch_with_retry, random_delay

logger = logging.getLogger(__name__)


async def fetch_search_results(
    query: str,
    num_results: int = 50,
    region: int = 213,  # Москва по умолчанию
    max_retries: int = 3,
    **kwargs,
) -> List[Dict[str, Any]]:
    """
    Получить результаты поиска из Яндекс через парсинг HTML.
    
    Args:
        query: Поисковый запрос
        num_results: Количество результатов (максимум 100)
        region: ID региона поиска (213 = Москва, 1 = Санкт-Петербург и т.д.)
        max_retries: Максимальное количество попыток при ошибках
        **kwargs: Дополнительные параметры
    
    Returns:
        List of search results with title, url, snippet, position, domain
    
    Raises:
        ValueError: Если не удалось получить результаты после всех попыток
    """
    num_results = min(num_results, 100)
    all_results = []
    page = 0
    
    # Яндекс показывает по 10 результатов на страницу
    pages_needed = (num_results + 9) // 10
    
    for page_num in range(pages_needed):
        try:
            # Задержка между страницами
            if page_num > 0:
                await random_delay(2.0, 4.0)
            
            page_results = await _fetch_page(query, region, page_num, max_retries)
            
            if not page_results:
                # Если не получили результаты, пробуем еще раз
                if page_num == 0:
                    # Для первой страницы это критично - выбрасываем исключение для fallback
                    logger.warning(f"No results on first page for query: {query}")
                    raise ValueError(f"Failed to fetch Yandex search results: no results on first page (likely blocked)")
                else:
                    # Для последующих страниц просто останавливаемся
                    break
            
            all_results.extend(page_results)
            
            # Если получили меньше 10 результатов, значит больше нет
            if len(page_results) < 10:
                break
            
            # Если уже получили нужное количество, останавливаемся
            if len(all_results) >= num_results:
                break
                
        except Exception as e:
            logger.error(f"Error fetching page {page_num} for query '{query}': {e}")
            if page_num == 0:
                # Если первая страница не загрузилась, пробуем fallback
                raise ValueError(f"Failed to fetch Yandex search results: {str(e)}")
            else:
                # Для последующих страниц просто останавливаемся
                break
    
    # Возвращаем только нужное количество результатов
    return all_results[:num_results]


async def _fetch_page(
    query: str,
    region: int,
    page: int,
    max_retries: int = 3,
) -> List[Dict[str, Any]]:
    """
    Получить одну страницу результатов (до 10 результатов).
    
    Args:
        query: Поисковый запрос
        region: ID региона
        page: Номер страницы (0-based)
        max_retries: Максимальное количество попыток
    
    Returns:
        List of search results
    """
    # URL поиска Яндекса
    encoded_query = quote_plus(query)
    url = f"https://yandex.ru/search/?text={encoded_query}&lr={region}&p={page}"
    
    # Выполняем запрос с ретраями
    response = await fetch_with_retry(url, max_retries=max_retries, timeout=30.0)
    
    if response is None:
        logger.error(f"Failed to fetch Yandex search page {page} for query: {query}")
        return []
    
    # Парсим HTML
    try:
        html_content = response.text
        soup = BeautifulSoup(html_content, 'html.parser')
        
        results = []
        
        # Яндекс использует разные структуры для результатов
        # Пробуем несколько вариантов селекторов
        
        # Вариант 1: Современная структура (serp-item)
        serp_items = soup.find_all('li', class_=re.compile(r'serp-item'))
        if serp_items:
            for idx, item in enumerate(serp_items, start=page * 10 + 1):
                result = _parse_yandex_item(item, idx)
                if result:
                    results.append(result)
        
        # Вариант 2: Старая структура (organic)
        if not results:
            organic_items = soup.find_all('li', class_=re.compile(r'organic'))
            for idx, item in enumerate(organic_items, start=page * 10 + 1):
                result = _parse_yandex_item(item, idx)
                if result:
                    results.append(result)
        
        # Вариант 3: Универсальный поиск по ссылкам в результатах
        if not results:
            # Ищем все ссылки в основных результатах
            main_content = soup.find('main') or soup.find('div', class_=re.compile(r'content|serp'))
            if main_content:
                links = main_content.find_all('a', href=True)
                for idx, link in enumerate(links[:10], start=page * 10 + 1):
                    href = link.get('href', '')
                    # Пропускаем внутренние ссылки Яндекса
                    if 'yandex.ru' in href or href.startswith('/'):
                        continue
                    
                    # Извлекаем title
                    title = link.get_text(strip=True)
                    if not title:
                        # Пробуем найти title в родительском элементе
                        parent = link.find_parent(['h2', 'h3', 'div'])
                        if parent:
                            title = parent.get_text(strip=True)
                    
                    if title and href.startswith('http'):
                        domain = urlparse(href).netloc
                        # Ищем snippet рядом со ссылкой
                        snippet = _find_snippet_near_link(link)
                        
                        results.append({
                            "position": idx,
                            "title": title,
                            "url": href,
                            "snippet": snippet,
                            "domain": domain,
                        })
                        
                        if len(results) >= 10:
                            break
        
        return results
        
    except Exception as e:
        logger.error(f"Error parsing Yandex HTML for query '{query}', page {page}: {e}")
        return []


def _parse_yandex_item(item, position: int) -> Optional[Dict[str, Any]]:
    """
    Парсить один элемент результата Яндекса.
    
    Args:
        item: BeautifulSoup элемент результата
        position: Позиция результата
    
    Returns:
        Словарь с данными результата или None
    """
    try:
        # Ищем ссылку
        link = item.find('a', href=True)
        if not link:
            return None
        
        url = link.get('href', '')
        if not url or url.startswith('/') or 'yandex.ru' in url:
            return None
        
        # Извлекаем title
        title_elem = item.find('h2') or item.find('h3')
        if title_elem:
            title = title_elem.get_text(strip=True)
        else:
            # Пробуем найти в других местах
            title_elem = item.find(['span', 'div'], class_=re.compile(r'title|organic__title'))
            if title_elem:
                title = title_elem.get_text(strip=True)
            else:
                title = link.get_text(strip=True)
        
        if not title:
            return None
        
        # Извлекаем snippet
        snippet = ""
        snippet_elem = item.find(['div', 'span'], class_=re.compile(r'text|snippet|organic__text'))
        if snippet_elem:
            snippet = snippet_elem.get_text(strip=True)
        
        # Извлекаем домен
        domain = urlparse(url).netloc if url else ""
        
        return {
            "position": position,
            "title": title,
            "url": url,
            "snippet": snippet,
            "domain": domain,
        }
    except Exception as e:
        logger.debug(f"Error parsing Yandex item: {e}")
        return None


def _find_snippet_near_link(link) -> str:
    """
    Найти snippet рядом со ссылкой.
    
    Args:
        link: BeautifulSoup элемент ссылки
    
    Returns:
        Текст snippet или пустая строка
    """
    # Ищем в родительском элементе
    parent = link.find_parent(['div', 'li', 'article'])
    if parent:
        # Ищем текст после ссылки
        text_elements = parent.find_all(['div', 'span', 'p'], class_=re.compile(r'text|snippet|description'))
        for elem in text_elements:
            text = elem.get_text(strip=True)
            if text and len(text) > 20:  # Минимальная длина snippet
                return text
    
    return ""
