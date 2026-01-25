"""
Сервис решения капчи: image (AI Vision) и reCAPTCHA (2captcha/anti-captcha).
"""

import asyncio
import base64
import logging
import re
from typing import Optional
from urllib.parse import urljoin

import httpx
from bs4 import BeautifulSoup
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.captcha.service import get_captcha_config_raw

logger = logging.getLogger(__name__)

# Селекторы для поиска изображения капчи в HTML (Yandex, Google и др.)
CAPTCHA_IMG_SELECTORS = [
    ("img", {"src": re.compile(r"captcha|showcaptcha|/checkcaptcha|/simplecaptcha", re.I)}),
    ("img", {"src": re.compile(r"yandex.*captcha|google.*captcha", re.I)}),
    ("img", {"id": re.compile(r"captcha|capcha", re.I)}),
    ("img", {"class": re.compile(r"captcha|capcha", re.I)}),
]


async def solve_image_captcha(
    html_content: str,
    page_url: str,
    provider: str,
    db: AsyncSession,
    *,
    cookies: Optional[dict] = None,
    headers: Optional[dict] = None,
) -> Optional[str]:
    """
    Решить image-captcha через AI Vision.
    Парсит HTML, находит img капчи, скачивает в base64, вызывает vision.
    Возвращает распознанный текст или None.
    """
    raw = await get_captcha_config_raw(db)
    ai_id = raw.get("ai_assistant_id")
    if not ai_id:
        logger.debug("solve_image_captcha: ai_assistant_id не настроен в captcha config")
        return None

    soup = BeautifulSoup(html_content, "html.parser")
    img = None
    for tag, attrs in CAPTCHA_IMG_SELECTORS:
        el = soup.find(tag, attrs)
        if el and el.get("src"):
            img = el
            break

    if not img:
        # Fallback: любой img с captcha в src
        for el in soup.find_all("img", src=True):
            if "captcha" in (el.get("src") or "").lower() or "showcaptcha" in (el.get("src") or "").lower():
                img = el
                break

    if not img:
        logger.warning("solve_image_captcha: изображение капчи не найдено в HTML")
        return None

    src = (img.get("src") or "").strip()
    if not src:
        return None

    image_b64: Optional[str] = None

    if src.startswith("data:"):
        # data:image/png;base64,...
        m = re.search(r"base64,([A-Za-z0-9+/=]+)", src)
        if m:
            image_b64 = m.group(1)
    else:
        # URL: абсолютный или относительный
        if src.startswith("//"):
            src = "https:" + src
        elif not src.startswith("http"):
            src = urljoin(page_url, src)
        try:
            h = dict(headers) if headers else {}
            if "User-Agent" not in h:
                from app.modules.searches.providers.common import get_random_user_agent

                h["User-Agent"] = get_random_user_agent()
            async with httpx.AsyncClient(timeout=15.0) as client:
                r = await client.get(src, cookies=cookies or {}, headers=h)
                r.raise_for_status()
                image_b64 = base64.b64encode(r.content).decode("ascii")
        except Exception as e:
            logger.warning("solve_image_captcha: не удалось скачать изображение %s: %s", src[:80], e)
            return None

    if not image_b64:
        return None

    try:
        from app.modules.ai_assistants.client import vision

        out = await vision(ai_id, image_b64, "Напиши только текст с картинки, без кавычек и пояснений.", db)
        return (out or "").strip() or None
    except Exception as e:
        logger.warning("solve_image_captcha: vision error: %s", e)
        return None


def _extract_sitekey_and_action(html_content: str) -> tuple[Optional[str], Optional[str], Optional[str]]:
    """Извлечь data-sitekey, data-action (v3) и версию reCAPTCHA из HTML."""
    sitekey = None
    action = None
    version = "v2"

    # data-sitekey
    m = re.search(r'data-sitekey=["\']([^"\']+)["\']', html_content, re.I)
    if m:
        sitekey = m.group(1)
    m = re.search(r'sitekey["\s:]+["\']([^"\']+)["\']', html_content, re.I)
    if m and not sitekey:
        sitekey = m.group(1)

    # v3: data-action
    m = re.search(r'data-action=["\']([^"\']+)["\']', html_content, re.I)
    if m:
        action = m.group(1)
        version = "v3"

    return sitekey, action, version


