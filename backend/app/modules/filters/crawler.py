"""
Mini-crawler for SEO audit (up to 20 pages).
"""

import re
import asyncio
import logging
from typing import List, Dict, Any, Set, Optional
from urllib.parse import urljoin, urlparse
import httpx
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)


CONTACT_URL_PATTERNS = [
    "/contact",
    "/contacts",
    "/about-company",
    "/o-kompanii",
    "/o-nas",
    "/contact-us",
]

PHONE_PATTERNS = [
    re.compile(r"\+7\s*\(?\d{3}\)?\s*[\s\-]?\d{3}[-\s]?\d{2}[-\s]?\d{2}"),
    re.compile(r"8\s*\(?\d{3}\)?\s*[\s\-]?\d{3}[-\s]?\d{2}[-\s]?\d{2}"),
]

EMAIL_PATTERN = re.compile(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}")


async def check_robots_txt(client: httpx.AsyncClient, base_url: str) -> Dict[str, Any]:
    """
    Check robots.txt for SEO audit.

    Returns:
        Dict with robots_txt status, sitemap presence, and disallow status
    """
    parsed = urlparse(base_url)
    robots_url = f"{parsed.scheme}://{parsed.netloc}/robots.txt"

    result = {
        "robots_txt": "missing",
        "sitemap_in_robots": False,
        "disallow_all": False,
        "robots_content": None,
    }

    try:
        response = await client.get(robots_url, timeout=10.0)
        if response.status_code == 200:
            result["robots_txt"] = "exists"
            content = response.text
            result["robots_content"] = content[:500]  # Store first 500 chars

            # Check for sitemap
            if "Sitemap:" in content:
                result["sitemap_in_robots"] = True

            # Check if all pages are disallowed
            if "User-agent: *" in content and "Disallow: /" in content:
                result["disallow_all"] = True
    except Exception as e:
        logger.debug(f"Failed to fetch robots.txt for {base_url}: {e}")

    return result


def calculate_seo_score(seo_data: Dict[str, Any], pages_data: List[Dict[str, Any]]) -> tuple:
    """
    Calculate SEO score based on crawl data.

    Args:
        seo_data: SEO data from robots.txt check
        pages_data: List of crawled pages with meta info

    Returns:
        Tuple of (score, issues_list, details_dict)
    """
    score = 100
    issues = []
    details = {}

    # Robots.txt checks
    if seo_data.get("robots_txt") == "missing":
        score -= 10
        issues.append("no_robots_txt")
        details["robots_txt"] = "missing"
    else:
        details["robots_txt"] = "exists"

    if seo_data.get("disallow_all"):
        score -= 20
        issues.append("robots_disallow_all")

    if not seo_data.get("sitemap_in_robots"):
        score -= 5
        issues.append("no_sitemap_in_robots")

    # Analyze pages for SEO issues
    titles = []
    descriptions = []
    empty_titles = 0
    empty_descriptions = 0
    missing_h1 = 0
    multiple_h1 = 0

    for page in pages_data:
        title = page.get("title")
        desc = page.get("meta_description")
        h1_count = page.get("h1_count", 0)

        if not title or not title.strip():
            empty_titles += 1
        else:
            titles.append(title.strip().lower())

        if not desc or not desc.strip():
            empty_descriptions += 1
        else:
            descriptions.append(desc.strip().lower())

        if h1_count == 0:
            missing_h1 += 1
        elif h1_count > 1:
            multiple_h1 += 1

    # Calculate duplicates
    title_duplicates = len(titles) - len(set(titles))
    desc_duplicates = len(descriptions) - len(set(descriptions))

    total_pages = len(pages_data) if pages_data else 1

    # Score penalties for page issues
    if empty_titles > 0:
        penalty = min(15, empty_titles * 5)
        score -= penalty
        if empty_titles == total_pages:
            issues.append("empty_meta_title")

    if empty_descriptions > 0:
        penalty = min(10, empty_descriptions * 3)
        score -= penalty
        if empty_descriptions == total_pages:
            issues.append("empty_meta_description")

    if missing_h1 > 0:
        penalty = min(10, missing_h1 * 3)
        score -= penalty
        if missing_h1 == total_pages:
            issues.append("no_h1")

    if multiple_h1 > 0:
        score -= 5
        issues.append("multiple_h1")

    # Store stats in details
    details["title_stats"] = {
        "empty": empty_titles,
        "duplicates": title_duplicates,
        "total": len(titles) + empty_titles,
    }
    details["desc_stats"] = {
        "empty": empty_descriptions,
        "duplicates": desc_duplicates,
        "total": len(descriptions) + empty_descriptions,
    }
    details["h1_stats"] = {
        "missing": missing_h1,
        "multiple": multiple_h1,
        "total": total_pages,
    }

    # Ensure score is between 0 and 100
    score = max(0, min(100, score))

    return score, issues, details


