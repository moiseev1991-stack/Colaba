# Checklist: React Hydration / 502 / Консольные ошибки

## Что уже исправлено в коде

1. **ClientOnly wrapper** — контент рендерится только после mount, нет гидрации сложного дерева
2. **Theme Script удалён** — theme в `useEffect`
3. **reactStrictMode: false**
4. **Favicon** — `app/icon.svg`

---

## Что проверить после деплоя

### 1. Контейнеры (ID меняются после redeploy)

```bash
# Актуальные ID
docker ps -a | grep -E "frontend|backend|okkkosgk"

# Логи (подставь актуальный ID из вывода выше)
docker logs <frontend_container_id> --tail 50
docker logs <backend_container_id> --tail 50
```

### 2. HTTP-проверки на сервере

```bash
curl -I http://127.0.0.1:3000/    # frontend: ожидаем 200
curl http://127.0.0.1:8001/health # backend: ожидаем JSON
```

### 3. Environment Variables в Coolify

- **NEXT_PUBLIC_API_URL:** `http://cgckw04gkk0g8g0g8gcwk44w.88.210.53.183.sslip.io/api/v1`
- **CORS_ORIGINS:** `http://ck4g0000k4okkw8ck4sko0ok.88.210.53.183.sslip.io`
- После смены `NEXT_PUBLIC_API_URL` — обязателен **Redeploy** (значение зашивается при сборке)

### 4. Domains в Coolify

- **Frontend:** `ck4g0000k4okkw8ck4sko0ok...` → сервис `frontend`, порт `3000`
- **Backend:** `cgckw04gkk0g8g0g8gcwk44w...` → сервис `backend`, порт `8001`

### 5. Браузер: DevTools

- **Console** — не должно быть React #418, #423, HierarchyRequestError
- **Network** — запросы к API без CORS-ошибок и 502
- **Важно:** после деплоя — Ctrl+Shift+R (жёсткое обновление) или режим инкогнито, чтобы не использовать кэш старого JS

### 6. Открывать именно frontend-домен

- ✅ Frontend: `http://ck4g0000k4okkw8ck4sko0ok.88.210.53.183.sslip.io`
- ❌ Не открывать домен celery-worker (там будет 502)