async def solve_recaptcha(
    sitekey: str,
    pageurl: str,
    version: str = "v2",
    action: Optional[str] = None,
    db: Optional[AsyncSession] = None,
) -> Optional[str]:
    """
    Решить reCAPTCHA через 2captcha или anti-captcha.
    Возвращает token или None.
    """
    if not db:
        return None

    raw = await get_captcha_config_raw(db)
    es = raw.get("external_services") or {}

    # 2captcha
    c2 = es.get("2captcha") or {}
    if isinstance(c2, dict) and c2.get("enabled") and c2.get("api_key"):
        token = await _solve_2captcha(sitekey, pageurl, version, action, c2.get("api_key"))
        if token:
            return token

    # anti-captcha
    ac = es.get("anticaptcha") or {}
    if isinstance(ac, dict) and ac.get("enabled") and ac.get("api_key"):
        token = await _solve_anticaptcha(sitekey, pageurl, version, action, ac.get("api_key"))
        if token:
            return token

    logger.debug("solve_recaptcha: ни 2captcha, ни anticaptcha не настроены или не включены")
    return None


async def _solve_2captcha(
    sitekey: str,
    pageurl: str,
    version: str,
    action: Optional[str],
    api_key: str,
) -> Optional[str]:
    """2captcha: in.php → res.php (getresult)."""
    method = "userrecaptcha" if version == "v3" else "userrecaptcha"
    params = {
        "key": api_key,
        "method": method,
        "googlekey": sitekey,
        "pageurl": pageurl,
        "json": 1,
    }
    if version == "v3" and action:
        params["action"] = action
        params["version"] = "v3"

    async with httpx.AsyncClient(timeout=120.0) as http:
        r = await http.post("https://2captcha.com/in.php", data=params)
        r.raise_for_status()
        data = r.json()
    if data.get("status") != 1:
        logger.warning("2captcha in.php: %s", data.get("request", "error"))
        return None

    captcha_id = data.get("request")
    if not captcha_id:
        return None

    # Ждём и забираем результат
    for _ in range(24):
        await asyncio.sleep(5)
        r2 = await http.get("https://2captcha.com/res.php", params={"key": api_key, "action": "get", "id": captcha_id, "json": 1})
        r2.raise_for_status()
        d2 = r2.json()
        if d2.get("status") == 1:
            return d2.get("request")
        if d2.get("request") != "CAPCHA_NOT_READY":
            logger.warning("2captcha res.php: %s", d2.get("request"))
            return None

    logger.warning("2captcha: timeout waiting for solution")
    return None


async def _solve_anticaptcha(sitekey: str, pageurl: str, version: str, action: Optional[str], api_key: str) -> Optional[str]:
    """Anti-captcha API: createTask → getTaskResult."""
    task_type = "RecaptchaV3TaskProxyless" if version == "v3" else "RecaptchaV2TaskProxyless"
    task: dict = {"type": task_type, "websiteURL": pageurl, "websiteKey": sitekey}
    if version == "v3" and action:
        task["minScore"] = 0.7
        task["pageAction"] = action
    payload = {"clientKey": api_key, "task": task}

    async with httpx.AsyncClient(timeout=120.0) as http:
        r = await http.post("https://api.anti-captcha.com/createTask", json=payload)
        r.raise_for_status()
        data = r.json()
        if data.get("errorId", 1) != 0:
            logger.warning("anticaptcha createTask: %s", data.get("errorDescription", "error"))
            return None

        task_id = data.get("taskId")
        if not task_id:
            return None

        for _ in range(24):
            await asyncio.sleep(5)
            r2 = await http.post("https://api.anti-captcha.com/getTaskResult", json={"clientKey": api_key, "taskId": task_id})
            r2.raise_for_status()
            d2 = r2.json()
            if d2.get("errorId", 1) != 0:
                return None
            if d2.get("status") == "ready":
                return (d2.get("solution") or {}).get("gRecaptchaResponse")
            if d2.get("status") == "failed":
                logger.warning("anticaptcha getTaskResult: failed")
                return None

    return None