async def fetch_page_with_retry(
    client: httpx.AsyncClient,
    url: str,
    max_retries: int = 3,
    base_delay: float = 1.0,
) -> Optional[httpx.Response]:
    """
    Fetch page with exponential backoff retry.
    
    Args:
        client: httpx AsyncClient
        url: URL to fetch
        max_retries: Maximum number of retry attempts
        base_delay: Base delay in seconds for exponential backoff
    
    Returns:
        Response object or None if all retries failed
    """
    last_exception = None
    
    for attempt in range(max_retries):
        try:
            response = await client.get(url)
            
            # Handle different status codes
            if response.status_code == 200:
                return response
            elif response.status_code == 403:
                # Forbidden - might be rate limiting or captcha
                logger.warning(f"403 Forbidden for {url} (attempt {attempt + 1}/{max_retries})")
                if attempt < max_retries - 1:
                    delay = base_delay * (2 ** attempt)
                    await asyncio.sleep(delay)
                    continue
                else:
                    logger.error(f"Failed to fetch {url} after {max_retries} attempts: 403 Forbidden")
                    return None
            elif response.status_code == 429:
                # Rate limited - wait longer
                logger.warning(f"429 Rate Limited for {url} (attempt {attempt + 1}/{max_retries})")
                if attempt < max_retries - 1:
                    delay = base_delay * (2 ** attempt) * 2  # Double delay for rate limits
                    await asyncio.sleep(delay)
                    continue
                else:
                    logger.error(f"Failed to fetch {url} after {max_retries} attempts: 429 Rate Limited")
                    return None
            elif response.status_code in (404, 410):
                # Not found - don't retry
                logger.debug(f"404/410 for {url}")
                return None
            elif response.status_code >= 500:
                # Server error - retry
                logger.warning(f"Server error {response.status_code} for {url} (attempt {attempt + 1}/{max_retries})")
                if attempt < max_retries - 1:
                    delay = base_delay * (2 ** attempt)
                    await asyncio.sleep(delay)
                    continue
                else:
                    logger.error(f"Failed to fetch {url} after {max_retries} attempts: {response.status_code}")
                    return None
            else:
                # Other status codes - don't retry
                logger.debug(f"Status {response.status_code} for {url}")
                return None
                
        except httpx.TimeoutException as e:
            last_exception = e
            logger.warning(f"Timeout for {url} (attempt {attempt + 1}/{max_retries})")
            if attempt < max_retries - 1:
                delay = base_delay * (2 ** attempt)
                await asyncio.sleep(delay)
                continue
            else:
                logger.error(f"Timeout for {url} after {max_retries} attempts")
                return None
                
        except httpx.RequestError as e:
            last_exception = e
            logger.warning(f"Request error for {url} (attempt {attempt + 1}/{max_retries}): {e}")
            if attempt < max_retries - 1:
                delay = base_delay * (2 ** attempt)
                await asyncio.sleep(delay)
                continue
            else:
                logger.error(f"Request error for {url} after {max_retries} attempts: {e}")
                return None
                
        except Exception as e:
            last_exception = e
            logger.error(f"Unexpected error for {url} (attempt {attempt + 1}/{max_retries}): {e}")
            if attempt < max_retries - 1:
                delay = base_delay * (2 ** attempt)
                await asyncio.sleep(delay)
                continue
            else:
                logger.error(f"Unexpected error for {url} after {max_retries} attempts: {e}")
                return None
    
    return None


