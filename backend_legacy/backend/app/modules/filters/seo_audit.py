"""
SEO audit module for checking website SEO issues.
"""

import httpx
from typing import Dict, Any, List
from urllib.parse import urljoin, urlparse
from bs4 import BeautifulSoup


async def audit_url(url: str) -> Dict[str, Any]:
    """
    Perform SEO audit for a URL.
    
    Args:
        url: URL to audit
    
    Returns:
        Dict with url, score (0-100), issues list, and details
    """
    issues: List[str] = []
    details: Dict[str, Any] = {}
    score = 100  # Start with perfect score
    
    parsed = urlparse(url)
    base_url = f"{parsed.scheme}://{parsed.netloc}"
    
    async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
        try:
            # 1. Check robots.txt
            robots_url = urljoin(base_url, "/robots.txt")
            try:
                robots_resp = await client.get(robots_url, timeout=10.0)
                if robots_resp.status_code == 200:
                    robots_content = robots_resp.text
                    details["robots_txt"] = "exists"
                    
                    # Check if all pages are disallowed
                    if "User-agent: *" in robots_content and "Disallow: /" in robots_content:
                        issues.append("robots_disallow_all")
                        score -= 20
                    
                    # Check for sitemap
                    if "Sitemap:" not in robots_content:
                        issues.append("no_sitemap_in_robots")
                        score -= 5
                else:
                    issues.append("no_robots_txt")
                    score -= 10
                    details["robots_txt"] = "missing"
            except Exception:
                issues.append("no_robots_txt")
                score -= 10
                details["robots_txt"] = "missing"
            
            # 2. Check main page
            try:
                page_resp = await client.get(url, timeout=10.0)
                page_resp.raise_for_status()
                html = page_resp.text
                soup = BeautifulSoup(html, "html.parser")
                
                # Check meta title
                meta_title = soup.find("title")
                if not meta_title or not meta_title.string or not meta_title.string.strip():
                    issues.append("empty_meta_title")
                    score -= 15
                    details["meta_title"] = "empty"
                else:
                    details["meta_title"] = meta_title.string.strip()[:100]
                
                # Check meta description
                meta_desc = soup.find("meta", attrs={"name": "description"})
                if not meta_desc or not meta_desc.get("content") or not meta_desc.get("content").strip():
                    issues.append("empty_meta_description")
                    score -= 10
                    details["meta_description"] = "empty"
                else:
                    details["meta_description"] = meta_desc.get("content", "").strip()[:200]
                
                # Check H1 tags
                h1_tags = soup.find_all("h1")
                if len(h1_tags) == 0:
                    issues.append("no_h1")
                    score -= 10
                    details["h1_count"] = 0
                elif len(h1_tags) > 1:
                    issues.append("multiple_h1")
                    score -= 5
                    details["h1_count"] = len(h1_tags)
                else:
                    details["h1_count"] = 1
                    details["h1_text"] = h1_tags[0].get_text().strip()[:100]
                
            except Exception as e:
                issues.append("page_unreachable")
                score -= 30
                details["page_error"] = str(e)
            
            # Ensure score is between 0 and 100
            score = max(0, min(100, score))
            
            return {
                "url": url,
                "score": score,
                "issues": issues,
                "details": details,
            }
            
        except Exception as e:
            return {
                "url": url,
                "score": 0,
                "issues": ["audit_failed"],
                "details": {"error": str(e)},
            }
