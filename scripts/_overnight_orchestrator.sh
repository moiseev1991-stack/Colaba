#!/usr/bin/env bash
# Автономный оркестратор на 8 часов. Не коммитить (префикс _).
#
# Что делает:
#   T+0:00 — запущено 3 партии (150 запросов), уже в celery
#   T+1:30 — партия 4 (fitness/beauty × 10 городов)
#   T+2:00 — rebuild-pain-tags для готовых ниш
#   T+3:30 — партия 5 (education × 10 городов)
#   T+4:00 — rebuild-pain-tags второй проход
#   T+6:00 — rebuild-pain-tags финальный проход
#
# Логи в /tmp/overnight_*.log — юзер сможет утром посмотреть.

set -u
cd /e/cod/Colaba

export PROD_JWT="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIiwiZXhwIjoxNzgzOTg3OTAzLCJpYXQiOjE3ODM5NzM1MDN9.EEqUUKPZyIDLlkojd91jE7qaA2tQEn79hulUn-zMkDc"
export PYTHONIOENCODING=utf-8

LOG=/tmp/overnight_orchestrator.log
echo "=== START $(date +%H:%M:%S) ===" >> $LOG

# ---------- T+1:30 (5400 sec): партия 4 (фитнес/красота) ----------
echo "$(date +%H:%M:%S) waiting 90 min for first celery drain…" >> $LOG
sleep 5400

echo "=== $(date +%H:%M:%S) BATCH 4 fitness/beauty ===" >> $LOG
NICHES="фитнес клуб,йога студия,массажный салон,спа-салон,салоны красоты" \
  python -u scripts/bulk_niche_parse.py >> $LOG 2>&1

# ---------- T+2:00: rebuild-pain-tags первый проход ----------
sleep 1800
echo "=== $(date +%H:%M:%S) REBUILD PASS 1 ===" >> $LOG
NICHES="стоматология,косметология,лазерная эпиляция,барбершоп,ветеринарная клиника" \
  python -u scripts/rebuild_pain_tags_for_niche.py >> $LOG 2>&1

# ---------- T+3:30: партия 5 (образование/услуги) ----------
sleep 5400
echo "=== $(date +%H:%M:%S) BATCH 5 education/services ===" >> $LOG
NICHES="музыкальная школа,школа танцев,курсы программирования,репетиторский центр,подготовка к егэ" \
  python -u scripts/bulk_niche_parse.py >> $LOG 2>&1

# ---------- T+4:00: rebuild пpоход 2 (batch 2 + 3 ниши) ----------
sleep 1800
echo "=== $(date +%H:%M:%S) REBUILD PASS 2 ===" >> $LOG
NICHES="клиника пластической хирургии,офтальмологическая клиника,детская стоматология,медицинский центр,ортодонтия" \
  python -u scripts/rebuild_pain_tags_for_niche.py >> $LOG 2>&1
NICHES="дерматологическая клиника,школа английского языка,детский центр развития,автошкола,юридическая консультация" \
  python -u scripts/rebuild_pain_tags_for_niche.py >> $LOG 2>&1

# ---------- T+6:00: финальный rebuild всех 25 ниш ----------
sleep 7200
echo "=== $(date +%H:%M:%S) REBUILD FINAL ALL 25 ===" >> $LOG
NICHES="стоматология,косметология,лазерная эпиляция,барбершоп,ветеринарная клиника,клиника пластической хирургии,офтальмологическая клиника,детская стоматология,медицинский центр,ортодонтия,дерматологическая клиника,школа английского языка,детский центр развития,автошкола,юридическая консультация,фитнес клуб,йога студия,массажный салон,спа-салон,салоны красоты,музыкальная школа,школа танцев,курсы программирования,репетиторский центр,подготовка к егэ" \
  python -u scripts/rebuild_pain_tags_for_niche.py >> $LOG 2>&1

echo "=== $(date +%H:%M:%S) DONE ===" >> $LOG
