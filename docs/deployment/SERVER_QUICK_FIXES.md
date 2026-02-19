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
