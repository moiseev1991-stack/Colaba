"""
Monitor module router.
Mock API for Live API Requests Table (demo).
"""

import random
from datetime import datetime, timezone
from fastapi import APIRouter

router = APIRouter(prefix="/monitor", tags=["monitor"])

_BASE_REQUESTS = [
    {"id": "1", "method": "GET", "url": "https://api.example.com/users", "phone": "+7 999 123-45-67"},
    {"id": "2", "method": "POST", "url": "https://api.example.com/orders", "phone": "+7 999 234-56-78"},
    {"id": "3", "method": "GET", "url": "https://api.example.com/products", "phone": "+7 999 345-67-89"},
    {"id": "4", "method": "PUT", "url": "https://api.example.com/users/42", "phone": "+7 999 456-78-90"},
    {"id": "5", "method": "GET", "url": "https://api.example.com/health", "phone": None},
    {"id": "6", "method": "DELETE", "url": "https://api.example.com/sessions/abc", "phone": "+7 999 567-89-01"},
    {"id": "7", "method": "POST", "url": "https://api.example.com/webhooks", "phone": "+7 999 678-90-12"},
    {"id": "8", "method": "GET", "url": "https://api.example.com/config", "phone": None},
]


@router.get("/requests")
async def get_monitor_requests() -> dict:
    """
    Mock endpoint for Request Monitor.
    Returns a list of requests with randomized response_time_ms and ok.
    ~10–15% of rows have ok=false; when false, response time tends to be higher.
    """
    now = datetime.now(timezone.utc)
    requests = []
    for r in _BASE_REQUESTS:
        # 10–15% ok=false
        ok = random.random() > 0.12
        if ok:
            response_time_ms = random.randint(35, 280)
        else:
            response_time_ms = random.randint(180, 600)
        requests.append({
            "id": r["id"],
            "method": r["method"],
            "url": r["url"],
            "response_time_ms": response_time_ms,
            "phone": r["phone"],
            "ok": ok,
        })
    return {
        "updated_at": now.isoformat(),
        "requests": requests,
    }
