"""
Mini-crawler for SEO audit (up to 20 pages).
"""

import re
from typing import List, Dict, Any, Set
from urllib.parse import urljoin, urlparse
import httpx
from bs4 import BeautifulSoup


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


async def crawl_domain(
    base_url: str,
    max_pages: int = 20,
    timeout: int = 30,
) -> Dict[str, Any]:
    """
    Crawl domain up to max_pages using BFS.
    
    Returns:
        Dict with pages data, contacts, and metadata
    """
    visited: Set[str] = set()
    to_visit: List[str] = [base_url]
    pages_data: List[Dict[str, Any]] = []
    contacts: Dict[str, Any] = {"phone": None, "email": None}
    
    base_domain = urlparse(base_url).netloc
    
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
        while to_visit and len(visited) < max_pages:
            url = to_visit.pop(0)
            
            if url in visited:
                continue
            
            try:
                response = await client.get(url)
                if response.status_code != 200:
                    continue
                
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
                    "title": title.get_text() if title else None,
                    "meta_description": meta_desc.get('content') if meta_desc else None,
                    "h1_count": len(h1_tags),
                    "h1_text": h1_tags[0].get_text() if h1_tags else None,
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
                continue
    
    return {
        "pages": pages_data,
        "total_pages": len(pages_data),
        "contacts": contacts,
        "base_domain": base_domain,
    }


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
