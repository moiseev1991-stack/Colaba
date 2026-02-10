"""
Celery tasks for background processing.
"""

from app.queue.celery_app import celery_app
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select
from app.core.config import settings
from app.models.search import Search, SearchResult


# Create async engine for tasks
engine = create_async_engine(settings.DATABASE_URL)
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


@celery_app.task(name="execute_search_task", queue="search_queue")
def execute_search_task(search_id: int):
    """
    Execute search in background and save results.
    
    This is a synchronous wrapper for async function.
    """
    import asyncio
    import logging
    import sys
    logger = logging.getLogger(__name__)
    
    print(f"[DEBUG] execute_search_task started for search_id={search_id}", file=sys.stderr, flush=True)
    logger.info(f"execute_search_task started for search_id={search_id}")
    
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    
    try:
        result = loop.run_until_complete(_execute_search_async(search_id))
        print(f"[DEBUG] execute_search_task completed for search_id={search_id}: {result}", file=sys.stderr, flush=True)
        logger.info(f"execute_search_task completed for search_id={search_id}: {result}")
        return result
    except Exception as e:
        print(f"[DEBUG] execute_search_task failed for search_id={search_id}: {e}", file=sys.stderr, flush=True)
        import traceback
        traceback.print_exc(file=sys.stderr)
        logger.error(f"execute_search_task failed for search_id={search_id}: {e}", exc_info=True)
        raise


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
            # Fetch results using selected provider (без переключения на других провайдеров)
            from app.modules.providers import get_provider_config
            from app.modules.searches.providers import fetch_search_results as provider_fetch
            import asyncio

            provider_id = search.search_provider or "duckduckgo"
            provider_config = await get_provider_config(provider_id, db)

            # Filter blacklisted domains
            from app.modules.filters.blacklist import is_blacklisted, SEED_BLACKLIST
            
            # Get user's blacklist from DB
            from app.models.filter import BlacklistDomain
            blacklist_result = await db.execute(
                select(BlacklistDomain.domain).where(BlacklistDomain.user_id == search.user_id)
            )
            user_blacklist = [row[0] for row in blacklist_result.all()]
            all_blacklist = SEED_BLACKLIST + user_blacklist

            # For yandex_xml: save results page by page for real-time updates
            if provider_id == "yandex_xml":
                from app.modules.searches.providers.yandex_xml import _fetch_page_sync, _parse_xml_results
                from app.core.config import settings
                
                cfg = provider_config or {}
                folder_id = (cfg.get("folder_id") or getattr(settings, "YANDEX_XML_FOLDER_ID", None) or "").strip()
                api_key = (cfg.get("api_key") or getattr(settings, "YANDEX_XML_KEY", None) or "").strip()
                
                if not folder_id or not api_key:
                    raise ValueError(
                        "Yandex Cloud Search API не настроен. Укажите в Провайдеры → Яндекс XML: "
                        "«Идентификатор каталога» (folder_id) и «API-ключ» (сервисного аккаунта)."
                    )
                
                num_results = min(search.num_results, 100)
                pages_needed = (num_results + 9) // 10
                all_results_data = []
                saved_count = 0
                unique_domains = {}
                # Параллельная загрузка страниц батчами по 3 для ускорения (без перегрузки API)
                PAGE_BATCH_SIZE = 3
                page_num = 0
                while page_num < pages_needed:
                    batch_pages = list(range(page_num, min(page_num + PAGE_BATCH_SIZE, pages_needed)))
                    # Загружаем батч страниц параллельно
                    fetch_tasks = [
                        asyncio.to_thread(_fetch_page_sync, folder_id, api_key, search.query, p)
                        for p in batch_pages
                    ]
                    try:
                        xml_results_list = await asyncio.gather(*fetch_tasks, return_exceptions=True)
                    except asyncio.TimeoutError:
                        raise ValueError(
                            "Поисковая система не ответила за 120 с. "
                            "Яндекс/Google часто блокируют запросы с серверов. Включите прокси в настройках провайдера или попробуйте позже."
                        )
                    # Обрабатываем страницы батча, коммитим раз на батч (меньше round-trip в БД, UI обновляется каждые ~3 страницы)
                    batch_done = False
                    for i, (p, xml_or_err) in enumerate(zip(batch_pages, xml_results_list)):
                        if isinstance(xml_or_err, BaseException):
                            import logging
                            logging.warning(f"Error fetching page {p} for search {search.id}: {xml_or_err}")
                            continue
                        try:
                            page_results = _parse_xml_results(xml_or_err, p)
                        except Exception as parse_err:
                            import logging
                            logging.warning(f"Error parsing page {p} for search {search.id}: {parse_err}")
                            continue
                        for item in page_results:
                            domain = item.get("domain", "")
                            if domain and is_blacklisted(domain, all_blacklist):
                                continue
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
                            all_results_data.append(item)
                            if domain and domain not in unique_domains:
                                unique_domains[domain] = item["url"]
                        if len(page_results) < 10 or len(all_results_data) >= num_results:
                            batch_done = True
                            break
                    await db.commit()
                    if batch_done:
                        page_num = pages_needed
                    else:
                        page_num += len(batch_pages)
                    if len(all_results_data) >= num_results:
                        break
                
                results_data = all_results_data[:num_results]
            else:
                # For other providers: fetch all results at once (original behavior)
                try:
                    results_data = await asyncio.wait_for(
                        provider_fetch(
                            provider=provider_id,
                            query=search.query,
                            num_results=search.num_results,
                            enable_fallback=False,
                            provider_config=provider_config,
                            db=db,
                        ),
                        timeout=120.0,
                    )
                except asyncio.TimeoutError:
                    raise ValueError(
                        "Поисковая система не ответила за 120 с. "
                        "Яндекс/Google часто блокируют запросы с серверов. Включите прокси в настройках провайдера или попробуйте позже."
                    )
                
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
                
                # Track unique domains for other providers
                unique_domains = {}
                for item in results_data:
                    domain = item.get("domain", "")
                    if domain and not is_blacklisted(domain, all_blacklist):
                        if domain not in unique_domains:
                            unique_domains[domain] = item["url"]
            
            # Update search status (for yandex_xml this was already set, but ensure it's completed)
            if provider_id == "yandex_xml":
                search.status = "completed"
                search.result_count = saved_count
                await db.commit()
            
            # Trigger domain processing tasks for unique domains (group = один round-trip в Redis)
            if unique_domains:
                from celery import group
                try:
                    job = group(
                        process_domain_task.s(search_id, domain, first_url)
                        for domain, first_url in unique_domains.items()
                    )
                    job.apply_async(queue="celery")
                except Exception as e:
                    import logging
                    logging.warning(f"Failed to launch domain tasks: {e}")
            
            return {
                "search_id": search_id,
                "status": "completed",
                "result_count": saved_count,
                "domains_to_process": len(unique_domains),
            }
            
        except Exception as e:
            import logging
            import sys
            import traceback
            logger = logging.getLogger(__name__)
            
            error_message = str(e)
            print(f"[DEBUG] execute_search_task error for search_id={search_id}: {error_message}", file=sys.stderr, flush=True)
            traceback.print_exc(file=sys.stderr)
            logger.error(f"execute_search_task error for search_id={search_id}: {error_message}", exc_info=True)
            
            search.status = "failed"
            # Сохраняем сообщение об ошибке в config
            # Важно: создаем новый словарь, чтобы SQLAlchemy увидел изменение
            current_config = search.config or {}
            new_config = dict(current_config)  # Создаем копию
            new_config["error"] = error_message
            new_config["error_type"] = type(e).__name__
            search.config = new_config  # Присваиваем новый объект
            await db.commit()
            await db.refresh(search)  # Обновляем объект из БД
            return {"error": error_message}


