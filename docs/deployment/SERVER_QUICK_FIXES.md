# Быстрые шаги на сервере

## Порт 8001 занят (Bind failed: port is already allocated)

На сервере выполните:

```bash
cd /opt/colaba

# 1. Найти контейнер, занимающий порт
docker ps --format "table {{.Names}}\t{{.Ports}}" | grep -E "8001|3000"

# 2. Остановить ВСЕ контейнеры Colaba
docker compose -f docker-compose.prod.yml down

# 3. Запустить снова (если деплой через GitHub — перезапустить workflow)
docker compose -f docker-compose.prod.yml up -d
```

**Если деплой через Coolify и GitHub Actions** — отключите один из них, чтобы не конфликтовали по портам.

### Перед деплоем через Coolify

Если используете **Coolify** для деплоя — перед запуском деплоя остановите ручной стоп из `/opt/colaba`:

```bash
cd /opt/colaba
docker compose -f docker-compose.prod.yml down
```

Иначе порты 8001 и 3000 заняты, и Coolify не сможет поднять свои контейнеры.

---

## Два деплоя Colaba — домены ведут не туда

Сейчас могут работать **colaba-frontend-1** (деплой из /opt/colaba или GitHub) и **frontend-w0wok0gck...** (Coolify app). Домены в Coolify (ck4g..., cgckw...) привязаны к приложению **okkkosgk8ckk00g8goc8g4sk**. Если у него нет своих контейнеров — будет 404/504.

**Что сделать:** В Coolify → приложение Colaba (okkkosgk8ckk) → **Servers** — выбрать Server/Destination так, чтобы он указывал на сеть с colaba-frontend-1, или сделать Redeploy приложения okkkosgk8ckk, чтобы поднялись его контейнеры.

---

## Вариант Б: Traefik labels (деплой из /opt/colaba)

Если деплоите через `docker compose` из `/opt/colaba` (GitHub Actions или вручную), в `docker-compose.prod.yml` уже добавлены Traefik labels. Traefik (coolify-proxy) будет маршрутизировать запросы на frontend и backend.

**Шаги:**

1. Подключить coolify-proxy к сети:
   ```bash
   docker network connect colaba_leadgen-network coolify-proxy
   ```
   (или `bash scripts/deployment/fix-coolify-404.sh`)

2. Запустить приложение:
   ```bash
   cd /opt/colaba
   docker compose -f docker-compose.prod.yml up -d
   ```

3. Проверить: `http://88.210.53.183/` и `http://ck4g0000k4okkw8ck4sko0ok.88.210.53.183.sslip.io/`

**NEXT_PUBLIC_API_URL** должен указывать на backend: `http://88.210.53.183/api/v1` или `http://cgckw04gkk0g8g0g8gcwk44w.88.210.53.183.sslip.io/api/v1`. После смены — Redeploy frontend.

---

## 404 при открытии домена (curl 127.0.0.1:3000 работает, браузер — 404)

Traefik (coolify-proxy) не видит контейнеры — они в другой сети. Подключите proxy к сети приложения:

```bash
# 1. Узнать имя сети (подставь свой UUID из Coolify)
docker network ls | grep -E "okkkosgk8ckk|leadgen"

# 2. Подключить coolify-proxy к сети приложения
docker network connect <ИМЯ_СЕТИ> coolify-proxy
```

Пример: если сеть `okkkosgk8ckk00g8goc8g4sk_leadgen-network`:
```bash
docker network connect okkkosgk8ckk00g8goc8g4sk_leadgen-network coolify-proxy
```

Проверка: `docker network inspect <ИМЯ_СЕТИ> --format '{{range .Containers}}{{.Name}} {{end}}'` — должен быть coolify-proxy.

Скрипт: `bash scripts/deployment/fix-coolify-404.sh` (запускать на сервере из корня репозитория).

Подробнее: `docs/deployment/PROXY_NETWORK_ISOLATION.md`

---

## На сервере нет `frontend` и `npm`

На сервере приложение работает только через **Docker**. Не нужны `cd frontend` и `npm run dev`.

Команды на сервере:
- `cd /opt/colaba` — каталог проекта
- `docker compose -f docker-compose.prod.yml up -d` — запуск
- `docker compose -f docker-compose.prod.yml down` — остановка

---

## Локальная разработка (Windows)

Только на вашем компьютере:

```powershell
cd e:\cod\Colaba\frontend
npm run dev
```

Открыть **http://localhost:4000** (не file://)

**Если CSS не грузится** — убедитесь, что открываете именно http://localhost:4000, а не сохранённый HTML. Удалите кэш сайта (F12 → Application → Clear site data).

---

## Диагностика (когда 404/504)

```bash
# Логи frontend и backend (подставь свои имена контейнеров)
docker logs colaba-frontend-1 --tail 30
docker logs colaba-backend-1 --tail 30

# В какой сети colaba-frontend-1?
docker inspect colaba-frontend-1 --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}'

# Есть ли coolify-proxy в той же сети?
docker network inspect colaba_leadgen-network --format '{{range .Containers}}{{.Name}} {{end}}'
```

**Важно:** Подставляй реальные имена контейнеров (например `colaba-frontend-1`), а не `<frontend_container_name>`.

---

## Сервер localhost и host.docker.internal

Если в Coolify → Servers → localhost в поле **IP Address/Domain** стоит `host.docker.internal` — на Linux это часто не работает. Рекомендуется:

- **На том же сервере:** `127.0.0.1` или `localhost`
- **С другого сервера/интернета:** реальный IP сервера (например `88.210.53.183`)

Красный статус «Server: localhost» часто связан с тем, что Coolify не может достучаться по `host.docker.internal`.
