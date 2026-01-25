"""
Яндекс HTML провайдер для парсинга результатов обычного поиска Яндекса.
Парсит HTML страницы результатов поиска без использования API.
"""

import re
import logging
from typing import List, Dict, Any, Optional
from urllib.parse import urlparse, quote_plus, urljoin
from bs4 import BeautifulSoup
import httpx

from app.core.config import settings
from app.modules.searches.providers.common import (
    detect_blocking,
    fetch_with_retry,
    random_delay,
    get_proxy_config,
    get_random_user_agent,
    _html_has_captcha,
)

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

            pc = kwargs.get("provider_config")
            proxy_overrides = {k: pc.get(k) for k in ("use_proxy", "proxy_url", "proxy_list")} if pc is not None else None
            use_mobile = (pc or {}).get("use_mobile", False)

            page_results = await _fetch_page(
                query, region, page_num, max_retries,
                proxy_overrides=proxy_overrides,
                use_mobile=use_mobile,
                db=kwargs.get("db"),
            )
            
            if not page_results:
                if page_num == 0:
                    # При 0 с десктопа — одна попытка с мобильным URL (часто мобильная выдача режется иначе)
                    if not use_mobile:
                        logger.info("Yandex HTML: 0 on desktop, retrying with mobile URL")
                        page_results = await _fetch_page(
                            query, region, 0, max_retries,
                            proxy_overrides=proxy_overrides,
                            use_mobile=True,
                            db=kwargs.get("db"),
                        )
                    if not page_results:
                        logger.warning(f"No results on first page for query: {query} (blocked or HTML changed)")
                        raise ValueError(
                            "Яндекс HTML: на первой странице 0 результатов (блокировка или капча). "
                            "Включите и настройте прокси в настройках провайдера «Яндекс HTML» — без прокси Яндекс блокирует запросы с серверов."
                        )
                else:
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
    proxy_overrides: Optional[Dict[str, Any]] = None,
    use_mobile: bool = False,
    db=None,
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
    # URL поиска Яндекса: десктоп или мобильный (touch) при use_mobile
    encoded_query = quote_plus(query)
    if use_mobile:
        url = f"https://yandex.ru/search/touch/?text={encoded_query}&lr={region}&p={page}"
    else:
        url = f"https://yandex.ru/search/?text={encoded_query}&lr={region}&p={page}"

    # Прогрев сессии: запрос на главную, затем поиск с теми же cookies (снижает блокировки)
    search_cookies: dict = {}
    try:
        warm = await fetch_with_retry(
            "https://yandex.ru/",
            max_retries=1,
            timeout=10.0,
            referer=None,
            proxy_overrides=proxy_overrides,
        )
        if warm and getattr(warm, "cookies", None):
            search_cookies = dict(warm.cookies)
    except Exception:
        pass

    # Выполняем запрос с ретраями (referer, proxy, cookies)
    response = await fetch_with_retry(
        url, max_retries=max_retries, timeout=30.0,
        referer="https://yandex.ru/", proxy_overrides=proxy_overrides, cookies=search_cookies or None
    )

    if response is None:
        logger.error(f"Failed to fetch Yandex search page {page} for query: {query}")
        return []

    html_content = response.text
    html_to_parse = html_content
    bi = detect_blocking(response, html_content=html_content)
    solver_tried = False
    # Пробуем solver: при явной капче или при 403/429 (часто капча без наших ключевых слов в теле)
    if db is not None and (
        (bi.get("blocked") and bi.get("block_type") == "captcha")
        or response.status_code in (403, 429)
    ):
        try:
            from app.modules.captcha.solver import solve_image_captcha, solve_yandex_smartcaptcha

            solver_tried = True
            solution = await solve_image_captcha(html_content, str(response.url), "yandex", db)
            if solution:
                new_html = await _try_submit_yandex_captcha_form(
                    html_content, str(response.url), solution, dict(response.cookies), proxy_overrides
                )
                if new_html:
                    html_to_parse = new_html
                    logger.info("Yandex captcha form submitted and got new page")
            else:
                # Yandex SmartCaptcha (JS): 2captcha method=yandex, sitekey, pageurl
                token = await solve_yandex_smartcaptcha(html_content, str(response.url), db)
                if token:
                    new_html = await _try_submit_yandex_captcha_form(
                        html_content, str(response.url), None, dict(response.cookies), proxy_overrides, smart_token=token
                    )
                    if new_html:
                        html_to_parse = new_html
                        logger.info("Yandex SmartCaptcha form submitted and got new page")
        except Exception as e:
            logger.warning("Yandex solve_image_captcha or form submit: %s", e)

    # Парсим HTML
    try:
        soup = BeautifulSoup(html_to_parse, "html.parser")
        
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
        
        # Вариант 3: Универсальный поиск по ссылкам в основных блоках
        if not results:
            main_content = soup.find('main') or soup.find('div', class_=re.compile(r'content|serp'))
            if main_content:
                links = main_content.find_all('a', href=True)
                for idx, link in enumerate(links[:10], start=page * 10 + 1):
                    href = link.get('href', '')
                    if 'yandex.ru' in href or href.startswith('/'):
                        continue
                    title = link.get_text(strip=True)
                    if not title:
                        parent = link.find_parent(['h2', 'h3', 'div'])
                        if parent:
                            title = parent.get_text(strip=True)
                    if title and href.startswith('http'):
                        results.append({
                            "position": idx,
                            "title": title,
                            "url": href,
                            "snippet": _find_snippet_near_link(link),
                            "domain": urlparse(href).netloc,
                        })
                        if len(results) >= 10:
                            break

        # Вариант 4: по всему body — любые внешние ссылки с текстом (на случай смены вёрстки)
        if not results:
            seen = set()
            for link in soup.find_all('a', href=True):
                if len(results) >= 10:
                    break
                href = link.get('href', '').split('#')[0].split('?')[0]
                if not href.startswith('http') or 'yandex.' in href or href in seen:
                    continue
                seen.add(href)
                title = link.get_text(strip=True) or (link.find_parent(['h2', 'h3', 'h4']) or link).get_text(strip=True)
                if title and len(title) >= 2:
                    results.append({
                        "position": page * 10 + len(results) + 1,
                        "title": title[:300],
                        "url": link.get('href', ''),
                        "snippet": _find_snippet_near_link(link),
                        "domain": urlparse(href).netloc,
                    })

        # Второй шанс: 0 результатов, solver не вызывали — попробовать solver (часто капча без наших ключевых слов)
        if len(results) == 0 and not solver_tried and db is not None:
            try:
                from app.modules.captcha.solver import solve_image_captcha, solve_yandex_smartcaptcha

                solution = await solve_image_captcha(html_to_parse, str(response.url), "yandex", db)
                new_html = None
                if solution:
                    new_html = await _try_submit_yandex_captcha_form(
                        html_to_parse, str(response.url), solution, dict(response.cookies), proxy_overrides
                    )
                else:
                    token = await solve_yandex_smartcaptcha(html_to_parse, str(response.url), db)
                    if token:
                        new_html = await _try_submit_yandex_captcha_form(
                            html_to_parse, str(response.url), None, dict(response.cookies), proxy_overrides, smart_token=token
                        )
                if new_html:
                    soup2 = BeautifulSoup(new_html, "html.parser")
                    for li in soup2.find_all("li", class_=re.compile(r"serp-item|organic")):
                        r = _parse_yandex_item(li, len(results) + 1)
                        if r:
                            results.append(r)
                    if not results and (soup2.find("main") or soup2.find("div", class_=re.compile(r"content|serp"))):
                        mn = soup2.find("main") or soup2.find("div", class_=re.compile(r"content|serp"))
                        for link in mn.find_all("a", href=True)[:10]:
                            href = link.get("href", "")
                            if "yandex.ru" in href or not href.startswith("http"):
                                continue
                            tit = link.get_text(strip=True) or (link.find_parent(["h2", "h3"]) or link).get_text(strip=True)
                            if tit:
                                results.append({
                                    "position": len(results) + 1,
                                    "title": tit,
                                    "url": href,
                                    "snippet": _find_snippet_near_link(link),
                                    "domain": urlparse(href).netloc,
                                })
                    if results:
                        logger.info("Yandex second-chance captcha solve: got %d results", len(results))
            except Exception as e:
                logger.warning("Yandex second-chance solve_image_captcha: %s", e)

        # Лог при 0 результатов (диагностика блокировок/капчи)
        if len(results) == 0:
            logger.warning(
                "Yandex HTML: 0 results | status=%s url=%s len_html=%s has_captcha_keywords=%s",
                getattr(response, "status_code", None),
                str(getattr(response, "url", ""))[:120],
                len(html_to_parse or ""),
                _html_has_captcha(html_to_parse or ""),
            )
            if settings.DEBUG:
                logger.debug("[DEBUG] HTML (0 results): %s", (html_to_parse or "")[:5000])

        return results

    except Exception as e:
        logger.error(f"Error parsing Yandex HTML for query '{query}', page {page}: {e}")
        return []


