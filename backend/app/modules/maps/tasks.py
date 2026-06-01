"""Celery-задачи модуля maps.

Sync-обёртки над async-кодом провайдеров и сервиса через asyncio.run.

Очереди:
- maps          — parse_map_search (главная оркестрация)
- maps_reviews  — parse_company_reviews (по одной компании)
- maintenance   — purge_review_raw_text (cron)

В docker-compose.yml celery-worker должен слушать эти очереди — см. ШАГ ниже.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone

from sqlalchemy import select, text, update

from app.core.database import AsyncSessionLocal
from app.models.maps import Company, MapSearch
from app.modules.maps import service
from app.modules.maps.enrich import fetch_and_extract
from app.modules.maps.providers.base import (
    CaptchaWallError,
    MissingAPIKeyError,
    RateLimitError,
)
from app.modules.maps.providers.twogis import TwoGisProvider
from app.modules.maps.providers.yandex_maps import YandexMapsProvider
from app.modules.maps.schemas import CompanyRaw, ReviewRaw
from app.queue.celery_app import celery_app

logger = logging.getLogger(__name__)

PROVIDERS_REGISTRY = {
    "2gis": TwoGisProvider,
    "yandex_maps": YandexMapsProvider,
}

# 5 вместо 20 — на multi-query expansion с 4 синонимами и дедупом по
# external_id первые 20 уникальных набираются медленно (особенно для региональных
# поисков, где 2GIS отвечает 5-10с на страницу). При 5 компаний flush —
# первые карточки появляются в UI уже через 5-15 секунд после старта.
COMPANIES_BATCH_SIZE = 5
REVIEWS_BATCH_SIZE = 20


# ---------------------------------------------------------------------------
# parse_map_search
# ---------------------------------------------------------------------------


def _build_provider(source: str, db):
    """Инстанцирует провайдер. YandexMapsProvider требует db для solver."""
    cls = PROVIDERS_REGISTRY.get(source)
    if cls is None:
        raise ValueError(f"unknown source: {source!r}")
    if source == "yandex_maps":
        return cls(db=db)
    return cls()


async def _parse_companies_for_source(db, search: MapSearch, source: str) -> tuple[int, bool]:
    """Прогоняет provider.search_companies через batch-сейв.
    После каждой партии ставит parse_company_reviews.delay.

    Multi-query expansion: для популярных ниш (см. modules/maps/synonyms.py) гоняет
    несколько поисковых запросов-синонимов с дедупом по external_id. На free-плане
    2GIS отдаёт max 50 компаний на запрос, 4 синонима = до 200 уникальных.

    Возвращает (count, completed):
      - count: сколько компаний реально сохранено и привязано к поиску
        (пропущенный хвост батча при exception не учитывается).
      - completed: True если итератор провайдера дошёл до конца без
        CaptchaWallError/RateLimitError. False означает «парсинг частичный,
        кэш писать нельзя».
    """
    try:
        provider = _build_provider(source, db)
    except MissingAPIKeyError as e:
        logger.warning("parse_map_search source=%s missing api key: %s", source, e)
        return 0, False

    from app.core.config import settings
    from app.modules.maps.synonyms import get_search_queries
    limit = settings.MAPS_MAX_COMPANIES_PER_SEARCH

    queries = get_search_queries(search.niche)
    if not queries:
        return 0, True
    logger.info(
        "parse_map_search source=%s niche=%r expanded to %d queries: %r",
        source, search.niche, len(queries), queries,
    )

    await service.publish_progress_event(
        search.id, "progress",
        {
            "stage": "parsing", "source": source,
            "saved": 0, "expected": limit,
            "queries_total": len(queries), "queries_done": 0,
        },
    )

    seen_external_ids: set[str] = set()
    batch: list[CompanyRaw] = []
    saved_count = 0
    position_cursor = 0
    completed = True
    completed_flag = [True]  # mutable wrapper для замыкания внутри _consume_query

    # Семафор для упорядоченного flush — провайдеры могут давать компании
    # в любом порядке, но save_companies_batch должен идти последовательно,
    # чтобы не было race на position_cursor.
    flush_lock = asyncio.Lock()

    async def flush_batch() -> None:
        """Сохраняет batch, ставит downstream-таски и шлёт SSE-events."""
        nonlocal batch, saved_count, position_cursor
        if not batch:
            return
        async with flush_lock:
            to_save = batch
            batch = []
            saved = await service.save_companies_batch(
                db, to_save, search.id, start_position=position_cursor,
            )
            position_cursor += len(to_save)
            saved_count += len(saved)
            for company in saved:
                await service.publish_progress_event(
                    search.id, "company",
                    {"company_id": company.id, "name": company.name, "position": position_cursor},
                )
                parse_company_reviews.delay(company.id, source)
                _maybe_enrich_contacts(company)

    # В режиме radius — передаём point + radius_meters в провайдер вместо region_id.
    # MapSearch.mode='radius' выставляется при создании поиска (см. service).
    use_radius = (
        getattr(search, "mode", "city") == "radius"
        and search.point_lat is not None
        and search.point_lng is not None
        and search.radius_meters
    )
    radius_kwargs: dict = {}
    if use_radius:
        radius_kwargs = {
            "point": (float(search.point_lat), float(search.point_lng)),
            "radius_meters": int(search.radius_meters),
        }

    async def _consume_query(q_idx: int, query: str) -> None:
        """Стримит один синоним, дедупит и кладёт в общий batch."""
        nonlocal batch, saved_count
        try:
            async for company_raw in provider.search_companies(
                query, search.city, limit=limit, **radius_kwargs,
            ):
                if saved_count >= limit:
                    return
                ext_id = company_raw.external_id
                if ext_id in seen_external_ids:
                    continue
                seen_external_ids.add(ext_id)
                # Нормализуем нишу под search.niche (а не текущий синоним).
                company_raw.niche = search.niche
                batch.append(company_raw)
                if len(batch) >= COMPANIES_BATCH_SIZE:
                    await flush_batch()
                    await service.publish_progress_event(
                        search.id, "progress",
                        {
                            "stage": "parsing", "source": source,
                            "saved": saved_count, "expected": limit,
                            "queries_total": len(queries), "queries_done": q_idx,
                        },
                    )
        except CaptchaWallError as e:
            logger.warning("parse_map_search source=%s captcha wall on q=%r: %s", source, query, e)
            completed_flag[0] = False
        except RateLimitError as e:
            logger.warning("parse_map_search source=%s rate-limit on q=%r: %s", source, query, e)
            completed_flag[0] = False
        except RuntimeError as e:
            logger.warning(
                "parse_map_search source=%s runtime error on q=%r: %s — синоним пропущен",
                source, query, e,
            )
        except Exception as e:
            logger.exception("parse_map_search: неожиданная ошибка в синониме %r: %s", query, e)

    # Параллельный multi-query через asyncio.gather. Раньше синонимы шли
    # последовательно — на 4 синонима × 5 страниц × 1.1с rate_limit получалось
    # 25-40 секунд до первой видимой партии. Сейчас все синонимы стартуют
    # одновременно, общее время — как самого медленного (~5-10с).
    await asyncio.gather(
        *(_consume_query(i, q) for i, q in enumerate(queries)),
        return_exceptions=True,
    )
    completed = completed_flag[0]

    # хвост последнего батча
    try:
        await flush_batch()
        await service.publish_progress_event(
            search.id, "progress",
            {
                "stage": "parsing", "source": source,
                "saved": saved_count, "expected": limit,
                "queries_total": len(queries), "queries_done": len(queries),
            },
        )
    except Exception as e:
        logger.warning("parse_map_search source=%s flush tail failed: %s", source, e)

    return saved_count, completed


async def _parse_map_search_async(search_id: int) -> None:
    async with AsyncSessionLocal() as db:
        search = await db.get(MapSearch, search_id)
        if search is None:
            logger.error("parse_map_search: MapSearch #%d not found", search_id)
            return

        search.status = "running"
        search.started_at = datetime.now(timezone.utc)
        await db.commit()

        total_found = 0
        # В radius-режиме точка/радиус уникальны — нельзя переиспользовать city-кэш.
        # Иначе после первого city-поиска по (ниша, город) любой radius-поиск в этом
        # городе ловит cache hit, пропускает парсинг и возвращает 0 компаний.
        radius_mode = getattr(search, "mode", "city") == "radius"
        try:
            sources = [s.strip() for s in (search.sources or "").split(",") if s.strip()]
            for source in sources:
                if not radius_mode and await service.check_cache(db, search.niche, search.city, source):
                    logger.info("parse_map_search: cache hit for %s/%s/%s", search.niche, search.city, source)
                    # На cache hit повторно парсить компании не нужно — они
                    # уже в БД. Но enrichment мог не отработать (фича добавлена
                    # позже, или для компании Catalog API отдал phone и старое
                    # условие `not phone` пропустило 2GIS HTML). Догоняем тут,
                    # идемпотентно — повторно не ставим таск для компаний с
                    # contacts_extra.fetched_2gis_url / error_2gis.
                    try:
                        queued = await _reenrich_cached_companies_async(
                            db, search.niche, search.city, source
                        )
                        if queued:
                            logger.info(
                                "parse_map_search: re-enqueued enrichment for %d cached companies (%s/%s/%s)",
                                queued, search.niche, search.city, source,
                            )
                    except Exception as e:
                        logger.warning("parse_map_search: cache-hit re-enrich failed: %s", e)
                    continue
                try:
                    count, completed = await _parse_companies_for_source(db, search, source)
                except RuntimeError as e:
                    # Третий слой защиты: если что-то прорвалось через все catch'и
                    # внутри _parse_companies_for_source (например, новая логическая
                    # ошибка провайдера) — НЕ валим весь поиск, просто считаем что
                    # этот source ничего не дал. Юзер увидит EmptyResult, не failed.
                    logger.warning(
                        "parse_map_search: source=%s бросил RuntimeError на верхнем уровне: %s",
                        source, e,
                    )
                    count, completed = 0, False
                total_found += count
                # Кэш пишем только при полном успехе. Если парсинг прервался
                # (капча, рейтлимит) — лучше не писать кэш, чтобы следующий
                # запрос мог нормально перепарсить.
                # В radius-режиме кэш по (niche, city) не пишем — иначе он
                # сломает обычный city-поиск (cache hit подсунет только компании
                # из радиуса вместо полной выдачи по городу).
                if completed and count > 0 and not radius_mode:
                    await service.upsert_cache_entry(
                        db, search.niche, search.city, source,
                        companies_count=count, reviews_count=0,
                    )

            search.companies_found = total_found
            search.status = "completed"
            search.finished_at = datetime.now(timezone.utc)
            if total_found == 0:
                # Полезный сигнал для UI: успешно завершили, но 0 компаний.
                # Самые частые причины — опечатка в нише, узкий запрос, недоступная
                # категория. Чтобы не оставлять юзера в догадках, пишем подсказку
                # в .error (UI решит — показывать как warning, или как hint).
                search.error = (
                    "По этому запросу 2GIS ничего не вернул. "
                    "Попробуй переформулировать нишу или сменить город."
                )
                search.error_type = "EmptyResult"
            await db.commit()
            await service.publish_progress_event(
                search.id, "done",
                {"companies_found": total_found, "reviews_found": search.reviews_found},
            )
        except Exception as e:
            logger.exception("parse_map_search: unhandled error")
            search.status = "failed"
            search.error = str(e)[:2000]
            search.error_type = type(e).__name__
            search.finished_at = datetime.now(timezone.utc)
            await db.commit()
            raise


@celery_app.task(name="parse_map_search", queue="maps", bind=True, max_retries=2)
def parse_map_search(self, search_id: int):
    """Главная задача парсинга поиска. См. _parse_map_search_async."""
    try:
        asyncio.run(_parse_map_search_async(search_id))
    except Exception as exc:
        logger.warning("parse_map_search retrying #%d: %s", search_id, exc)
        raise self.retry(exc=exc, countdown=30, max_retries=2)


# ---------------------------------------------------------------------------
# parse_company_reviews
# ---------------------------------------------------------------------------


async def _parse_company_reviews_async(company_id: int, source: str, limit: int) -> int:
    async with AsyncSessionLocal() as db:
        company = await db.get(Company, company_id)
        if company is None:
            logger.warning("parse_company_reviews: Company #%d not found", company_id)
            return 0

        try:
            provider = _build_provider(source, db)
        except MissingAPIKeyError as e:
            logger.warning("parse_company_reviews source=%s missing api key: %s", source, e)
            return 0

        batch: list[ReviewRaw] = []
        total_inserted = 0
        try:
            async for review_raw in provider.fetch_reviews(company.external_id, limit=limit):
                batch.append(review_raw)
                if len(batch) >= REVIEWS_BATCH_SIZE:
                    total_inserted += await service.save_reviews_batch(db, company.id, batch)
                    batch = []
            if batch:
                total_inserted += await service.save_reviews_batch(db, company.id, batch)
        except (CaptchaWallError, RateLimitError) as e:
            logger.warning("parse_company_reviews source=%s for company=%d: %s", source, company_id, e)
        except RuntimeError as e:
            # 2GIS reviews/list endpoint недоступен на free-плане (meta.code=404 Method not found).
            # Не валим таск: компания уже сохранена, рейтинг и review_count берутся из items-ответа.
            # Без этой ветки таск ретраился max_retries раз и забивал очередь.
            logger.warning("parse_company_reviews source=%s for company=%d skipped: %s", source, company_id, e)

        await service.update_company_aggregates(db, company.id)

    # AI-пайплайн ставим ВСЕГДА после успешного парсинга — даже когда
    # total_inserted=0 (все отзывы уже были в БД с прошлого парсинга).
    # Раньше тут было `if total_inserted > 0:` — но это значило, что компании,
    # которые парсились ДО подключения reviews_ai, навсегда оставались без
    # AI-анализа: повторный парсинг не вставляет новых отзывов, и таска не
    # запускается. analyze_reviews_for_company сама проверяет какие отзывы
    # имеют ai_processed_at IS NULL и no-op если всё обработано — поэтому
    # ставить всегда безопасно и идемпотентно.
    try:
        from app.modules.reviews_ai.tasks import analyze_reviews_for_company
        analyze_reviews_for_company.delay(company_id)
    except Exception as e:
        logger.warning("parse_company_reviews: не смог поставить analyze_reviews_for_company: %s", e)
    return total_inserted


@celery_app.task(name="parse_company_reviews", queue="maps_reviews", bind=True, max_retries=2)
def parse_company_reviews(self, company_id: int, source: str, limit: int | None = None):
    """Парсит отзывы одной компании. Лимит из settings.MAPS_MAX_REVIEWS_PER_COMPANY."""
    from app.core.config import settings
    eff_limit = limit if limit is not None else settings.MAPS_MAX_REVIEWS_PER_COMPANY
    try:
        return asyncio.run(_parse_company_reviews_async(company_id, source, eff_limit))
    except Exception as exc:
        logger.warning("parse_company_reviews retrying company=%d: %s", company_id, exc)
        raise self.retry(exc=exc, countdown=30, max_retries=2)


# ---------------------------------------------------------------------------
# enrich_company_contacts
# ---------------------------------------------------------------------------


def _maybe_enrich_contacts(company: Company) -> None:
    """Хелпер: ставит таски обогащения контактов после сохранения компании.

    Два независимых пути:
      - enrich_company_contacts: краулер сайта компании. Триггерим если есть
        website и contacts_enriched_at IS NULL.
      - enrich_company_from_2gis_html: HTML-парсер карточки 2GIS. Триггерим
        для source='2gis' с external_id, по которым мы ещё не ходили на
        2gis.ru/firm/{id} (отмечается ключами fetched_2gis_url / error_2gis
        в contacts_extra). Раньше тут было условие `not company.phone` — но
        оно пропускало все компании, у которых Catalog API отдал хотя бы
        один телефон, и до мессенджеров/email/доп.телефонов мы не доходили.

    Тихо проглатывает любые ошибки постановки тасков — само-rate-limit
    у Celery, никакой массовой долбёжки 2GIS быть не должно (queue с
    rate_limit=20/m + concurrency=1).
    """
    try:
        if company.website and company.contacts_enriched_at is None:
            enrich_company_contacts.delay(company.id)
    except Exception as e:
        logger.warning("_maybe_enrich_contacts: cannot enqueue site-crawler for #%d: %s", company.id, e)

    try:
        extra = company.contacts_extra or {}
        already_tried_2gis_html = "fetched_2gis_url" in extra or "error_2gis" in extra
        if (
            company.source == "2gis"
            and company.external_id
            and not already_tried_2gis_html
        ):
            enrich_company_from_2gis_html.delay(company.id)
    except Exception as e:
        logger.warning("_maybe_enrich_contacts: cannot enqueue 2gis_html for #%d: %s", company.id, e)


async def _reenrich_cached_companies_async(
    db, niche: str, city: str, source: str, limit: int = 300
) -> int:
    """При cache hit — догнать enrichment для уже сохранённых компаний.

    Берём компании из БД по (niche, city, source) и для каждой решаем,
    нужен ли HTML-парсер 2GIS / краулер сайта. Условия — те же что в
    `_maybe_enrich_contacts`, поэтому идемпотентно: компании, по которым
    уже ходили, повторно не ставятся в очередь.

    Используется только из главного оркестратора (cache hit ветка). Возвращает
    количество поставленных в очередь тасков (для логов).
    """
    sql = text(
        "SELECT id, source, external_id, website, phone, contacts_extra, "
        "contacts_enriched_at FROM companies "
        "WHERE niche = :niche AND city = :city AND source = :source "
        "ORDER BY id DESC LIMIT :lim"
    )
    rows = list(
        (await db.execute(sql, {"niche": niche, "city": city, "source": source, "lim": int(limit)}))
        .mappings()
        .all()
    )
    queued = 0
    for r in rows:
        # Краулер сайта — только если ещё не ходили на сайт.
        if r["website"] and r["contacts_enriched_at"] is None:
            try:
                enrich_company_contacts.delay(int(r["id"]))
                queued += 1
            except Exception as e:
                logger.warning("_reenrich: cannot enqueue site-crawler #%s: %s", r["id"], e)

        # 2GIS HTML — только для 2gis-компаний с external_id, по которым
        # мы ещё не ходили (нет fetched_2gis_url / error_2gis в extra).
        if r["source"] == "2gis" and r["external_id"]:
            extra = r["contacts_extra"] or {}
            if "fetched_2gis_url" not in extra and "error_2gis" not in extra:
                try:
                    enrich_company_from_2gis_html.delay(int(r["id"]))
                    queued += 1
                except Exception as e:
                    logger.warning("_reenrich: cannot enqueue 2gis_html #%s: %s", r["id"], e)
    return queued


async def _enrich_company_contacts_async(company_id: int) -> dict:
    async with AsyncSessionLocal() as db:
        company = await db.get(Company, company_id)
        if company is None:
            logger.warning("enrich_company_contacts: Company #%d not found", company_id)
            return {"status": "not_found"}
        if not company.website:
            # Помечаем чтобы не пытались снова, но без emails — нечего обогащать
            await db.execute(
                update(Company)
                .where(Company.id == company_id)
                .values(contacts_enriched_at=datetime.now(timezone.utc))
            )
            await db.commit()
            return {"status": "no_website"}

        result = await fetch_and_extract(company.website)

        extra: dict[str, list[str] | str] = {}
        if result.phones:
            extra["phones"] = result.phones
        if result.telegrams:
            extra["telegrams"] = result.telegrams
        if result.vks:
            extra["vks"] = result.vks
        if result.whatsapps:
            extra["whatsapps"] = result.whatsapps
        if result.instagrams:
            extra["instagrams"] = result.instagrams
        if result.facebooks:
            extra["facebooks"] = result.facebooks
        if result.oks:
            extra["oks"] = result.oks
        if result.youtubes:
            extra["youtubes"] = result.youtubes
        if result.fetched_url:
            extra["fetched_url"] = result.fetched_url
        if result.error:
            extra["error"] = result.error

        await db.execute(
            update(Company)
            .where(Company.id == company_id)
            .values(
                emails=result.emails or None,
                contacts_extra=extra or None,
                contacts_enriched_at=datetime.now(timezone.utc),
            )
        )
        await db.commit()
        return {
            "status": "ok",
            "emails": len(result.emails),
            "phones": len(result.phones),
            "telegrams": len(result.telegrams),
            "vks": len(result.vks),
            "whatsapps": len(result.whatsapps),
            "error": result.error,
        }


@celery_app.task(name="enrich_company_contacts", queue="maps", bind=True, max_retries=1)
def enrich_company_contacts(self, company_id: int):
    """Качает сайт компании и достаёт из HTML email/телефоны/мессенджеры.

    Один retry — на случай флапа сети. Дальше — фиксируем contacts_enriched_at
    с пустым emails, чтобы не дёргать сайт повторно при каждом поиске.
    """
    try:
        return asyncio.run(_enrich_company_contacts_async(company_id))
    except Exception as exc:
        logger.warning("enrich_company_contacts retrying company=%d: %s", company_id, exc)
        raise self.retry(exc=exc, countdown=20, max_retries=1)


# ---------------------------------------------------------------------------
# enrich_company_from_2gis_html — HTML-парсер карточки 2gis.ru/firm/{id}
# ---------------------------------------------------------------------------


async def _enrich_company_from_2gis_html_async(company_id: int) -> dict:
    """Качает 2gis.ru/firm/{external_id}, мерджит контакты в БД.

    Срабатывает только для source='2gis' компаний с external_id. Использует
    COALESCE-merge с уже накопленными контактами (Catalog API + краулер
    сайта) — пустые поля не затирают.
    """
    from app.modules.maps.enrich_2gis import fetch_and_extract_2gis_firm

    async with AsyncSessionLocal() as db:
        company = await db.get(Company, company_id)
        if company is None:
            return {"status": "not_found"}
        if company.source != "2gis" or not company.external_id:
            return {"status": "skip_not_2gis"}

        result = await fetch_and_extract_2gis_firm(company.external_id)

        # Берём существующие contacts_extra и доливаем новые ключи. Это критично:
        # краулер сайта мог уже положить telegrams=[...], а 2GIS HTML ничего не
        # отдал — мы не должны затереть.
        existing_extra: dict = dict(company.contacts_extra or {})
        new_extra: dict = {}

        def merge_list(key: str, new_vals: list[str]) -> None:
            if not new_vals:
                return
            cur = existing_extra.get(key) or []
            cur_set = set(cur)
            merged = list(cur)
            for v in new_vals:
                if v not in cur_set:
                    merged.append(v)
                    cur_set.add(v)
            new_extra[key] = merged

        merge_list("phones", result.phones)
        merge_list("telegrams", result.telegrams)
        merge_list("vks", result.vks)
        merge_list("whatsapps", result.whatsapps)
        merge_list("instagrams", result.instagrams)
        merge_list("facebooks", result.facebooks)
        merge_list("oks", result.oks)
        merge_list("youtubes", result.youtubes)
        if result.fetched_url:
            new_extra["fetched_2gis_url"] = result.fetched_url
        if result.error:
            new_extra["error_2gis"] = result.error

        # emails — таким же образом merge
        existing_emails = list(company.emails or [])
        merged_emails = list(existing_emails)
        for e in result.emails:
            if e not in merged_emails:
                merged_emails.append(e)

        # phone (основной) — если в БД пусто, а из HTML пришло хоть что-то,
        # подставим первый. Иначе не трогаем — Catalog API/прошлые данные
        # авторитетнее.
        new_phone = company.phone
        if not new_phone and result.phones:
            new_phone = result.phones[0]

        full_extra = {**existing_extra, **new_extra} if new_extra else (existing_extra or None)

        await db.execute(
            update(Company)
            .where(Company.id == company_id)
            .values(
                phone=new_phone,
                emails=merged_emails or None,
                contacts_extra=full_extra,
                # contacts_enriched_at оставляем тот что был; помечать тут не
                # надо — он отвечает за «краулер сайта прошёл», не за нас.
            )
        )
        await db.commit()
        return {
            "status": "ok",
            "phones_found": len(result.phones),
            "emails_found": len(result.emails),
            "telegrams_found": len(result.telegrams),
            "vks_found": len(result.vks),
            "whatsapps_found": len(result.whatsapps),
            "error": result.error,
        }


@celery_app.task(
    name="enrich_company_from_2gis_html",
    queue="maps_2gis_html",
    bind=True,
    max_retries=1,
    rate_limit="20/m",  # не агрессивим к 2GIS — 20 запросов/минуту максимум
)
def enrich_company_from_2gis_html(self, company_id: int):
    """Качает 2gis.ru/firm/{external_id} и доливает контакты в БД.

    Отдельная очередь maps_2gis_html — чтобы можно было пускать worker с
    --concurrency=1 и rate_limit, иначе 2GIS быстро отдаст 429/captcha.
    """
    try:
        return asyncio.run(_enrich_company_from_2gis_html_async(company_id))
    except Exception as exc:
        logger.warning("enrich_company_from_2gis_html retrying company=%d: %s", company_id, exc)
        raise self.retry(exc=exc, countdown=60, max_retries=1)


# ---------------------------------------------------------------------------
# bulk re-enrich — для разового прогона существующих компаний на проде
# ---------------------------------------------------------------------------


async def _bulk_enqueue_async(
    *, source_filter: str | None, missing_phone: bool, limit: int
) -> int:
    """SELECT компании под условие → ставит таски в очереди.

    Идёмпотентно: можно перезапускать, дубль-таски сожрутся ON CONFLICT в БД
    при merge'е (никаких side-effects).
    """
    async with AsyncSessionLocal() as db:
        conditions = []
        if source_filter:
            conditions.append("source = :src")
        if missing_phone:
            conditions.append("(phone IS NULL OR phone = '')")
        where_sql = " AND ".join(conditions) if conditions else "TRUE"
        sql = text(
            f"SELECT id, source, external_id, website FROM companies "
            f"WHERE {where_sql} ORDER BY id DESC LIMIT :lim"
        )
        params: dict = {"lim": int(limit)}
        if source_filter:
            params["src"] = source_filter
        rows = list((await db.execute(sql, params)).mappings().all())

    queued = 0
    for r in rows:
        # 2GIS HTML — только для 2gis-компаний с external_id
        if r["source"] == "2gis" and r["external_id"]:
            try:
                enrich_company_from_2gis_html.delay(int(r["id"]))
                queued += 1
            except Exception as e:
                logger.warning("bulk: cannot enqueue 2gis_html for #%s: %s", r["id"], e)
        # Краулер сайта — для любого источника с website
        if r["website"]:
            try:
                # Сбрасываем contacts_enriched_at чтобы таск не вышел no-op-ом
                async with AsyncSessionLocal() as db2:
                    await db2.execute(
                        update(Company)
                        .where(Company.id == int(r["id"]))
                        .values(contacts_enriched_at=None)
                    )
                    await db2.commit()
                enrich_company_contacts.delay(int(r["id"]))
            except Exception as e:
                logger.warning("bulk: cannot enqueue website-enrich for #%s: %s", r["id"], e)
    return queued


@celery_app.task(name="bulk_enrich_contacts", queue="maps")
def bulk_enrich_contacts(
    source_filter: str | None = "2gis",
    missing_phone: bool = True,
    limit: int = 100,
):
    """Разовый прогон: SELECT компании под условие, ставим enrichment-таски.

    Defaults подобраны под безопасный first run — только 100 компаний и только
    тех, у кого phone пустой. Можно вызывать повторно с большим limit.

    Запуск:
        docker compose ... exec -T backend python -c \\
          "from app.queue.celery_app import celery_app; \\
           celery_app.send_task('bulk_enrich_contacts', kwargs={'limit': 100})"
    """
    queued = asyncio.run(
        _bulk_enqueue_async(
            source_filter=source_filter,
            missing_phone=missing_phone,
            limit=limit,
        )
    )
    logger.info("bulk_enrich_contacts: enqueued %d company tasks", queued)
    return {"queued": queued, "limit": limit}


# ---------------------------------------------------------------------------
# purge_review_raw_text (cron)
# ---------------------------------------------------------------------------


async def _purge_review_raw_text_async() -> int:
    """UPDATE reviews SET raw_text=NULL, raw_text_purged_at=NOW()
    WHERE created_at < NOW() - INTERVAL '30 days' AND raw_text IS NOT NULL."""
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            text(
                """
                UPDATE reviews
                SET raw_text = NULL,
                    raw_text_purged_at = NOW()
                WHERE created_at < NOW() - INTERVAL '30 days'
                  AND raw_text IS NOT NULL
                """
            )
        )
        await db.commit()
        return result.rowcount or 0


@celery_app.task(name="purge_review_raw_text", queue="maintenance")
def purge_review_raw_text():
    """Cron: ежедневно в 3:30 (см. beat_schedule в celery_app.py)."""
    count = asyncio.run(_purge_review_raw_text_async())
    logger.info("purge_review_raw_text: purged %d rows", count)
    return count
