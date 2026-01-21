"""
Celery tasks for background processing.
"""

from app.queue.celery_app import celery_app
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select
from app.core.config import settings
from app.models.search import Search, SearchResult
from app.modules.searches.providers.serpapi import fetch_search_results


# Create async engine for tasks
engine = create_async_engine(settings.DATABASE_URL)
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


@celery_app.task(name="execute_search_task")
def execute_search_task(search_id: int):
    """
    Execute search in background and save results.
    
    This is a synchronous wrapper for async function.
    """
    import asyncio
    
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    
    return loop.run_until_complete(_execute_search_async(search_id))


async def _execute_search_async(search_id: int):
    """Async function to execute search."""
    async with AsyncSessionLocal() as db:
        # Get search
        from sqlalchemy import select
        result = await db.execute(select(Search).where(Search.id == search_id))
        search = result.scalar_one_or_none()
        
        if not search:
            return {"error": "Search not found"}
        
        # Update status
        search.status = "processing"
        await db.commit()
        
        try:
            # Fetch results from SerpAPI
            results_data = await fetch_search_results(
                query=search.query,
                num_results=search.num_results,
            )
            
            # Filter blacklisted domains
            from app.modules.filters.blacklist import is_blacklisted, SEED_BLACKLIST
            
            # Get user's blacklist from DB
            from app.models.filter import BlacklistDomain
            blacklist_result = await db.execute(
                select(BlacklistDomain.domain).where(BlacklistDomain.user_id == search.user_id)
            )
            user_blacklist = [row[0] for row in blacklist_result.all()]
            all_blacklist = SEED_BLACKLIST + user_blacklist
            
            # Save results (excluding blacklisted)
            saved_count = 0
            for item in results_data:
                domain = item.get("domain", "")
                if domain and is_blacklisted(domain, all_blacklist):
                    continue  # Skip blacklisted domains
                
                result = SearchResult(
                    search_id=search.id,
                    position=item["position"],
                    title=item["title"],
                    url=item["url"],
                    snippet=item.get("snippet"),
                    domain=domain,
                )
                db.add(result)
                saved_count += 1
            
            # Update search status
            search.status = "completed"
            search.result_count = saved_count
            await db.commit()
            
            # Trigger domain processing tasks for unique domains
            unique_domains = {}
            for item in results_data:
                domain = item.get("domain", "")
                if domain and not is_blacklisted(domain, all_blacklist):
                    if domain not in unique_domains:
                        unique_domains[domain] = item["url"]
            
            # Launch domain processing tasks
            for domain, first_url in unique_domains.items():
                try:
                    process_domain_task.delay(search_id, domain, first_url)
                except Exception as e:
                    import logging
                    logging.warning(f"Failed to launch domain task for {domain}: {e}")
            
            return {
                "search_id": search_id,
                "status": "completed",
                "result_count": saved_count,
                "domains_to_process": len(unique_domains),
            }
            
        except Exception as e:
            search.status = "failed"
            await db.commit()
            return {"error": str(e)}


@celery_app.task(name="process_domain_task")
def process_domain_task(search_id: int, domain: str, first_url: str):
    """
    Process domain: crawl, extract contacts, run SEO audit.
    
    This is a synchronous wrapper for async function.
    """
    import asyncio
    
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    
    return loop.run_until_complete(_process_domain_async(search_id, domain, first_url))


async def _process_domain_async(search_id: int, domain: str, first_url: str):
    """Async function to process domain."""
    async with AsyncSessionLocal() as db:
        # Get all results for this domain in this search
        result = await db.execute(
            select(SearchResult)
            .where(SearchResult.search_id == search_id, SearchResult.domain == domain)
        )
        domain_results = result.scalars().all()
        
        if not domain_results:
            return {"error": "No results found for domain"}
        
        try:
            # 1. Mini-crawl domain
            from app.modules.filters.crawler import crawl_domain
            crawl_data = await crawl_domain(first_url, max_pages=20, timeout=30)
            
            # 2. Extract contacts
            contacts = crawl_data.get("contacts", {})
            phone = contacts.get("phone")
            email = contacts.get("email")
            
            # 3. Initialize outreach variables
            outreach_subject = None
            outreach_text = None
            
            # 4. Determine contact status
            if phone or email:
                contact_status = "found"
                # 5. Run SEO audit only if contacts found
                from app.modules.filters.seo_audit import audit_url
                audit_result = await audit_url(first_url)
                seo_score = audit_result.get("score", 0)
                audit_details = {
                    "issues": audit_result.get("issues", []),
                    "details": audit_result.get("details", {}),
                }
                
                # 6. Generate outreach text if contacts found
                from app.modules.filters.outreach import generate_outreach_text
                outreach = generate_outreach_text(
                    domain=domain,
                    seo_issues=audit_result.get("issues", []),
                    seo_score=seo_score,
                )
                outreach_subject = outreach.get("subject")
                outreach_text = outreach.get("text")
            else:
                contact_status = "no_contacts"
                seo_score = None
                audit_details = {}
            
            # 5. Update all results for this domain
            metadata = {
                "crawl": {
                    "total_pages": crawl_data.get("total_pages", 0),
                    "pages": crawl_data.get("pages", []),
                },
                "audit": audit_details,
            }
            
            for result in domain_results:
                result.phone = phone
                result.email = email
                result.contact_status = contact_status
                result.seo_score = seo_score
                result.outreach_subject = outreach_subject
                result.outreach_text = outreach_text
                result.extra_data = metadata
            
            await db.commit()
            
            return {
                "domain": domain,
                "contact_status": contact_status,
                "seo_score": seo_score,
                "phone": phone,
                "email": email,
                "results_updated": len(domain_results),
            }
            
        except Exception as e:
            # Mark as failed
            for result in domain_results:
                result.contact_status = "failed"
                result.extra_data = {"error": str(e)}
            await db.commit()
            return {"error": str(e), "domain": domain}