@celery_app.task(name="process_domain_task")
def process_domain_task(search_id: int, domain: str, first_url: str):
    """
    Process domain: crawl, extract contacts. SEO audit only via button (POST .../results/{id}/audit).
    Sync wrapper for async.
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
            # 1. Mini-crawl domain with fallback
            from app.modules.filters.crawler import crawl_domain_with_fallback
            crawl_data = await crawl_domain_with_fallback(first_url, max_pages=20, timeout=30)
            
            # 2. Extract contacts
            contacts = crawl_data.get("contacts", {})
            phone = contacts.get("phone")
            email = contacts.get("email")
            
            # 3. Initialize outreach variables
            outreach_subject = None
            outreach_text = None
            
            # 4. Determine contact status
            # SEO audit should be run only via button (POST .../results/{id}/audit)
            seo_score = None
            seo_issues: list[str] = []
            if phone or email:
                contact_status = "found"
                from app.modules.filters.outreach import generate_outreach_text
                outreach = generate_outreach_text(
                    domain=domain,
                    seo_issues=seo_issues,
                    seo_score=seo_score,
                )
                outreach_subject = outreach.get("subject")
                outreach_text = outreach.get("text")
            else:
                contact_status = "no_contacts"
                outreach_subject = None
                outreach_text = None

            # 5. Update all results for this domain (no audit in metadata)
            metadata = {
                "crawl": {
                    "total_pages": crawl_data.get("total_pages", 0),
                    "pages": crawl_data.get("pages", []),
                },
            }

            for res in domain_results:
                res.phone = phone
                res.email = email
                res.contact_status = contact_status
                res.seo_score = seo_score
                res.outreach_subject = outreach_subject
                res.outreach_text = outreach_text
                res.extra_data = metadata
            
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
