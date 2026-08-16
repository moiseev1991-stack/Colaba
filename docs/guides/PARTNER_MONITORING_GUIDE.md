# Памятка партнёру и агенту: мониторинг марафона и выгрузка результатов

**Обновлено:** вс 16.08.2026
**Для:** партнёр + агент (доступ к серверу не обязателен, но для агента — есть)

---

## 1. Что сейчас происходит

На проде spinlid.ru идёт **марафон парсинга: 3000 поисков** по матрице
«238 бизнес-ниш × 46 городов РФ». Запущен сб 15.08 ~19:47, финиш —
ожидается **вс 16.08 вечер / Пн ночь** (дедлайн был Пн 12:00 — успеваем
с запасом).

Марафон собирает по каждой паре (ниша, город):

1. **Компании** (~30 шт., Яндекс.Карты)
2. **Отзывы** (~35 на компанию)
3. Далее фоном (не блокирует сбор): **контакты** (телефоны, сайты,
   email, telegram/whatsapp/vk) и **боли клиентов** (AI-кластеры из отзывов)

Все поиски привязаны к аккаунту **sir.nikam@example.com** и видны в
истории интерфейса.

---

## 2. Доступы

| Что                        | Как                                                                                                                 |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Сайт (UI)                  | https://spinlid.ru → вход `sir.nikam@example.com`                                                                   |
| SSH на сервер (для агента) | `ssh spinlid-prod` (конфиг уже в `~/.ssh/config` на рабочей машине; сервер 88.210.53.183, ключ `id_ed25519_colaba`) |
| Файлы марафона на сервере  | `/opt/orch3000/` (логи, памятка, скрипт)                                                                            |

---

## 3. Мониторинг ЧЕРЕЗ САЙТ (без SSH) — для партнёра

### Прогресс поисков

`Лиды → История` (`/app/leads/history`): сверху вниз — все запущенные
поиски со статусом. Статусы:

- `pending/running` — в работе
- `completed` — готов (кол-во компаний справа)
- Плейс «Ничего не нашлось» — ниша в этом городе пустая (норма для малых городов)

### Результаты поиска

Клик по поиску → таблица компаний: телефоны/сайты появляются по мере
обогащения (колонки заполняются не сразу — это нормально).

### Боли

`/app/pains` — выбрать нишу/город → плитки болей. Появляются после
AI-обработки отзывов (для свежих ниш — с задержкой, см. §6).

---

## 4. Мониторинг ЧЕРЕЗ SSH (для агента) — команды копипаст

### 4.1 Главные показатели (одной командой)

```bash
ssh spinlid-prod '
date
echo "— МАРАФОН —"
grep -c "волна .* запущено" /opt/orch3000/progress.log
tail -3 /opt/orch3000/progress.log
echo "— РЕСУРСЫ —"
cat /proc/loadavg
free -m | grep Mem
df -h / | tail -1
echo "— ОЧЕРЕДИ —"
docker exec colaba-backend-1 python3 -c "import redis; r=redis.from_url(\"redis://redis:6379/0\"); print({q: r.llen(q) for q in [\"maps\",\"maps_reviews\",\"maps_yandex_html\",\"maps_enrich\"]})"
'
```

### 4.2 Как читать цифры (шкала нормальности)

| Метрика            | 🟢 Норма            | 🟡 Внимание | 🔴 Действовать                           |
| ------------------ | ------------------- | ----------- | ---------------------------------------- |
| Load average       | < 10                | 10–18       | > 20 стабильно — см. §7                  |
| RAM avail          | > 1000 MB           | 450–1000    | < 450 — см. §7                           |
| Диск свободно      | > 50 GB             | 20–50       | < 20                                     |
| Очередь `maps`     | 0–40                | 40–200      | растёт часами при простое search-воркера |
| `maps_yandex_html` | растёт до Пн — норм | —           | после Пн должна убывать до 0             |
| Chrome-процессы    | < 300 живых         | 300–600     | > 1000 живых (не зомби)                  |

Зомби-процессы (stat Z) — безвредны, не жрут ресурсы, игнорировать:

```bash
ps aux | grep "[c]hrome" | awk '{print $8}' | grep -c Z
```

### 4.3 Живы ли исполнители

```bash
ssh spinlid-prod 'docker ps --format "{{.Names}}: {{.Status}}" | grep colaba'
```

Ожидаем: backend, celery-worker (может быть «paused» до Пн 09:00 — это
запланировано), celery-worker-search (Up), celery-worker-enrich (может
быть «paused» до Пн 09:00 — запланировано), beat, frontend, postgres, redis.

Логи search-воркера (последние события):

```bash
ssh spinlid-prod 'docker logs --since=5m colaba-celery-worker-search-1 2>&1 | grep -E "received|succeeded" | tail -5'
```

Если 5 минут тишины при непустой очереди `maps` — воркер завис, см. §7.

---

## 5. Когда всё завершится: три этапа

### Этап 1 — Марафон поисков (компании + отзывы)

**Признак завершения** — строка в логе:

```bash
ssh spinlid-prod 'grep "МАРАФОН ЗАВЕРШЁН" /opt/orch3000/progress.log'
```

Появилась → все 3000 поисков запущены и отработали.
Прогресс в долях: `волна N/600` в `tail /opt/orch3000/progress.log`.

### Этап 2 — Контакты (обогащение)

Начнут массово догонять **после Пн 09:00** (cron сам разморозит воркер).
**Признак завершения:** очередь `maps_yandex_html` = 0 и не растёт:

```bash
ssh spinlid-prod 'docker exec colaba-backend-1 python3 -c "import redis; r=redis.from_url(\"redis://redis:6379/0\"); print(r.llen(\"maps_yandex_html\"))"'
```

Срок: несколько дней после марафона (≈190 компаний/час; 90 тыс. компаний
≈ 5–7 дней; частично уже обогащены).

### Этап 3 — Боли (AI)

Воркер embeddings размораживается тем же cron Пн 09:00.
**Признак прогресса:** в `/app/pains` у ниш появляются/растут плитки.
Срок: ~2–3 дня после марафона.

### Автоматика Пн 09:00 (уже настроена, ничего делать не надо)

```bash
ssh spinlid-prod 'cat /etc/cron.d/unpause-emb'   # проверка, что на месте
```

Выполняет: unpause enrich (контакты) + unpause celery-worker (боли).

---

## 6. Скачивание результатов

### 6.1 Из интерфейса (просто)

**Компании + контакты одного поиска:**
`Лиды → История` → открыть поиск → кнопка экспорта (CSV) — с фильтрами:
мин. рейтинг, мин. отзывы, только с сайтом, только с ЛПР и т.д.

**Компании по боли (Excel, вкладка с болями и цитатами):**
`/app/pains` → выбрать нишу/город → плитка боли → кнопка экспорта (XLSX).

### 6.2 Через API (для массовых выгрузок агентом)

Получить токен:

```bash
TOKEN=$(curl -s -X POST https://spinlid.ru/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"sir.nikam@example.com","password":"<ПАРОЛЬ>"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")
```

CSV компаний одного поиска (все фильтры опциональны):

```bash
curl -H "Authorization: Bearer $TOKEN" -o companies.csv \
  "https://spinlid.ru/api/v1/maps/search/<ID_ПОИСКА>/export?min_reviews=5"
```

Excel по боли (pain_key — из списка; ниша/город опционально):

```bash
curl -H "Authorization: Bearer $TOKEN" -o pains.xlsx \
  "https://spinlid.ru/api/v1/maps/pains/companies/export?niche=стоматология&city=Москва"
```

ID поисков — из истории на сайте, либо списком:

```bash
curl -H "Authorization: Bearer $TOKEN" \
  "https://spinlid.ru/api/v1/maps/searches?limit=100" | python3 -m json.tool | head -40
```

### 6.3 Полная выгрузка из БД (агент, самая полная картина)

Все компании марафона с контактами → CSV на сервере:

```bash
ssh spinlid-prod 'docker exec colaba-postgres-1 psql -U leadgen_user -d leadgen_db -c "
COPY (
  SELECT c.id, c.niche, c.city, c.name, c.phone, c.website,
         c.emails, c.rating, c.reviews_count, c.contacts_extra,
         c.lead_temperature, c.created_at
  FROM companies c
  WHERE c.created_at > '"'"'2026-08-15 19:46'"'"'
  ORDER BY c.niche, c.city
) TO '"'"'/tmp/companies_full.csv'"'"' WITH CSV HEADER;" \
&& docker cp colaba-postgres-1:/tmp/companies_full.csv /opt/orch3000/companies_full.csv'
# забрать на свою машину:
scp spinlid-prod:/opt/orch3000/companies_full.csv .
```

Сводка «боли по нишам» (сколько готово):

```bash
ssh spinlid-prod 'docker exec colaba-postgres-1 psql -U leadgen_user -d leadgen_db -c "
SELECT niche, COUNT(*) AS pain_tags, SUM(occurrences_count) AS mentions
FROM pain_tags WHERE status='"'"'active'"'"' GROUP BY niche ORDER BY 2 DESC LIMIT 20;"'
```

Общая статистика марафона:

```bash
ssh spinlid-prod 'docker exec colaba-postgres-1 psql -U leadgen_user -d leadgen_db -c "
SELECT COUNT(*) companies, COUNT(DISTINCT niche) niches, COUNT(DISTINCT city) cities,
       SUM(reviews_count) reviews,
       COUNT(*) FILTER (WHERE phone IS NOT NULL) with_phone,
       COUNT(*) FILTER (WHERE website IS NOT NULL) with_site
FROM companies WHERE created_at > '"'"'2026-08-15 19:46'"'"';"'
```

---

## 7. Если что-то встало (простые процедуры агента)

**Марафон молчит > 15 мин (нет новых «волна N» в progress.log):**

```bash
ssh spinlid-prod 'pkill -f "orch.py"; sleep 2; \
  nohup python3 /opt/orch3000/orch.py >> /opt/orch3000/nohup.out 2>&1 & echo restarted'
```

Безопасно: дубликаты невозможны (готовые пары ниша×город отфильтровываются).

**Search-воркер молчит в логах при очереди maps > 0:**

```bash
ssh spinlid-prod 'docker restart colaba-celery-worker-search-1'
```

**Сервер перегружен (load > 20, сайт тормозит):**

```bash
ssh spinlid-prod 'docker pause colaba-celery-worker-enrich-1; pkill -9 -f "[c]hrome"'
```

и подождать снижения load < 10. (Сейчас enrich и так на паузе до Пн.)

**Полная остановка марафона (тревожная кнопка):**

```bash
ssh spinlid-prod 'touch /opt/orch3000/STOP'   # завершит текущую волну и выйдет
```

**Прод не отвечает вовсе** — действовать по `docs/deployment/DEPLOY_RUNBOOK.md`
(стабилизация при инцидентах).

---

## 8. Словарь

| Термин           | Что значит                                           |
| ---------------- | ---------------------------------------------------- |
| Волна            | пачка из 5 поисков, запускаются раз в ~1.5–4 мин     |
| maps (очередь)   | задачи поиска компаний                               |
| maps_reviews     | задачи сбора отзывов                                 |
| maps_yandex_html | задачи обогащения контактов (Playwright, медленные)  |
| maps_enrich      | DM-finder (ЛПР из vk/hh), заморожен до ручного пуска |
| Боли             | AI-кластеры жалоб клиентов из отзывов                |
| Зомби (Z)        | мёртвые процессы-записи, безвредны                   |
| from_cache       | поиск из кэша (быстро, компании уже были)            |

---

## 9. Кому что делать в Пн

| Роль    | Действия                                                                                                         |
| ------- | ---------------------------------------------------------------------------------------------------------------- |
| Партнёр | Пн ~12:00: посмотреть `/app/leads/history` (3000 поисков), скачать CSV по нужным нишам из UI                     |
| Агент   | Утром: проверить cron-разморозку (§5), мониторить догон контактов (§5, признаки), к среде — полная выгрузка §6.3 |
