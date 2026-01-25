"""
Google HTML провайдер для парсинга результатов обычного поиска Google.
Парсит HTML страницы результатов поиска без использования API.
"""

import re
import logging
from typing import List, Dict, Any, Optional

import httpx
from urllib.parse import urlparse, quote_plus, urljoin
from bs4 import BeautifulSoup

from app.core.config import settings
from app.modules.searches.providers.common import detect_blocking, fetch_with_retry, random_delay, get_proxy_config, get_random_user_agent

logger = logging.getLogger(__name__)


async def fetch_search_results(
    query: str,
    num_results: int = 50,
    lang: str = "ru",  # Язык интерфейса
    country: str = "ru",  # Страна для поиска
    max_retries: int = 3,
    **kwargs,
) -> List[Dict[str, Any]]:
    """
    Получить результаты поиска из Google через парсинг HTML.
    
    Args:
        query: Поисковый запрос
        num_results: Количество результатов (максимум 100)
        lang: Язык интерфейса (ru, en и т.д.)
        country: Код страны для поиска (ru, us и т.д.)
        max_retries: Максимальное количество попыток при ошибках
        **kwargs: Дополнительные параметры
    
    Returns:
        List of search results with title, url, snippet, position, domain
    
    Raises:
        ValueError: Если не удалось получить результаты после всех попыток
    """
    num_results = min(num_results, 100)
    all_results = []
    start = 0
    
    # Google показывает по 10 результатов на страницу
    pages_needed = (num_results + 9) // 10
    
    for page_num in range(pages_needed):
        try:
            # Задержка между страницами
            if page_num > 0:
                await random_delay(2.0, 4.0)

            pc = kwargs.get("provider_config")
            proxy_overrides = {k: pc.get(k) for k in ("use_proxy", "proxy_url", "proxy_list")} if pc is not None else None

            page_results = await _fetch_page(
                query, lang, country, start, max_retries, proxy_overrides=proxy_overrides, db=kwargs.get("db")
            )
            
            if not page_results:
                if page_num == 0:
                    # Для первой страницы: 0 результатов = блокировка/капча → raise для fallback на DuckDuckGo
                    logger.warning(f"No results on first page for query: {query} (blocked or HTML changed)")
                    raise ValueError("Google HTML: no results on first page (likely blocked or captcha). Use duckduckgo.")
                else:
                    break
            
            all_results.extend(page_results)
            start += 10  # Google использует параметр start для пагинации
            
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
                raise ValueError(f"Failed to fetch Google search results: {str(e)}")
            else:
                # Для последующих страниц просто останавливаемся
                break
    
    # Возвращаем только нужное количество результатов
    return all_results[:num_results]


