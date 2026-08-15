# Runbook: деплой и стабилизация прода

**Прод:** spinlid.ru (88.210.53.183), сервер **2 ядра / 3.8GB RAM**.
**SSH:** `ssh spinlid-prod` (конфиг в `~/.ssh/config`).
**Файлы:** `/opt/colaba/docker-compose.prod.yml`, деплой-скрипт `/opt/colaba/scripts/deployment/deploy.sh`.

---

## 1. Pre-flight перед деплоем / тяжёлой операцией (ОБЯЗАТЕЛЬНО)

```bash
ssh spinlid-prod 'uptime; nproc; free -h | grep Mem; pgrep -fc chrome || echo 0'
```

| Состояние          | Признаки                                                        | Действие                                            |
| ------------------ | --------------------------------------------------------------- | --------------------------------------------------- |
| ✅ Норма           | load < 3× ядер (для 2 ядер < 6), chrome < 50, avail RAM > 500MB | Деплой разрешён                                     |
| 🟡 Мягкий перегруз | load 6–20 ИЛИ avail RAM < 500MB                                 | Пауза тяжёлых воркеров → деплой → unpause (всегда!) |
| 🔴 Инцидент        | load > 20, chrome > 200, prod не отвечает                       | Деплой ЗАПРЕЩЁН — сначала §3 «Стабилизация»         |

Пауза/снятие (использовать `pause`, НЕ `stop` — сохраняет состояние):

```bash
docker pause colaba-celery-worker-enrich-1 colaba-celery-worker-search-1
# ... деплой ...
docker unpause colaba-celery-worker-enrich-1 colaba-celery-worker-search-1
```

CI/CD делает это автоматически (шаг `Pre-deploy load check` в `deploy.yml`).

---

## 2. Ручной деплой (если нужен вне CI)

```bash
cd /opt/colaba
# перед up обязательно убрать контейнеры со старой конфигурацией,
# иначе «Conflict. The container name ... is already in use»
docker rm -f colaba-backend-1 colaba-celery-beat-1 colaba-celery-worker-1 \
           colaba-celery-worker-search-1 colaba-celery-worker-enrich-1 2>/dev/null
DEPLOY_PATH=/opt/colaba \
BACKEND_IMAGE=ghcr.io/moiseev1991-stack/colaba-backend \
FRONTEND_IMAGE=ghcr.io/moiseev1991-stack/colaba-frontend \
IMAGE_TAG=<sha-...> ./scripts/deployment/deploy.sh
```

После: `docker ps`, `curl -s localhost:8000/api/v1/health`.

---

## 3. Стабилизация при инциденте (прод не отвечает / load > 20)

Порядок строго по шагам, не перескакивать.

### 3.1 Форк-бомба Chromium (много chrome-процессов)

Симптом: `pgrep -fc chrome` = сотни/тысячи, load 50+, SSH отвечает с трудом.

```bash
# остановить источники (воркеры, которые порождают Chromium)
docker kill colaba-celery-worker-enrich-1 colaba-celery-worker-search-1

# убить все chrome-процессы (циклом — они могут плодиться)
for i in 1 2 3; do pkill -9 -f chrome; sleep 2; done
pgrep -fc chrome || echo 0   # должно быть ~0-1
```

### 3.2 OOM / нехватка памяти

```bash
dmesg -T | grep -iE "out of memory|oom" | tail -5   # кого убило
free -h
docker stats --no-stream | head -10                  # кто жрёт
```

### 3.3 Проверка здоровья

```bash
uptime                                  # load должен падать
curl -s localhost:8000/api/v1/health
docker ps --format '{{.Names}}: {{.Status}}' | grep colaba
```

### 3.4 Восстановление работы

```bash
cd /opt/colaba
docker compose -f docker-compose.prod.yml up -d celery-worker-search celery-worker-enrich
```

Если `up` падает с «container name already in use» → `docker rm -f <имя>` и повторить.

### 3.5 Очереди

```bash
docker exec colaba-backend-1 python3 -c "
import redis; r = redis.from_url('redis://redis:6379/0')
for q in ['maps','maps_enrich','maps_reviews','maps_yandex_html']:
    print(q, r.llen(q))
"
```

Взрыв одной из очередей (десятки тысяч) → смотреть состав, дедуплицировать
(примеры скриптов в истории сессии: repack поштучных enrich в batch по 10).

---

## 4. Известные инциденты и уроки

| Дата  | Что                                                         | Урок                                                 |
| ----- | ----------------------------------------------------------- | ---------------------------------------------------- |
| 13.08 | Очередь maps 17.5k задач, BlockingIOError на fork           | enrich и parse в разных очередях; batch-enrich       |
| 13.08 | Деплой упал: `next build` не скачал Google Fonts            | transient — просто перезапустить workflow            |
| 13.08 | Деплой упал: мёртвый `isSuperuser` в коде                   | локальный `next build` перед PR обязательно          |
| 15.08 | **Форк-бомба: 5759 chrome, load 109, простой ~30 мин**      | batch: контекст на компанию + timeout 480s без retry |
| 15.08 | Деплой упал: конфликт имён контейнеров после emergency stop | перед `up` делать `docker rm -f` старых              |

---

## 5. Контакты и доступы

- GitHub-токен для API: `git credential fill` (store).
- SSH-ключи: `~/.ssh/id_ed25519_colaba` (Host: spinlid-prod / colaba-server).
- Тестовый аккаунт прода: `audit-test-2026-08@protonmail.com` (для API-проверок).
