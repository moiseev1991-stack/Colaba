"""
Yandex Cloud Search API (web search) через yandex_cloud_ml_sdk.

Дока: https://yandex.cloud/ru/docs/search-api/quickstart
Нужны: folder_id (идентификатор каталога), api_key (API-ключ сервисного аккаунта).
"""

import asyncio
from typing import List, Dict, Any, Optional
from urllib.parse import urlparse
from xml.etree import ElementTree as ET


USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/132.0.0.0 YaBrowser/25.2.0.0 Safari/537.36"
)


def _is_permission_denied(err: BaseException) -> bool:
    s = str(err)
    try:
        d = getattr(err, "details", None)
        if callable(d):
            s = f"{s} {d()}"
        elif isinstance(d, str):
            s = f"{s} {d}"
    except Exception:
        pass
    return (
        "Permission denied" in s
        or "PERMISSION_DENIED" in s
        or "grpc_status:7" in s
        or "StatusCode.PERMISSION_DENIED" in s
    )


def _fetch_page_sync(folder_id: str, api_key: str, query: str, page: int) -> bytes:
    """Синхронный вызов SDK: одна страница в XML. Блокирует — вызывать из to_thread."""
    from yandex_cloud_ml_sdk import YCloudML
    # Public API (0.19+ moved away from private _auth module)
    from yandex_cloud_ml_sdk.auth import APIKeyAuth

    auth = APIKeyAuth(api_key=api_key)
    sdk = YCloudML(folder_id=folder_id, auth=auth)
    try:
        sdk.setup_default_logging("error")
    except Exception:
        pass
    try:
        search = sdk.search_api.web(search_type="ru", user_agent=USER_AGENT)
        operation = search.run_deferred(query, format="xml", page=page)
        return operation.wait(poll_interval=1)
    except Exception as e:
        if _is_permission_denied(e):
            raise ValueError(
                "Yandex Cloud Search API: Permission denied. Часто: 1) Нужен «Создать API-ключ» у СА (не «Статический ключ доступа»), ключ AQVN...; "
                "2) роли «Редактор» или «ai.editor» на каталог у этого СА; 3) folder_id = ID того же каталога. Подробно: docs/guides/YANDEX_XML_SETUP.md"
            ) from e
        raise


def _parse_xml_results(xml_bytes: bytes, page: int) -> List[Dict[str, Any]]:
    """Парсит XML из Search API в список {position, title, url, snippet, domain}."""
    results = []
    try:
        root = ET.fromstring(xml_bytes.decode("utf-8"))
    except Exception as e:
        raise ValueError(f"Yandex Cloud Search API: не удалось разобрать XML: {e}") from e

    error = root.find(".//error")
    if error is not None:
        code = error.get("code", "unknown")
        text = error.text or "Unknown error"
        raise ValueError(f"Yandex Cloud Search API error {code}: {text}")

    response_elem = root.find(".//response")
    if response_elem is None:
        return results

    groups = response_elem.findall(".//group")
    for idx, group in enumerate(groups, start=page * 10 + 1):
        doc = group.find(".//doc")
        if doc is None:
            continue
        url_elem = doc.find(".//url")
        title_elem = doc.find(".//title")
        snippet_elem = doc.find(".//passages/passage") or doc.find(".//headline")
        url = (url_elem.text or "").strip() if url_elem is not None else ""
        title = (title_elem.text or "").strip() if title_elem is not None else ""
        snippet = (snippet_elem.text or "").strip() if snippet_elem is not None and snippet_elem.text else ""
        domain = urlparse(url).netloc if url else ""
        results.append({"position": idx, "title": title, "url": url, "snippet": snippet, "domain": domain})

    return results


async def fetch_search_results(
    query: str,
    num_results: int = 50,
    region: int = 213,
    page: int = 0,
    provider_config: Optional[dict] = None,
    **kwargs,
) -> List[Dict[str, Any]]:
    """
    Результаты веб-поиска через Yandex Cloud Search API (yandex_cloud_ml_sdk).
    Провайдер «Яндекс XML»: folder_id и api_key из provider_config или YANDEX_XML_FOLDER_ID, YANDEX_XML_KEY.
    """
    from app.core.config import settings

    cfg = provider_config or {}
    folder_id = (cfg.get("folder_id") or getattr(settings, "YANDEX_XML_FOLDER_ID", None) or "").strip()
    api_key = (cfg.get("api_key") or getattr(settings, "YANDEX_XML_KEY", None) or "").strip()

    if not folder_id or not api_key:
        raise ValueError(
            "Yandex Cloud Search API не настроен. Укажите в Провайдеры → Яндекс XML: "
            "«Идентификатор каталога» (folder_id) и «API-ключ» (сервисного аккаунта). "
            "Дока: https://yandex.cloud/ru/docs/search-api/quickstart"
        )

    num_results = min(num_results, 100)
    all_results = []
    pages_needed = (num_results + 9) // 10

    for page_num in range(pages_needed):
        xml_bytes = await asyncio.to_thread(
            _fetch_page_sync, folder_id, api_key, query, page_num
        )
        page_results = _parse_xml_results(xml_bytes, page_num)
        all_results.extend(page_results)
        if len(page_results) < 10:
            break
        if len(all_results) >= num_results:
            break

    return all_results[:num_results]