async def crawl_domain_with_fallback(
    base_url: str,
    max_pages: int = 20,
    timeout: int = 30,
    max_retries: int = 3,
    use_cache: bool = True,
) -> Dict[str, Any]:
    """
    Crawl domain with fallback strategies.
    
    If main crawl fails, tries fallback approaches:
    1. Try cached data (if available)
    2. Try minimal crawl (just base URL)
    3. Return minimal data structure
    """
    # Try main crawl first
    try:
        result = await crawl_domain(
            base_url=base_url,
            max_pages=max_pages,
            timeout=timeout,
            max_retries=max_retries,
            use_cache=use_cache,
        )
        
        # If we got at least one page, return result
        if result.get("total_pages", 0) > 0:
            return result
    except Exception as e:
        logger.warning(f"Main crawl failed for {base_url}: {e}")
    
    # Fallback 1: Try minimal crawl (just base URL, fewer retries)
    try:
        logger.info(f"Trying minimal crawl for {base_url}")
        result = await crawl_domain(
            base_url=base_url,
            max_pages=1,  # Only try base URL
            timeout=timeout,
            max_retries=1,  # Single attempt
            use_cache=False,  # Don't use cache for fallback
        )
        
        if result.get("total_pages", 0) > 0:
            logger.info(f"Minimal crawl succeeded for {base_url}")
            return result
    except Exception as e:
        logger.warning(f"Minimal crawl failed for {base_url}: {e}")
    
    # Fallback 2: Return minimal structure with base URL only
    logger.warning(f"All crawl attempts failed for {base_url}, returning minimal data")
    base_domain = urlparse(base_url).netloc
    return {
        "pages": [{
            "url": base_url,
            "status_code": None,
            "title": None,
            "meta_description": None,
            "h1_count": 0,
            "h1_text": None,
        }],
        "total_pages": 1,
        "contacts": {"phone": None, "email": None},
        "base_domain": base_domain,
        "errors": [{"url": base_url, "error": "All crawl attempts failed"}],
        "errors_count": 1,
        "fallback_used": True,
        "seo": {
            "score": 0,
            "issues": ["crawl_failed"],
            "details": {"error": "All crawl attempts failed"},
            "robots_txt": "unknown",
            "sitemap_in_robots": False,
            "disallow_all": False,
        },
    }


