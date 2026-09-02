"""Идемпотентно добавляет init: true + --max-tasks-per-child к celery-worker-search
и celery-worker-enrich в /opt/colaba/docker-compose.prod.yml на проде.

Лечит утечку chromium/node zombie-процессов под celery-prefork (см.
project_pipeline_unblocked). Запускается на сервере: base64 -d | python3 -.
"""

import sys

P = "/opt/colaba/docker-compose.prod.yml"
s = open(P, encoding="utf-8").read()

if "max-tasks-per-child" in s:
    print("ALREADY_PATCHED")
    sys.exit(0)

search_old = (
    "    command: celery -A app.queue.celery_app worker --loglevel=info "
    "--concurrency=2 --prefetch-multiplier=1 -Q search_queue,maps,maps_reviews"
)
search_new = (
    "    init: true\n"
    "    command: celery -A app.queue.celery_app worker --loglevel=info "
    "--concurrency=2 --prefetch-multiplier=1 --max-tasks-per-child=20 "
    "-Q search_queue,maps,maps_reviews"
)
enrich_old = (
    "    command: celery -A app.queue.celery_app worker --loglevel=info "
    "--concurrency=2 --prefetch-multiplier=1 -Q maps_enrich,maps_yandex_html,maps_2gis_html"
)
enrich_new = (
    "    init: true\n"
    "    command: celery -A app.queue.celery_app worker --loglevel=info "
    "--concurrency=2 --prefetch-multiplier=1 --max-tasks-per-child=10 "
    "-Q maps_enrich,maps_yandex_html,maps_2gis_html"
)

changed = 0
if search_old in s:
    s = s.replace(search_old, search_new)
    changed += 1
else:
    print("WARN: search command line not found as-is")
if enrich_old in s:
    s = s.replace(enrich_old, enrich_new)
    changed += 1
else:
    print("WARN: enrich command line not found as-is")

open(P, "w", encoding="utf-8").write(s)
print(f"PATCHED changed={changed}")
