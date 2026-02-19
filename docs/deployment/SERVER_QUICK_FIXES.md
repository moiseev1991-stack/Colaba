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
