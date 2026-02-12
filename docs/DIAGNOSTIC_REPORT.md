# Диагностика Colaba

## Результаты проверки (текущее состояние)

### Контейнеры Docker
| Сервис      | Статус | Порт          |
|-------------|--------|---------------|
| postgres    | ✅ Up (healthy) | 5432 |
| redis       | ✅ Up (healthy) | 6379 |
| backend     | ✅ Up          | 8001 |
| celery-worker | ✅ Up        | —    |
| frontend    | ✅ Up          | 4000 |

### HTTP-проверки
- **Frontend** http://localhost:4000/ — **200 OK**
- **Backend** http://localhost:8001/health — **200 OK** `{"status":"healthy","version":"0.1.0"}`

### Обнаруженные проблемы

1. **CSS не загружается**
   - В HTML-ответе нет `<link rel="stylesheet">` для Tailwind/globals.css
   - Next.js App Router отдаёт потоковый HTML, CSS может подгружаться через JS
   - Критический inline CSS добавлен в layout, но может не попадать в начальный ответ

2. **Frontend в production**
   - Используется `next start` (production build)
   - Порт: 4000 (host) → 3000 (container)

## Рекомендации

### 1. Запуск без Docker (для разработки)
```powershell
cd E:\cod\Colaba\frontend
npm run dev
```
Открой http://localhost:4000 — в dev-режиме CSS обычно работает стабильнее.

### 2. Проверка в браузере
- Открой DevTools (F12) → вкладка **Console** — есть ли ошибки?
- Вкладка **Network** — загружаются ли файлы `/_next/static/...` (в т.ч. CSS)?
- Жёсткое обновление: Ctrl+Shift+R

### 3. API
- Фронтенд обращается к `NEXT_PUBLIC_API_URL` (в Docker: http://localhost:8001/api/v1)
- Убедись, что backend доступен с хоста: http://localhost:8001/health

### 4. Переключение на dev-режим в Docker
Если production CSS не работает, можно вернуть dev:
```yaml
# docker-compose.yml — frontend
dockerfile: Dockerfile.dev
ports: ["4000:4000"]
volumes: ["./frontend:/app", "/app/node_modules"]
command: npm run dev
```
