"""
Общие утилиты для HTML провайдеров поиска.
Включает ротацию User-Agent, поддержку прокси, задержки и детектирование блокировок.
"""

import random
import asyncio
import logging
from typing import List, Optional, Dict, Any
from urllib.parse import urlparse
import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

# Список реалистичных User-Agent строк
USER_AGENTS = [
    # Chrome на Windows
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36",
    # Chrome на macOS
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
    # Firefox на Windows
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0",
    # Firefox на macOS
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0",
    # Safari на macOS
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
    # Edge на Windows
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0",
]


def get_random_user_agent() -> str:
    """
    Получить случайный User-Agent из списка.
    
    Returns:
        Случайная строка User-Agent
    """
    return random.choice(USER_AGENTS)


def get_proxy_config() -> Optional[Dict[str, str]]:
    """
    Получить конфигурацию прокси из настроек.
    
    Поддерживает:
    - PROXY_URL - одиночный прокси (http://proxy:port или socks5://proxy:port)
    - PROXY_LIST - список прокси через запятую
    
    Returns:
        Словарь с настройками прокси для httpx или None
    """
    if not getattr(settings, 'USE_PROXY', False):
        return None
    
    proxy_url = getattr(settings, 'PROXY_URL', None)
    proxy_list = getattr(settings, 'PROXY_LIST', None)
    
    # Приоритет: PROXY_URL > PROXY_LIST
    if proxy_url:
        return {"http://": proxy_url, "https://": proxy_url}
    
    if proxy_list:
        # Выбираем случайный прокси из списка
        proxies = [p.strip() for p in proxy_list.split(',') if p.strip()]
        if proxies:
            selected_proxy = random.choice(proxies)
            return {"http://": selected_proxy, "https://": selected_proxy}
    
    return None


async def random_delay(min_seconds: float = 1.0, max_seconds: float = 3.0):
    """
    Случайная задержка между запросами.
    
    Args:
        min_seconds: Минимальная задержка в секундах
        max_seconds: Максимальная задержка в секундах
    """
    delay = random.uniform(min_seconds, max_seconds)
    await asyncio.sleep(delay)


def detect_blocking(response: httpx.Response, html_content: Optional[str] = None) -> Dict[str, Any]:
    """
    Детектировать блокировку или капчу в ответе.
    
    Args:
        response: HTTP ответ
        html_content: HTML содержимое страницы (опционально, для анализа)
    
    Returns:
        Словарь с информацией о блокировке:
        {
            "blocked": bool,
            "block_type": str,  # "captcha", "rate_limit", "forbidden", "redirect"
            "message": str
        }
    """
    result = {
        "blocked": False,
        "block_type": None,
        "message": None
    }
    
    # Проверка статус кодов
    if response.status_code == 403:
        result["blocked"] = True
        result["block_type"] = "forbidden"
        result["message"] = "403 Forbidden - доступ запрещен"
        return result
    
    if response.status_code == 429:
        result["blocked"] = True
        result["block_type"] = "rate_limit"
        result["message"] = "429 Too Many Requests - превышен лимит запросов"
        return result
    
    # Проверка редиректов на страницы капчи
    final_url = str(response.url)
    if "/showcaptcha" in final_url or "/captcha" in final_url.lower():
        result["blocked"] = True
        result["block_type"] = "captcha"
        result["message"] = "Обнаружена капча (редирект на страницу капчи)"
        return result
    
    if "/sorry" in final_url.lower() or "unusual traffic" in final_url.lower():
        result["blocked"] = True
        result["block_type"] = "captcha"
        result["message"] = "Google обнаружил подозрительный трафик"
        return result
    
    # Анализ HTML содержимого
    if html_content:
        content_lower = html_content.lower()
        
        # Ключевые слова капчи
        captcha_keywords = [
            "captcha",
            "капча",
            "проверка на робота",
            "unusual traffic",
            "verify you're not a robot",
            "showcaptcha",
        ]
        
        for keyword in captcha_keywords:
            if keyword in content_lower:
                result["blocked"] = True
                result["block_type"] = "captcha"
                result["message"] = f"Обнаружена капча (ключевое слово: {keyword})"
                return result
        
        # Проверка на маленький размер ответа (может быть блокировка)
        if len(html_content) < 1000 and response.status_code == 200:
            # Проверяем, не является ли это страницей блокировки
            if any(keyword in content_lower for keyword in ["blocked", "заблокирован", "access denied"]):
                result["blocked"] = True
                result["block_type"] = "forbidden"
                result["message"] = "Возможная блокировка (маленький размер ответа с ключевыми словами)"
                return result
    
    return result