async def _fetch_page(
    query: str,
    lang: str,
    country: str,
    start: int,
    max_retries: int = 3,
    proxy_overrides: Optional[Dict[str, Any]] = None,
    db=None,
) -> List[Dict[str, Any]]:
    """
    Получить одну страницу результатов (до 10 результатов).
    
    Args:
        query: Поисковый запрос
        lang: Язык интерфейса
        country: Код страны
        start: Смещение для пагинации (0, 10, 20, ...)
        max_retries: Максимальное количество попыток
    
    Returns:
        List of search results
    """
    # URL поиска Google
    encoded_query = quote_plus(query)
    url = f"https://www.google.com/search?q={encoded_query}&hl={lang}&gl={country}&start={start}&num=10"
    
    # Выполняем запрос с ретраями (referer и proxy для обхода блокировок)
    response = await fetch_with_retry(
        url, max_retries=max_retries, timeout=30.0,
        referer="https://www.google.com/", proxy_overrides=proxy_overrides
    )

    if response is None:
        logger.error(f"Failed to fetch Google search page (start={start}) for query: {query}")
        return []

    html_content = response.text
    html_to_parse = html_content
    bi = detect_blocking(response, html_content=html_content)
    # Пробуем solver: при явной капче или при 403/429 (часто капча/блок)
    if db is not None and (
        (bi.get("blocked") and bi.get("block_type") == "captcha")
        or response.status_code in (403, 429)
    ):
        try:
            from app.modules.captcha.solver import solve_image_captcha, solve_recaptcha, _extract_sitekey_and_action

            # reCAPTCHA: если есть sitekey — 2captcha/anticaptcha
            sitekey, action, version = _extract_sitekey_and_action(html_content)
            if sitekey:
                token = await solve_recaptcha(sitekey, str(response.url), version, action, db)
                if token:
                    new_html = await _try_submit_google_recaptcha_form(
                        html_content, str(response.url), token, dict(response.cookies), proxy_overrides
                    )
                    if new_html:
                        html_to_parse = new_html
                        logger.info("Google reCAPTCHA form submitted")
            else:
                # Image captcha
                solution = await solve_image_captcha(html_content, str(response.url), "google", db)
                if solution:
                    new_html = await _try_submit_google_captcha_form(
                        html_content, str(response.url), solution, dict(response.cookies), proxy_overrides
                    )
                    if new_html:
                        html_to_parse = new_html
        except Exception as e:
            logger.warning("Google captcha solver: %s", e)

    # Парсим HTML
    try:
        soup = BeautifulSoup(html_to_parse, "html.parser")
        
        results = []
        
        # Google использует разные структуры для результатов
        # Пробуем несколько вариантов селекторов
        
        # Вариант 1: Современная структура (g, tF2Cxc)
        result_divs = soup.find_all('div', class_=re.compile(r'^g$|tF2Cxc'))
        if result_divs:
            for idx, div in enumerate(result_divs, start=start + 1):
                result = _parse_google_item(div, idx)
                if result:
                    results.append(result)
        
        # Вариант 2: Альтернативная структура
        if not results:
            result_divs = soup.find_all('div', class_=re.compile(r'result|search-result'))
            for idx, div in enumerate(result_divs, start=start + 1):
                result = _parse_google_item(div, idx)
                if result:
                    results.append(result)
        
        # Вариант 3: Универсальный поиск по ссылкам
        if not results:
            # Ищем все ссылки в основных результатах
            main_content = soup.find('div', id='main') or soup.find('div', id='search')
            if main_content:
                links = main_content.find_all('a', href=True)
                for idx, link in enumerate(links[:10], start=start + 1):
                    href = link.get('href', '')
                    # Пропускаем внутренние ссылки Google
                    if 'google.com' in href or href.startswith('/') or href.startswith('#'):
                        continue
                    
                    # Извлекаем title
                    title = link.get_text(strip=True)
                    if not title:
                        # Пробуем найти title в родительском элементе
                        parent = link.find_parent(['h3', 'h2', 'div'])
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

        # Отладка при 0 результатов
        if len(results) == 0 and settings.DEBUG:
            logger.debug("[DEBUG] HTML (0 results): %s", (html_to_parse or "")[:5000])

        return results

    except Exception as e:
        logger.error(f"Error parsing Google HTML for query '{query}', start={start}: {e}")
        return []


async def _try_submit_google_recaptcha_form(
    html_content: str, page_url: str, token: str, cookies: dict, proxy_overrides: Optional[Dict[str, Any]] = None
) -> Optional[str]:
    """Подставить g-recaptcha-response и отправить форму. Возвращает text новой страницы или None."""
    soup = BeautifulSoup(html_content, "html.parser")
    # Текстарея или инпут с именем g-recaptcha-response
    recaptcha_field = soup.find(attrs={"name": "g-recaptcha-response"}) or soup.find("textarea", {"name": "g-recaptcha-response"})
    if not recaptcha_field:
        return None
    form = recaptcha_field.find_parent("form")
    if not form or not form.get("action"):
        return None
    action_url = urljoin(page_url, form.get("action", ""))

    data: Dict[str, str] = {"g-recaptcha-response": token}
    for inp in form.find_all("input", {"name": True}):
        n, v = inp.get("name"), inp.get("value")
        if n and n != "g-recaptcha-response" and v is not None:
            data[n] = v

    proxy_config = get_proxy_config(proxy_overrides)
    headers = {"User-Agent": get_random_user_agent(), "Referer": page_url, "Content-Type": "application/x-www-form-urlencoded"}
    try:
        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True, proxies=proxy_config) as client:
            r = await client.post(action_url, data=data, cookies=cookies, headers=headers)
            if r.status_code != 200:
                return None
            bi = detect_blocking(r, r.text)
            if bi.get("blocked") and bi.get("block_type") == "captcha":
                return None
            return r.text
    except Exception as e:
        logger.debug("_try_submit_google_recaptcha_form: %s", e)
        return None


