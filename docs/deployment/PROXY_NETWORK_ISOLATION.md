# Proxy не видит контейнеры — изоляция сетей Docker

## Что происходит

### Архитектура Coolify

```
[Пользователь] → [coolify-proxy (Traefik)] → [frontend / backend контейнеры]
                       ↑
                  в своей сети
                       ↓
              [frontend, backend, postgres...] ← в leadgen-network
```

**coolify-proxy** — это контейнер Traefik, который маршрутизирует запросы по доменам (frontend.xxx.sslip.io, backend.xxx.sslip.io). Он живёт в сетях, которые создаёт Coolify.

**Наши контейнеры** (frontend, backend, postgres, redis, celery) подключены к кастомной сети `leadgen-network`, заданной в `docker-compose.prod.yml`.

### В чём проблема

Docker изолирует сети. Контейнер в одной сети **не видит** контейнеры в другой по имени и не может до них достучаться.

- **coolify-proxy** — в сетях Coolify
- **frontend, backend** — в `leadgen-network` (или `projectname_leadgen-network`)

Они в разных сетях → proxy не может обратиться к `frontend:3000` или `backend:8000` → 502 / 504.

### Почему «иногда работает»

- После redeploy Coolify иногда подключает proxy к нужной сети
- Или порты проброшены на хост (127.0.0.1:3000, 127.0.0.1:8001), и Coolify идёт через localhost — тогда всё ок, пока порты совпадают
- После перезапуска proxy или рестарта контейнеров сеть может «отвалиться»

---

## Диагностика

### 1. В каких сетях твои контейнеры

```bash
# Все сети
docker network ls

# Сети приложения (подставь свой проект)
docker network ls | grep -E "leadgen|colaba|okkkosgk"

# Контейнеры и их сети
docker ps --format "table {{.Names}}\t{{.Networks}}\t{{.Status}}" | grep -E "frontend|backend|coolify"
```

Ожидаемо увидишь что-то вроде:
- `coolify-proxy` — сети типа `coolify_default`, `coolify_proxy`
- `colaba-frontend-xxx` — `colaba_leadgen-network` (или с другим префиксом)
- `colaba-backend-xxx` — та же сеть

### 2. Участвует ли coolify-proxy в сети приложения

```bash
# Имя сети — из вывода выше, например colaba_leadgen-network
NETWORK="colaba_leadgen-network"   # замени на своё!

# Кто в этой сети
docker network inspect $NETWORK --format '{{range .Containers}}{{.Name}} {{end}}'
```

Если в списке **нет** `coolify-proxy` — proxy не в сети приложения и не видит контейнеры.

### 3. Детальная проверка по контейнерам

```bash
# Сети coolify-proxy
docker inspect coolify-proxy --format='{{range $k,$v := .NetworkSettings.Networks}}Network: {{$k}}, IP: {{$v.IPAddress}}{{println}}{{end}}'

# Сети frontend (подставь своё имя)
docker inspect $(docker ps -q -f name=frontend) --format='{{range $k,$v := .NetworkSettings.Networks}}Network: {{$k}}, IP: {{$v.IPAddress}}{{println}}{{end}}'
```

Сравни список сетей: proxy и frontend/backend должны иметь **общую** сеть.

### 4. Проверка с хоста

```bash
# Локально контейнеры отвечают?
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/   # frontend
curl -s http://127.0.0.1:8001/health                            # backend
```

Если оба отвечают — приложение работает, а 502/504 идут из-за proxy/сети.

---

## Решение 1: Ручное подключение proxy (быстрое)

Подключаем **coolify-proxy** к сети приложения:

```bash
# 1. Узнать точное имя сети
docker network ls | grep leadgen
# Пример: colaba_leadgen-network

# 2. Подключить proxy
docker network connect colaba_leadgen-network coolify-proxy
```

Проверка:
```bash
docker network inspect colaba_leadgen-network --format '{{range .Containers}}{{.Name}} {{end}}'
# Должен появиться coolify-proxy
```

Минусы:
- После перезапуска **coolify-proxy** подключение может слететь
- После каждого Redeploy приложения сеть может пересоздаваться с новым именем — тогда команду нужно повторить

---

## Решение 2: Destinations в Coolify (рекомендуемый долгосрочный вариант)

Coolify умеет сам создавать сети и подключать к ним proxy. Это делается через **Destinations**.

### Шаги

1. **Coolify → Destinations → + Add**
   - Server: твой сервер (spinlid)
   - Network Name: например `colaba-main`
   - Сохранить

2. **Назначить приложение в этот destination**
   - Зайти в приложение Colaba
   - В настройках найти **Destination** / **Network**
   - Выбрать созданный destination

3. **Убрать кастомную сеть из docker-compose** (важно)
   - Удалить секцию `networks:` и ссылки `networks: - leadgen-network` из `docker-compose.prod.yml`
   - Coolify сам создаст сеть и подключит к ней proxy и контейнеры

4. **Redeploy**

Подробнее: [Coolify Destinations](https://coolify.io/docs/knowledge-base/destinations/create)

---

## Решение 3: Без кастомной сети в compose

Если не хочешь использовать Destinations, можно убрать свою сеть и положиться на default-сеть compose:

- В `docker-compose.prod.yml` удалить `networks:` и все `networks: - leadgen-network`
- Coolify при деплое создаст default-сеть и подключает к ней proxy

Минус: postgres, redis, celery и backend общаются по именам сервисов (`postgres:5432`, `redis:6379`). В default-сети compose они всё равно будут в одной сети. Нужно проверить, что Coolify действительно подключает proxy к этой default-сети.

---

## Чек-лист для Colaba

| Шаг | Команда / действие |
|-----|---------------------|
| 1. Сети | `docker network ls \| grep -E "leadgen|colaba"` |
| 2. Proxy в сети? | `docker network inspect <сеть> \| grep coolify-proxy` |
| 3. Временно починить | `docker network connect <сеть> coolify-proxy` |
| 4. Проверить | Открыть frontend/backend по домену |
| 5. На будущее | Destinations или убрать custom network |

---

## Частые вопросы

**Q: Имя сети меняется после каждого deploy?**  
A: Зависит от настроек Coolify. Обычно используется префикс проекта (например `colaba_`). После Redeploy лучше снова выполнить `docker network ls` и при необходимости повторить `docker network connect`.

**Q: Команда `docker network connect` выдаёт "already exists"?**  
A: Proxy уже в этой сети — проблема, скорее всего, в чём-то другом (порты, Domains, таймауты).

**Q: После connect всё равно 502?**  
A: Проверь Domains в Coolify: frontend → порт 3000, backend → порт 8001. И что `curl` на 127.0.0.1 отвечает.