async def fetch_with_retry(
    url: str,
    max_retries: int = 3,
    base_delay: float = 2.0,
    timeout: float = 30.0,
    use_proxy: bool = True,
) -> Optional[httpx.Response]:
    """
    Выполнить HTTP запрос с ретраями и защитой от блокировок.
    
    Args:
        url: URL для запроса
        max_retries: Максимальное количество попыток
        base_delay: Базовая задержка для экспоненциального backoff
        timeout: Таймаут запроса в секундах
        use_proxy: Использовать прокси если настроено
    
    Returns:
        Response объект или None если все попытки провалились
    """
    proxy_config = get_proxy_config() if use_proxy else None
    
    for attempt in range(max_retries):
        try:
            # Случайная задержка перед запросом (кроме первой попытки)
            if attempt > 0:
                delay = base_delay * (2 ** (attempt - 1))
                await asyncio.sleep(delay)
            else:
                # Небольшая случайная задержка перед первым запросом
                await random_delay(0.5, 1.5)
            
            # Создаем клиент с прокси и случайным User-Agent
            headers = {
                "User-Agent": get_random_user_agent(),
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
                "Accept-Language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7",
                "Accept-Encoding": "gzip, deflate, br",
                "Connection": "keep-alive",
                "Upgrade-Insecure-Requests": "1",
            }
            
            async with httpx.AsyncClient(
                timeout=timeout,
                follow_redirects=True,
                proxies=proxy_config,
                headers=headers,
            ) as client:
                response = await client.get(url)
                
                # Проверяем на блокировки
                blocking_info = detect_blocking(response)
                if blocking_info["blocked"]:
                    logger.warning(
                        f"Blocking detected for {url} (attempt {attempt + 1}/{max_retries}): "
                        f"{blocking_info['message']}"
                    )
                    
                    # Если это капча или блокировка, пробуем еще раз с большей задержкой
                    if attempt < max_retries - 1:
                        delay = base_delay * (2 ** attempt) * 2  # Удваиваем задержку для блокировок
                        await asyncio.sleep(delay)
                        continue
                    else:
                        logger.error(f"All attempts failed due to blocking: {blocking_info['message']}")
                        return None
                
                # Если статус 200 и нет блокировок - возвращаем ответ
                if response.status_code == 200:
                    return response
                
                # Для других статусов пробуем еще раз
                if attempt < max_retries - 1:
                    logger.warning(f"Status {response.status_code} for {url}, retrying...")
                    continue
                else:
                    logger.error(f"Failed to fetch {url} after {max_retries} attempts: status {response.status_code}")
                    return None
                    
        except httpx.TimeoutException as e:
            logger.warning(f"Timeout for {url} (attempt {attempt + 1}/{max_retries})")
            if attempt < max_retries - 1:
                continue
            else:
                logger.error(f"Timeout for {url} after {max_retries} attempts")
                return None
                
        except httpx.RequestError as e:
            logger.warning(f"Request error for {url} (attempt {attempt + 1}/{max_retries}): {e}")
            if attempt < max_retries - 1:
                continue
            else:
                logger.error(f"Request error for {url} after {max_retries} attempts: {e}")
                return None
                
        except Exception as e:
            logger.error(f"Unexpected error for {url} (attempt {attempt + 1}/{max_retries}): {e}")
            if attempt < max_retries - 1:
                continue
            else:
                logger.error(f"Unexpected error for {url} after {max_retries} attempts: {e}")
                return None
    
    return None
