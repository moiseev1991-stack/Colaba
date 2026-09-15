#!/bin/bash
# Супервизор добивки кампаний прогрева 49/50 (15.09.2026).
# Живёт на хосте (переживает рестарты контейнеров), каждые 10 минут:
# - если обе кампании completed — выходит;
# - если скрипт добивки не запущен в контейнере — (пере)запускает его.
# Идемпотентность: скрипт сам считает недостающее из БД.
# Лог супервизора: /tmp/backfill_supervisor.log

PSQL="docker exec colaba-postgres-1 psql -U leadgen_user -d leadgen_db -tA"

for i in $(seq 1 40); do
  s49=$($PSQL -c "SELECT count(*) FROM email_logs WHERE campaign_id=49 AND status='sent'" 2>/dev/null)
  c49=$($PSQL -c "SELECT status FROM email_campaigns WHERE id=49" 2>/dev/null)
  s50=$($PSQL -c "SELECT count(*) FROM email_logs WHERE campaign_id=50 AND status='sent'" 2>/dev/null)
  c50=$($PSQL -c "SELECT status FROM email_campaigns WHERE id=50" 2>/dev/null)
  echo "$(date +%H:%M:%S) 49: ${s49:-?}/100 [${c49:-?}]  50: ${s50:-?}/110 [${c50:-?}]"

  if [ "$c49" = "completed" ] && [ "$c50" = "completed" ]; then
    echo "$(date +%H:%M:%S) DONE: обе кампании завершены"
    break
  fi

  if docker top colaba-celery-worker-1 -o pid,cmd 2>/dev/null | grep -q backfill_warmup_campaigns; then
    : # скрипт ещё работает в контейнере — не дублируем
  else
    docker cp /tmp/backfill_warmup_campaigns.py colaba-celery-worker-1:/tmp/backfill_warmup_campaigns.py \
      && docker exec -d colaba-celery-worker-1 sh -c "cd /app && python /tmp/backfill_warmup_campaigns.py >> /tmp/backfill_warmup.log 2>&1" \
      && echo "$(date +%H:%M:%S) (пере)запущен скрипт добивки"
  fi
  sleep 600
done
