#!/usr/bin/env python3
"""
Script for testing SEO collection through the API.
"""
import requests
import time
import json

BASE_URL = "http://localhost:8001/api/v1"

def login_and_get_token():
    """Login and get auth token"""
    response = requests.post(f"{BASE_URL}/auth/login", json={
        "username": "admin",
        "password": "admin123"
    }, timeout=10)
    if response.status_code == 200:
        return response.json().get("access_token")
    return None

def create_search_and_check_seo():
    """Create search and verify SEO data is in results"""
    token = login_and_get_token()
    if not token:
        print("Failed to login")
        return
    
    headers = {"Authorization": f"Bearer {token}"}
    
    # Create search
    print("Creating search...")
    response = requests.post(
        f"{BASE_URL}/searches",
        json={
            "query": "test SEO optimization",
            "search_provider": "duckduckgo",
            "num_results": 3
        },
        headers=headers,
        timeout=30
    )
    
    if response.status_code != 201:
        print(f"Failed to create search: {response.status_code}")
        print(response.text)
        return
    
    search_data = response.json()
    search_id = search_data["id"]
    print(f"Search created with ID: {search_id}")
    print(f"Status: {search_data['status']}")
    
    # Poll for results
    print("\nPolling for results...")
    max_attempts = 60  # 5 minutes max
    for attempt in range(max_attempts):
        time.sleep(5)
        response = requests.get(
            f"{BASE_URL}/searches/{search_id}",
            headers=headers,
            timeout=10,
        )
        search_data = response.json()
        status = search_data.get("status")
        result_count = search_data.get("result_count", 0)
        print(f"  Attempt {attempt + 1}: status={status}, result_count={result_count}")
        if status == "completed":
            break
    else:
        print("\nSearch did not complete in time")
        return
    
    # Get results
    print("\nFetching results...")
    response = requests.get(
        f"{BASE_URL}/searches/{search_id}/results",
        headers=headers,
        timeout=10,
    )
    
    if response.status_code != 200:
        print(f"Failed to get results: {response.status_code}")
        print(response.text)
        return
    
    results = response.json()
    print(f"\nFound {len(results)} results")
    
    for i, result in enumerate(results[:5]):
        print(f"\n--- Result {i + 1} ---")
        print(f"  Domain: {result.get('domain')}")
        print(f"  SEO Score: {result.get('seo_score')}")
        print(f"  Phone: {result.get('phone')}")
        print(f"  Email: {result.get('email')}")
        extra_data = result.get('extra_data', {})
        audit = extra_data.get('audit', {})
        if audit:
            print(f"  Audit issues: {audit.get('issues', [])}")
            print(f"  Audit details keys: {list(audit.get('details', {}).keys())}")
        else:
            print(f"  Audit: Not present")
    
    # Summary
    print("\n=== SUMMARY ===")
    results_with_seo = [r for r in results if r.get('seo_score') is not None]
    results_without_seo = [r for r in results if r.get('seo_score') is None]
    print(f"Results with SEO score: {len(results_with_seo)}/{len(results)}")
    print(f"Results without SEO score: {len(results_without_seo)}/{len(results)}")
    
    if results_with_seo:
        print("\nSUCCESS! SEO data is being collected automatically!")
    else:
        print("\nWARNING: No SEO data found in results!")

if __name__ == "__main__":
    try:
        create_search_and_check_seo()
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
