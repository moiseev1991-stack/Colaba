"""
Caching utilities for crawler results.
"""

import json
import hashlib
import asyncio
from typing import Dict, Any, Optional
import redis.asyncio as redis
from app.core.config import settings

# Redis connection pool (will be initialized on first use)
_redis_client: Optional[redis.Redis] = None


async def get_redis_client() -> redis.Redis:
    """Get or create Redis client."""
    global _redis_client
    if _redis_client is None:
        _redis_client = redis.from_url(
            settings.REDIS_URL,
            encoding="utf-8",
            decode_responses=True  # Decode to strings for easier JSON handling
        )
    return _redis_client


def get_cache_key(domain: str, cache_type: str = "crawl") -> str:
    """
    Generate cache key for domain.
    
    Args:
        domain: Domain name
        cache_type: Type of cache (crawl, audit, etc.)
    
    Returns:
        Cache key string
    """
    # Normalize domain (remove protocol, www, trailing slash)
    normalized = domain.lower().replace("https://", "").replace("http://", "").replace("www.", "").rstrip("/")
    key_hash = hashlib.md5(f"{cache_type}:{normalized}".encode()).hexdigest()
    return f"crawler:{cache_type}:{key_hash}"


async def get_cached_crawl(domain: str) -> Optional[Dict[str, Any]]:
    """
    Get cached crawl results for domain.
    
    Args:
        domain: Domain name
    
    Returns:
        Cached crawl data or None
    """
    try:
        client = await get_redis_client()
        key = get_cache_key(domain, "crawl")
        cached_data = await client.get(key)
        
        if cached_data:
            return json.loads(cached_data)
    except Exception as e:
        import logging
        logging.warning(f"Failed to get cached crawl for {domain}: {e}")
    
    return None


async def set_cached_crawl(domain: str, crawl_data: Dict[str, Any], ttl: int = 3600 * 24):
    """
    Cache crawl results for domain.
    
    Args:
        domain: Domain name
        crawl_data: Crawl results data
        ttl: Time to live in seconds (default: 24 hours)
    """
    try:
        client = await get_redis_client()
        key = get_cache_key(domain, "crawl")
        # Remove errors from cached data (they're transient)
        cache_data = {k: v for k, v in crawl_data.items() if k != "errors"}
        await client.setex(key, ttl, json.dumps(cache_data, ensure_ascii=False))
    except Exception as e:
        import logging
        logging.warning(f"Failed to cache crawl for {domain}: {e}")


async def invalidate_crawl_cache(domain: str):
    """
    Invalidate cached crawl for domain.
    
    Args:
        domain: Domain name
    """
    try:
        client = await get_redis_client()
        key = get_cache_key(domain, "crawl")
        await client.delete(key)
    except Exception as e:
        import logging
        logging.warning(f"Failed to invalidate cache for {domain}: {e}")
