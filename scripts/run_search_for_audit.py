#!/usr/bin/env python3
"""Run one search (Yandex XML) and wait for completion. Saves search_id to tmp_search_id.txt for log parsing."""
import json
import time
import urllib.request
import urllib.error
import sys

BASE = "http://127.0.0.1:8001/api/v1"

def req(method, path, data=None, token=None, timeout=30):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    body = json.dumps(data).encode() if data else None
    r = urllib.request.Request(f"{BASE}{path}", data=body, headers=headers, method=method)
    with urllib.request.urlopen(r, timeout=timeout) as res:
        return json.loads(res.read().decode())

def main():
    # Wait for backend
    for attempt in range(12):
        try:
            req("POST", "/auth/login", {"email": "test@example.com", "password": "test123456"}, timeout=10)
            break
        except (urllib.error.URLError, OSError) as e:
            print(f"Backend not ready ({attempt+1}/12): {e}")
            time.sleep(5)
    else:
        print("Backend did not become ready")
        sys.exit(1)

    print("Login...")
    token = req("POST", "/auth/login", {"email": "test@example.com", "password": "test123456"})["access_token"]
    print("Create search 'МФЦ Кемерово' num_results=100 (yandex_xml, как в замере 105 доменов)...")
    try:
        search = req("POST", "/searches", {"query": "МФЦ Кемерово", "search_provider": "yandex_xml", "num_results": 100}, token=token)
    except urllib.error.HTTPError as e:
        print(f"Create search failed: {e.code} {e.read().decode()}")
        sys.exit(1)
    sid = search["id"]
    with open("tmp_search_id.txt", "w") as f:
        f.write(str(sid))
    print(f"Search id={sid}, status={search.get('status')}")
    print("Waiting for search results (status=completed)...")
    for i in range(60):
        time.sleep(10)
        try:
            s = req("GET", f"/searches/{sid}", token=token)
        except urllib.error.HTTPError as e:
            if e.code == 401:
                print("Token expired, re-login...")
                token = req("POST", "/auth/login", {"email": "test@example.com", "password": "test123456"})["access_token"]
                s = req("GET", f"/searches/{sid}", token=token)
            else:
                raise
        st = s.get("status")
        rc = s.get("result_count", 0)
        if st == "failed":
            print("Search failed.")
            return
        if st == "completed":
            print(f"  Results saved: {rc} domains. Waiting for audit (crawl+SEO) on all...")
            break
        print(f"  {i+1}: status={st}, result_count={rc}")
    else:
        print("Timeout waiting for search.")
        sys.exit(1)

    # Wait for domain tasks: poll results until all have contact_status set (audit done)
    print("Waiting for domain audit (poll every 20s, max ~30 min)...")
    for i in range(90):
        time.sleep(20)
        try:
            results = req("GET", f"/searches/{sid}/results", token=token)
        except urllib.error.HTTPError as e:
            if e.code == 401:
                token = req("POST", "/auth/login", {"email": "test@example.com", "password": "test123456"})["access_token"]
                results = req("GET", f"/searches/{sid}/results", token=token)
            else:
                raise
        total = len(results)
        done = sum(1 for r in results if r.get("contact_status") is not None)
        print(f"  {i+1}: audited {done}/{total} domains")
        if total > 0 and done >= total:
            print("Done. All domains audited.")
            return
    print("Timeout (audit may still be running).")

if __name__ == "__main__":
    main()