async def _try_submit_google_captcha_form(
    html_content: str, page_url: str, solution: str, cookies: dict, proxy_overrides: Optional[Dict[str, Any]] = None
) -> Optional[str]:
    """Подставить solution в форму image-captcha (если есть). Возвращает text новой страницы или None."""
    soup = BeautifulSoup(html_content, "html.parser")
    form = soup.find("form", action=True)
    if not form:
        return None
    answer_names = ("captcha", "response", "answer", "rep")
    answer_input = None
    for n in answer_names:
        answer_input = form.find("input", {"name": n})
        if answer_input:
            break
    if not answer_input:
        return None
    action_url = urljoin(page_url, form.get("action", ""))
    data: Dict[str, str] = {}
    for inp in form.find_all("input", {"name": True}):
        n = inp.get("name")
        if n in answer_names:
            data[n] = solution
        elif inp.get("type") == "hidden" and inp.get("value") is not None:
            data[n] = inp.get("value", "")
    if not data:
        return None
    proxy_config = get_proxy_config(proxy_overrides)
    headers = {"User-Agent": get_random_user_agent(), "Referer": page_url, "Content-Type": "application/x-www-form-urlencoded"}
    try:
        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True, proxies=proxy_config) as client:
            r = await client.post(action_url, data=data, cookies=cookies, headers=headers)
            if r.status_code != 200:
                return None
            bi = detect_blocking(r, r.text)
            if bi.get("blocked") and bi.get("block_type") == "captcha":
                return None
            return r.text
    except Exception:
        return None


def _parse_google_item(item, position: int) -> Optional[Dict[str, Any]]:
    """
    Парсить один элемент результата Google.
    
    Args:
        item: BeautifulSoup элемент результата
        position: Позиция результата
    
    Returns:
        Словарь с данными результата или None
    """
    try:
        # Ищем заголовок (обычно в h3)
        title_elem = item.find('h3')
        if not title_elem:
            # Пробуем другие варианты
            title_elem = item.find(['h2', 'h1', 'span'], class_=re.compile(r'title|heading'))
        
        if not title_elem:
            return None
        
        # Ищем ссылку в заголовке или рядом
        link = title_elem.find('a', href=True)
        if not link:
            # Ищем ссылку в родительском элементе
            link = item.find('a', href=True)
        
        if not link:
            return None
        
        url = link.get('href', '')
        # Обрабатываем относительные ссылки Google
        if url.startswith('/url?q='):
            # Извлекаем реальный URL из параметра
            from urllib.parse import parse_qs, unquote
            # Извлекаем параметр q из URL
            if '?q=' in url:
                url_part = url.split('?q=')[1]
                # Убираем дополнительные параметры
                if '&' in url_part:
                    url_part = url_part.split('&')[0]
                url = unquote(url_part)
        
        if not url or url.startswith('/') or 'google.com' in url:
            return None
        
        # Извлекаем title
        title = title_elem.get_text(strip=True)
        if not title:
            title = link.get_text(strip=True)
        
        if not title:
            return None
        
        # Извлекаем snippet
        snippet = ""
        snippet_elem = item.find(['div', 'span'], class_=re.compile(r'VwiC3b|aCOpRe|snippet|text'))
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
        logger.debug(f"Error parsing Google item: {e}")
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
    parent = link.find_parent(['div', 'article', 'li'])
    if parent:
        # Ищем текст после ссылки
        text_elements = parent.find_all(['div', 'span'], class_=re.compile(r'VwiC3b|aCOpRe|snippet|text'))
        for elem in text_elements:
            text = elem.get_text(strip=True)
            if text and len(text) > 20:  # Минимальная длина snippet
                return text
    
    return ""