async def crawl_domain(
    base_url: str,
    max_pages: int = 20,
    timeout: int = 30,
    max_retries: int = 3,
    use_cache: bool = True,
) -> Dict[str, Any]:
    """
    Crawl domain up to max_pages using BFS with retry logic and error handling.
    Also collects SEO data for automatic audit.

    Args:
        base_url: Starting URL to crawl
        max_pages: Maximum number of pages to crawl
        timeout: Request timeout in seconds
        max_retries: Maximum retry attempts per page
        use_cache: Whether to use cached results if available

    Returns:
        Dict with pages data, contacts, SEO data, and metadata
    """
    base_domain = urlparse(base_url).netloc

    # Try to get from cache first
    if use_cache:
        try:
            from app.modules.filters.cache import get_cached_crawl
            cached_data = await get_cached_crawl(base_domain)
            if cached_data:
                logger.info(f"Using cached crawl data for {base_domain}")
                return cached_data
        except Exception as e:
            logger.warning(f"Failed to check cache for {base_domain}: {e}")

    visited: Set[str] = set()
    to_visit: List[str] = [base_url]
    pages_data: List[Dict[str, Any]] = []
    contacts: Dict[str, Any] = {"phone": None, "email": None}
    errors: List[Dict[str, Any]] = []
    seo_data: Dict[str, Any] = {}

    # Configure httpx client with better defaults
    limits = httpx.Limits(max_keepalive_connections=10, max_connections=20)
    timeout_config = httpx.Timeout(timeout, connect=5.0)

    async with httpx.AsyncClient(
        timeout=timeout_config,
        follow_redirects=True,
        limits=limits,
        headers={
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
    ) as client:
        # Check robots.txt for SEO audit (only once at the start)
        seo_data = await check_robots_txt(client, base_url)

        while to_visit and len(visited) < max_pages:
            url = to_visit.pop(0)

            if url in visited:
                continue

            # Fetch page with retry
            response = await fetch_page_with_retry(client, url, max_retries=max_retries)

            if response is None:
                errors.append({
                    "url": url,
                    "error": "Failed to fetch after retries"
                })
                continue

            try:
                visited.add(url)
                content = response.text
                soup = BeautifulSoup(content, 'html.parser')

                # Extract meta tags
                title = soup.find('title')
                meta_desc = soup.find('meta', attrs={'name': 'description'})
                h1_tags = soup.find_all('h1')

                page_data = {
                    "url": url,
                    "status_code": response.status_code,
                    "title": title.get_text().strip() if title else None,
                    "meta_description": meta_desc.get('content').strip() if meta_desc and meta_desc.get('content') else None,
                    "h1_count": len(h1_tags),
                    "h1_text": h1_tags[0].get_text().strip() if h1_tags else None,
                }
                pages_data.append(page_data)

                # Extract contacts (priority: phone > email)
                if not contacts["phone"]:
                    phone = extract_phone(content)
                    if phone:
                        contacts["phone"] = phone

                if not contacts["email"]:
                    email = extract_email(content)
                    if email:
                        contacts["email"] = email

                # Find internal links
                if len(visited) < max_pages:
                    links = extract_internal_links(soup, base_url, base_domain)
                    for link in links:
                        if link not in visited and link not in to_visit:
                            to_visit.append(link)

            except Exception as e:
                logger.error(f"Error processing page {url}: {e}")
                errors.append({
                    "url": url,
                    "error": str(e)
                })
                continue

    # Calculate SEO score from collected data
    seo_score, seo_issues, seo_details = calculate_seo_score(seo_data, pages_data)

    result = {
        "pages": pages_data,
        "total_pages": len(pages_data),
        "contacts": contacts,
        "base_domain": base_domain,
        "errors": errors,
        "errors_count": len(errors),
        "seo": {
            "score": seo_score,
            "issues": seo_issues,
            "details": seo_details,
            "robots_txt": seo_data.get("robots_txt"),
            "sitemap_in_robots": seo_data.get("sitemap_in_robots"),
            "disallow_all": seo_data.get("disallow_all"),
        },
    }

    # Cache successful results (if we got at least some pages)
    if use_cache and len(pages_data) > 0:
        try:
            from app.modules.filters.cache import set_cached_crawl
            await set_cached_crawl(base_domain, result)
        except Exception as e:
            logger.warning(f"Failed to cache crawl results for {base_domain}: {e}")

    return result


def extract_phone(text: str) -> str | None:
    """Extract phone number from text."""
    for pattern in PHONE_PATTERNS:
        match = pattern.search(text)
        if match:
            return match.group(0)
    return None


def extract_email(text: str) -> str | None:
    """Extract email from text."""
    match = EMAIL_PATTERN.search(text)
    if match:
        return match.group(0)
    return None


def extract_internal_links(soup: BeautifulSoup, base_url: str, base_domain: str) -> List[str]:
    """Extract internal links from page."""
    links = []
    
    for a_tag in soup.find_all('a', href=True):
        href = a_tag['href']
        
        # Skip non-HTML files
        if re.search(r'\.(pdf|doc|docx|xls|xlsx|zip|rar|jpg|png|gif)$', href, re.I):
            continue
        
        # Skip special links
        if href.startswith(('mailto:', 'tel:', 'javascript:', '#')):
            continue
        
        # Convert relative to absolute
        full_url = urljoin(base_url, href)
        parsed = urlparse(full_url)
        
        # Only internal links
        if parsed.netloc == base_domain or parsed.netloc == '':
            # Remove query strings and fragments
            clean_url = f"{parsed.scheme}://{parsed.netloc}{parsed.path}"
            if clean_url not in links:
                links.append(clean_url)
    
    return links
