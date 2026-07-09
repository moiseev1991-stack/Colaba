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
from app.modules.maps.providers.google_maps import GoogleMapsProvider
from app.modules.maps.providers.twogis import TwoGisProvider
from app.modules.maps.providers.yandex_maps import YandexMapsProvider
from app.modules.maps.schemas import CompanyRaw, ReviewRaw
from app.queue.celery_app import celery_app

logger = logging.getLogger(__name__)

PROVIDERS_REGISTRY = {
    "2gis": TwoGisProvider,
    "yandex_maps": YandexMapsProvider,
    "google_maps": GoogleMapsProvider,
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

        # Контекст для api_tracker: все последующие вызовы провайдеров/LLM
        # будут автоматически привязаны к этому user_id + map_search_id.
        from app.core.api_tracker import set_call_context

        set_call_context(
            user_id=search.user_id, map_search_id=search.id
        )

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

            # Auto-trigger AI-разбора болей. Без этого новые ниши/города
            # (которые не входят в top-30 для cron recluster_popular_niches)
            # навсегда оставались без company_pain_scores → карточки
            # показывали fallback NegativeSnippetsBlock вместо красивых
            # pain-pills с лейблами и счётчиками. countdown=180с — даём
            # analyze_reviews_for_company (sentiment + embeddings) сначала
            # отработать на парсенных отзывах, иначе кластеризовать нечего.
            if total_found > 0 and search.niche and search.city:
                try:
                    from app.modules.reviews_ai.tasks import recluster_pains_for_niche_task
                    recluster_pains_for_niche_task.apply_async(
                        args=[search.niche, search.city],
                        countdown=180,
                    )
                    logger.info(
                        "parse_map_search #%d: scheduled recluster for (%r, %r) in 180s",
                        search.id, search.niche, search.city,
                    )
                except Exception as e:
                    logger.warning(
                        "parse_map_search #%d: failed to schedule recluster for (%r, %r): %s",
                        search.id, search.niche, search.city, e,
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

        # Контекст api_tracker: company_id (user/search_id наследуются от
        # parent Celery-task, если parse_map_search его выставил).
        from app.core.api_tracker import set_call_context

        set_call_context(company_id=company_id)

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

    # Блок 2 ТЗ 2026-06-02: юр.данные через DaData. Триггерим только если
    # компания ещё не была обогащена (legal-таска сама пропустит дубль).
    try:
        from app.core.config import settings as _s
        if (_s.DADATA_API_KEY or "").strip():
            enrich_company_legal.delay(company.id)
    except Exception as e:
        logger.warning(
            "_maybe_enrich_contacts: cannot enqueue legal for #%d: %s",
            company.id, e,
        )

    # ТЗ A.2 2026-06-04: ЛПР со страниц /team /о-нас сайта компании.
    # Триггерим только если у компании есть website (без сайта парсить
    # нечего) — таска внутри сама пропускает соцсети и уже обработанные.
    try:
        if company.website:
            enrich_company_team.delay(company.id)
    except Exception as e:
        logger.warning(
            "_maybe_enrich_contacts: cannot enqueue team-enrich for #%d: %s",
            company.id, e,
        )

    # ТЗ «Маркетинг-ЛПР Finder» 2026-06-20:
    # hh.ru (сигнал «ищет маркетолога» + контактное лицо) — есть для любой
    # компании, не только с сайтом;
    # ВК (публичные контакты сообщества) — тоже без предусловий;
    # Оркестратор enrich_marketing_dm запускаем с countdown=45s, чтобы
    # успели отработать team/legal/hh/vk и он выбрал best-DM по полным
    # данным. Идёмпотентен — можно пере-триггерить и позже.
    try:
        enrich_company_hh.delay(company.id)
    except Exception as e:
        logger.warning(
            "_maybe_enrich_contacts: cannot enqueue hh-enrich for #%d: %s",
            company.id, e,
        )
    try:
        from app.core.config import settings as _s
        if (_s.VK_SERVICE_TOKEN or "").strip():
            enrich_company_vk.delay(company.id)
    except Exception as e:
        logger.warning(
            "_maybe_enrich_contacts: cannot enqueue vk-enrich for #%d: %s",
            company.id, e,
        )
    try:
        enrich_marketing_dm.apply_async(args=[company.id], countdown=45)
    except Exception as e:
        logger.warning(
            "_maybe_enrich_contacts: cannot enqueue marketing_dm for #%d: %s",
            company.id, e,
        )

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

    # Я.Карты: Playwright-парсер карточки yandex.ru/maps/org/{id}/. Триггерим
    # для source='yandex_maps' с external_id, по которым мы ещё не ходили на
    # карточку (маркеры fetched_yandex_url / error_yandex в contacts_extra).
    try:
        extra = company.contacts_extra or {}
        already_tried_yandex_html = "fetched_yandex_url" in extra or "error_yandex" in extra
        if (
            company.source == "yandex_maps"
            and company.external_id
            and not already_tried_yandex_html
        ):
            enrich_company_from_yandex_html.delay(company.id)
    except Exception as e:
        logger.warning("_maybe_enrich_contacts: cannot enqueue yandex_html for #%d: %s", company.id, e)


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

        # Я.Карты Playwright — для yandex_maps-компаний по аналогии с 2GIS.
        if r["source"] == "yandex_maps" and r["external_id"]:
            extra = r["contacts_extra"] or {}
            if "fetched_yandex_url" not in extra and "error_yandex" not in extra:
                try:
                    enrich_company_from_yandex_html.delay(int(r["id"]))
                    queued += 1
                except Exception as e:
                    logger.warning("_reenrich: cannot enqueue yandex_html #%s: %s", r["id"], e)
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

        # Lead temperature (блок 3) + website_lead_score (блок 4). После
        # обогащения контактов phone/email/мессенджеры могли появиться —
        # оба скора пересчитываются.
        try:
            from app.modules.maps.lead_temperature import recompute_for_company as _rt
            from app.modules.maps.website_lead_score import recompute_for_company as _rw
            await _rt(db, company_id)
            await _rw(db, company_id)
            await db.commit()
        except Exception:
            logger.exception(
                "scores recompute failed after enrich_company_contacts (#%d)",
                company_id,
            )

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

        # website — на нашем плане 2GIS Catalog API contact_groups часто пустые,
        # из-за чего у всех компаний website=NULL и пресет «Есть сайт» отдаёт
        # 0 компаний. Если Playwright вытащил website из реальной карточки
        # 2GIS — пишем его в company.website (только если в БД было пусто).
        new_website = company.website
        if not new_website and result.website:
            new_website = result.website

        full_extra = {**existing_extra, **new_extra} if new_extra else (existing_extra or None)

        await db.execute(
            update(Company)
            .where(Company.id == company_id)
            .values(
                phone=new_phone,
                website=new_website,
                emails=merged_emails or None,
                contacts_extra=full_extra,
                # contacts_enriched_at оставляем тот что был; помечать тут не
                # надо — он отвечает за «краулер сайта прошёл», не за нас.
            )
        )
        await db.commit()

        # Phase 3 multi-source: зеркалим свежие контакты в company_contacts,
        # чтобы новые таблицы оставались синхронными.
        try:
            from app.modules.maps.service import _sync_company_to_multisource
            company_after = await db.get(Company, company_id, populate_existing=True)
            if company_after:
                await _sync_company_to_multisource(db, company_after)
                await db.commit()
        except Exception:
            logger.exception("multi-source sync failed after 2gis enrich (#%d)", company_id)

        # Lead temperature (блок 3) + website_lead_score (блок 4). После
        # 2GIS-обогащения phone/website/мессенджеры могли появиться. Особенно
        # важно для website_score: появление website → score становится NULL.
        try:
            from app.modules.maps.lead_temperature import recompute_for_company as _rt
            from app.modules.maps.website_lead_score import recompute_for_company as _rw
            await _rt(db, company_id)
            await _rw(db, company_id)
            await db.commit()
        except Exception:
            logger.exception(
                "scores recompute failed after enrich_company_from_2gis_html (#%d)",
                company_id,
            )

        # Website discovery (roadmap baseline 2026-06-02). Контакты только
        # что обогатились (telegram/vk/email handles собраны) — пробуем
        # угадать сайт. Если найдём — companies.website обновится и
        # website_lead_score станет NULL (компания уйдёт из website-лидов).
        # Триггерим только когда у компании ещё нет своего website.
        try:
            company_after = await db.get(Company, company_id)
            if company_after and not (company_after.website or "").strip():
                discover_company_website.delay(company_id)
        except Exception as e:
            logger.warning(
                "discover_company_website enqueue failed for #%d: %s",
                company_id, e,
            )

        return {
            "status": "ok",
            "phones_found": len(result.phones),
            "emails_found": len(result.emails),
            "telegrams_found": len(result.telegrams),
            "vks_found": len(result.vks),
            "whatsapps_found": len(result.whatsapps),
            "website_found": bool(result.website),
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
# enrich_company_from_yandex_html — Playwright-парсер карточки yandex.ru/maps/org/{id}
# ---------------------------------------------------------------------------


async def _enrich_company_from_yandex_html_async(company_id: int) -> dict:
    """Качает yandex.ru/maps/org/{external_id}/ через Playwright, мерджит контакты в БД.

    Срабатывает только для source='yandex_maps' с external_id. Аналогично 2GIS-енричу
    использует COALESCE-merge — пустые поля не затирают существующие.
    """
    from app.modules.maps.enrich_yandex import enrich_from_yandex_card

    async with AsyncSessionLocal() as db:
        company = await db.get(Company, company_id)
        if company is None:
            return {"status": "not_found"}
        if company.source != "yandex_maps" or not company.external_id:
            return {"status": "skip_not_yandex_maps"}

        result = await enrich_from_yandex_card(company.external_id)

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
            new_extra["fetched_yandex_url"] = result.fetched_url
        if result.error:
            new_extra["error_yandex"] = result.error

        existing_emails = list(company.emails or [])
        merged_emails = list(existing_emails)
        for e in result.emails:
            if e not in merged_emails:
                merged_emails.append(e)

        new_phone = company.phone
        if not new_phone and result.phones:
            new_phone = result.phones[0]

        new_website = company.website
        if not new_website and result.website:
            new_website = result.website

        full_extra = {**existing_extra, **new_extra} if new_extra else (existing_extra or None)

        await db.execute(
            update(Company)
            .where(Company.id == company_id)
            .values(
                phone=new_phone,
                website=new_website,
                emails=merged_emails or None,
                contacts_extra=full_extra,
            )
        )
        await db.commit()

        # Phase 3 multi-source: зеркалим в company_contacts
        try:
            from app.modules.maps.service import _sync_company_to_multisource
            company_after = await db.get(Company, company_id, populate_existing=True)
            if company_after:
                await _sync_company_to_multisource(db, company_after)
                await db.commit()
        except Exception:
            logger.exception("multi-source sync failed after yandex enrich (#%d)", company_id)

        try:
            from app.modules.maps.lead_temperature import recompute_for_company as _rt
            from app.modules.maps.website_lead_score import recompute_for_company as _rw
            await _rt(db, company_id)
            await _rw(db, company_id)
            await db.commit()
        except Exception:
            logger.exception(
                "scores recompute failed after enrich_company_from_yandex_html (#%d)",
                company_id,
            )

        try:
            company_after = await db.get(Company, company_id)
            if company_after and not (company_after.website or "").strip():
                discover_company_website.delay(company_id)
        except Exception as e:
            logger.warning(
                "discover_company_website enqueue failed for #%d: %s",
                company_id, e,
            )

        return {
            "status": "ok",
            "phones_found": len(result.phones),
            "emails_found": len(result.emails),
            "telegrams_found": len(result.telegrams),
            "vks_found": len(result.vks),
            "whatsapps_found": len(result.whatsapps),
            "website_found": bool(result.website),
            "error": result.error,
        }


@celery_app.task(
    name="enrich_company_from_yandex_html",
    queue="maps_yandex_html",
    bind=True,
    max_retries=1,
    rate_limit="20/m",  # тот же лимит что у 2GIS-енрича — Playwright + прокси, не агрессим
)
def enrich_company_from_yandex_html(self, company_id: int):
    """Качает yandex.ru/maps/org/{external_id}/ и доливает контакты в БД.

    Отдельная очередь maps_yandex_html — чтобы Playwright-таски не конкурировали
    с легковесными httpx-задачами поиска. Concurrency=1 + rate_limit=20/m.
    """
    try:
        return asyncio.run(_enrich_company_from_yandex_html_async(company_id))
    except Exception as exc:
        logger.warning("enrich_company_from_yandex_html retrying company=%d: %s", company_id, exc)
        raise self.retry(exc=exc, countdown=60, max_retries=1)


# ---------------------------------------------------------------------------
# AI-описание компании (блок 4C ТЗ 2026-06-02)
# ---------------------------------------------------------------------------


async def _generate_company_description_async(company_id: int) -> dict:
    """Wrapper для Celery: тянет компанию + цитаты, дёргает LLM, пишет в БД."""
    async with AsyncSessionLocal() as db:
        from app.modules.maps.company_description import generate_for_company
        desc = await generate_for_company(db, company_id, force=False)
        return {
            "company_id": company_id,
            "status": "ok" if desc else "skip_or_failed",
            "length": len(desc) if desc else 0,
        }


@celery_app.task(
    name="generate_company_description",
    queue="maps",  # Используем существующую очередь, не плодим новые (worker
                   # стартует с явным -Q maps,maps_2gis_html,maps_reviews,...).
    bind=True,
    max_retries=1,
    rate_limit="60/m",  # ProxyAPI обычно держит, но без агрессии
)
def generate_company_description(self, company_id: int):
    """Генерирует ai_description для одной компании. См. company_description.py.

    Используется автотриггером при экспорте Excel (для website-лидов без
    описания) и admin endpoint /maps/admin/queue-descriptions.
    """
    try:
        return asyncio.run(_generate_company_description_async(company_id))
    except Exception as exc:
        logger.warning(
            "generate_company_description retrying company=%d: %s", company_id, exc
        )
        raise self.retry(exc=exc, countdown=30, max_retries=1)


# ---------------------------------------------------------------------------
# Website discovery (угадывание по handle, см. website_discovery.py)
# ---------------------------------------------------------------------------


async def _discover_company_website_async(company_id: int) -> dict:
    """Wrapper: пытается угадать сайт по telegram/vk/email handle.

    При успехе пишет в companies.website + пересчитывает website_lead_score
    (она становится NULL — компания уходит из списка website-лидов, мы
    больше не предлагаем продать ей сайт).
    """
    async with AsyncSessionLocal() as db:
        from sqlalchemy import update as sa_update
        from app.modules.maps.website_discovery import discover_website
        from app.modules.maps.lead_temperature import recompute_for_company as _rt
        from app.modules.maps.website_lead_score import recompute_for_company as _rw

        company = await db.get(Company, company_id)
        if company is None:
            return {"status": "not_found"}
        # Если website уже выглядит как «настоящий» (не псевдо vk/2gis/etc) —
        # не трогаем. Если псевдо (vk.com/t.me) — пробуем угадать настоящий.
        from app.modules.maps.lead_temperature import _has_active_website
        if _has_active_website(company):
            return {"status": "skip_has_website"}

        cand = await discover_website(company)
        if cand is None:
            return {"status": "not_found"}

        await db.execute(
            sa_update(Company)
            .where(Company.id == company_id)
            .values(website=cand.url)
        )
        await db.commit()

        # Пересчёт скоров — website_lead_score теперь NULL, что
        # автоматически уберёт компанию из website-лидов в выдаче.
        try:
            await _rt(db, company_id)
            await _rw(db, company_id)
            await db.commit()
        except Exception:
            logger.exception(
                "scores recompute failed after discover_website (#%d)", company_id
            )

        return {"status": "ok", "url": cand.url, "source": cand.source}


@celery_app.task(
    name="discover_company_website",
    queue="maps",
    bind=True,
    max_retries=1,
    rate_limit="120/m",
)
def discover_company_website(self, company_id: int):
    """Celery-обёртка для website discovery."""
    try:
        return asyncio.run(_discover_company_website_async(company_id))
    except Exception as exc:
        logger.warning(
            "discover_company_website retrying #%d: %s", company_id, exc
        )
        raise self.retry(exc=exc, countdown=20, max_retries=1)


# ---------------------------------------------------------------------------
# Legal enrichment via DaData (блок 2 ТЗ 2026-06-02)
# ---------------------------------------------------------------------------


async def _enrich_company_legal_async(company_id: int) -> dict:
    """Wrapper для Celery: дёргает DaData и сохраняет в company_legal."""
    async with AsyncSessionLocal() as db:
        from app.modules.maps.legal_enrich import enrich_company
        return await enrich_company(db, company_id)


@celery_app.task(
    name="enrich_company_legal",
    queue="maps",
    bind=True,
    max_retries=1,
    rate_limit="60/m",  # DaData бесплатный 10k/день; не агрессим
)
def enrich_company_legal(self, company_id: int):
    """Обогащает компанию юр.данными из DaData. См. legal_enrich.py."""
    try:
        return asyncio.run(_enrich_company_legal_async(company_id))
    except Exception as exc:
        logger.warning(
            "enrich_company_legal retrying company=%d: %s", company_id, exc
        )
        raise self.retry(exc=exc, countdown=30, max_retries=1)


# ---------------------------------------------------------------------------
# Team / decision-makers enrichment (ТЗ A.2 2026-06-04)
# ---------------------------------------------------------------------------


async def _enrich_company_team_async(company_id: int) -> dict:
    """Wrapper для Celery: тянет /team /о-нас /контакты, LLM-извлечение ФИО."""
    async with AsyncSessionLocal() as db:
        from app.modules.maps.team_enrich import enrich_company_team
        return await enrich_company_team(db, company_id)


@celery_app.task(
    name="enrich_company_team",
    queue="maps",
    bind=True,
    max_retries=1,
    # LLM-вызовы дорогие — не больше 30 компаний в минуту, чтобы не
    # упереться в дневной лимит ProxyAPI и не выжечь $ за прогоном
    # большого поиска.
    rate_limit="30/m",
)
def enrich_company_team(self, company_id: int):
    """Извлекает ЛПР со страниц сайта компании в company_decision_makers."""
    try:
        return asyncio.run(_enrich_company_team_async(company_id))
    except Exception as exc:
        logger.warning(
            "enrich_company_team retrying company=%d: %s", company_id, exc
        )
        raise self.retry(exc=exc, countdown=30, max_retries=1)


# ---------------------------------------------------------------------------
# Marketing-DM Finder — hh, VK, оркестратор (ТЗ 2026-06-20)
# ---------------------------------------------------------------------------


async def _enrich_company_hh_async(company_id: int) -> dict:
    async with AsyncSessionLocal() as db:
        from app.modules.maps.hh_enrich import enrich_from_hh
        return await enrich_from_hh(db, company_id)


@celery_app.task(
    name="enrich_company_hh",
    queue="maps",
    bind=True,
    max_retries=1,
    # hh публичный API 5 req/сек. У нас 3 запроса на компанию, лимит 60/m
    # держим с запасом.
    rate_limit="60/m",
)
def enrich_company_hh(self, company_id: int):
    """Ищет активные маркетинговые вакансии компании на hh.ru.
    Сохраняет hiring_marketing флаг + контактное лицо вакансии."""
    try:
        return asyncio.run(_enrich_company_hh_async(company_id))
    except Exception as exc:
        logger.warning(
            "enrich_company_hh retrying company=%d: %s", company_id, exc
        )
        raise self.retry(exc=exc, countdown=30, max_retries=1)


async def _enrich_company_vk_async(company_id: int) -> dict:
    async with AsyncSessionLocal() as db:
        from app.modules.maps.vk_enrich import enrich_from_vk
        return await enrich_from_vk(db, company_id)


@celery_app.task(
    name="enrich_company_vk",
    queue="maps",
    bind=True,
    max_retries=1,
    # VK service token 3 req/сек; 2 запроса на компанию.
    rate_limit="60/m",
)
def enrich_company_vk(self, company_id: int):
    """Ищет группу ВКонтакте компании и извлекает публичные контакты
    сообщества. Без VK_SERVICE_TOKEN тихо возвращает skipped."""
    try:
        return asyncio.run(_enrich_company_vk_async(company_id))
    except Exception as exc:
        logger.warning(
            "enrich_company_vk retrying company=%d: %s", company_id, exc
        )
        raise self.retry(exc=exc, countdown=30, max_retries=1)


async def _enrich_marketing_dm_async(company_id: int) -> dict:
    async with AsyncSessionLocal() as db:
        from app.modules.maps.marketing_dm import enrich_marketing_dm
        return await enrich_marketing_dm(db, company_id)


@celery_app.task(
    name="enrich_marketing_dm",
    queue="maps",
    bind=True,
    max_retries=1,
    # Оркестратор ТОЛЬКО читает БД + считает приоритет. Тяжёлый rate-limit
    # не нужен, но 120/m держим чтобы не залить очередь при bulk-прогоне.
    rate_limit="120/m",
)
def enrich_marketing_dm(self, company_id: int):
    """Оркестратор: подтягивает egrul-персон, сверяет ЕГРН, выбирает
    маркетинг-ЛПР и метит is_marketing_dm=True одной записи."""
    try:
        return asyncio.run(_enrich_marketing_dm_async(company_id))
    except Exception as exc:
        logger.warning(
            "enrich_marketing_dm retrying company=%d: %s", company_id, exc
        )
        raise self.retry(exc=exc, countdown=30, max_retries=1)


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


@celery_app.task(name="dedup_multisource_phase2", queue="maintenance")
def dedup_multisource_phase2():
    """Cron: раз в час дедуплицирует новые пары (2gis-row, yandex_maps-row).

    Запускает scripts.dedup_multisource_phase2 в режиме --apply с дефолтным
    min-confidence=0.85. Идемпотентен — повторный прогон ничего не делает
    если новых пар нет.

    См. docs/multi-source-companies-plan.md (Phase 3).
    """
    from scripts.dedup_multisource_phase2 import run as dedup_run
    asyncio.run(dedup_run(dry_run=False, min_confidence=0.85))
    return {"status": "ok"}
