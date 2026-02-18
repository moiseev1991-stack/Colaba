# 504 Gateway Timeout — что сделать

## 1. Очистить Pre/Post Deployment (обязательно)

В Coolify → Configuration → **Advanced** → Pre/Post Deployment Commands:

- **Pre-deployment Command** — **удали** `php artisan migrate`, оставь **пусто**
- **Pre-deployment Container Name** — пусто
- **Post-deployment Command** — **удали** `php artisan migrate`, оставь **пусто**
- **Post-deployment Container Name** — пусто

Нажми **Save**. `php artisan migrate` — команда Laravel, у нас FastAPI. Она мешает деплою.

---

## 2. Увеличить таймаут Traefik

Coolify → **Servers** → твой сервер (spinlid) → **Proxy** → Command / Custom configuration.

Добавь строки:
```
--entrypoints.https.transport.respondingTimeouts.readTimeout=5m
--entrypoints.http.transport.respondingTimeouts.readTimeout=5m
```

Сохрани и **перезапусти Proxy**.

---

## 3. Подключить coolify-proxy к сети приложения (если 504 всё ещё есть)

На сервере в терминале:

```bash
# Узнать имя сети приложения
docker network ls | grep -E "leadgen|okkkosgk"

# Подключить proxy (подставь точное имя сети из вывода выше)
docker network connect <имя_сети> coolify-proxy
```

Пример имени: `colaba_leadgen-network` или `..._okkkosgk8ckk00g8goc8g4sk`.

---

## 4. Redeploy

Configuration → Save → **Redeploy**. Подожди 2–3 минуты.

---

## 5. Открыть frontend

```
http://ck4g0000k4okkw8ck4sko0ok.88.210.53.183.sslip.io
```