async def _try_submit_yandex_captcha_form(
    html_content: str,
    page_url: str,
    solution: Optional[str] = None,
    cookies: Optional[dict] = None,
    proxy_overrides: Optional[Dict[str, Any]] = None,
    *,
    smart_token: Optional[str] = None,
) -> Optional[str]:
    """
    Найти форму капчи в HTML, подставить solution (image) или smart_token (SmartCaptcha) и отправить POST.
    Возвращает text новой страницы или None.
    """
    soup = BeautifulSoup(html_content, "html.parser")
    form = soup.find("form", action=True)
    if not form:
        return None
    action = (form.get("action") or "").strip()
    if not action:
        return None
    action_url = urljoin(page_url, action)

    data: Dict[str, str] = {}

    if smart_token:
        # Yandex SmartCaptcha: токен в smart-token, captcha-token или g-recaptcha-response
        token_names = ("smart-token", "captcha-token", "g-recaptcha-response")
        token_input = None
        for n in token_names:
            token_input = form.find("input", {"name": n}) or form.find("textarea", {"name": n})
            if token_input:
                data[n] = smart_token
                break
        if not token_input:
            logger.debug("_try_submit_yandex_captcha_form: smart_token передан, но input (smart-token/captcha-token/g-recaptcha-response) не найден")
            return None
    elif solution:
        # Классическая image-captcha: rep, captcha, answer, response
        answer_names = ("rep", "captcha", "answer", "response", "recaptcha-response")
        answer_input = None
        for n in answer_names:
            answer_input = form.find("input", {"name": n})
            if answer_input:
                break
        if not answer_input:
            return None
        data[answer_input.get("name", "rep")] = solution
    else:
        return None

    # Собираем hidden-поля (кроме тех, что уже в data)
    skip_names = {"smart-token", "captcha-token", "g-recaptcha-response", "rep", "captcha", "answer", "response", "recaptcha-response"}
    for inp in form.find_all("input", {"name": True}):
        name = inp.get("name")
        if not name or name in skip_names:
            continue
        if inp.get("type") == "hidden" and inp.get("value") is not None:
            data[name] = inp.get("value", "")

    proxy_config = get_proxy_config(proxy_overrides)
    headers = {
        "User-Agent": get_random_user_agent(),
        "Referer": page_url,
        "Content-Type": "application/x-www-form-urlencoded",
    }
    try:
        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True, proxies=proxy_config) as client:
            r = await client.post(action_url, data=data, cookies=cookies or {}, headers=headers)
            if r.status_code != 200:
                return None
            # Если снова капча — не используем
            bi = detect_blocking(r, r.text)
            if bi.get("blocked") and bi.get("block_type") == "captcha":
                return None
            return r.text
    except Exception as e:
        logger.debug("_try_submit_yandex_captcha_form: %s", e)
        return None


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
