# Настройка GitHub Actions CI/CD

Полная инструкция по настройке CI/CD для проекта Colaba.

## Обзор архитектуры

- **CI**: Запускается при каждом `push` и `pull_request`
  - Backend: запуск тестов (`pytest`)
  - Frontend: линтинг, проверка типов, тесты (`jest`)
- **Deploy**: Запускается автоматически после успешного CI на ветке `main`
  - **Build**: Сборка Docker-образов и публикация в GHCR (GitHub Container Registry)
  - **Deploy**: Деплой на сервер через self-hosted runner

```
Push/PR --> CI Workflow
  |-- Backend Tests (pytest)
  +-- Frontend Checks (lint, type-check, jest)

CI Success --> Deploy Workflow
  |-- Build Images (GitHub-hosted)
  |   |-- Build backend image
  |   |-- Build frontend image
  |   +-- Push to GHCR
  +-- Deploy (self-hosted runner)
      |-- Copy files to /opt/colaba
      |-- Pull images from GHCR
      |-- Run migrations
      |-- Start services
      +-- Health checks
```

---

## Шаг 1: Подготовка сервера

### Установка Docker и Docker Compose

```bash
sudo apt update
sudo apt -y install ca-certificates curl gnupg

sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo \"$VERSION_CODENAME\") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
sudo apt -y install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

### Создание пользователя deploy

```bash
sudo adduser --disabled-password --gecos "" deploy || true
sudo usermod -aG docker deploy
sudo mkdir -p /opt/colaba
sudo chown -R deploy:deploy /opt/colaba
```

После добавления пользователя в группу `docker` необходимо перелогиниться.

---

## Шаг 2: Настройка Self-hosted Runner

1. Перейдите в репозиторий: **Settings --> Actions --> Runners --> New self-hosted runner**
2. Выберите **Linux** и скопируйте команды установки
3. На сервере выполните команды под пользователем `deploy`:
   ```bash
   mkdir -p /opt/actions-runner && cd /opt/actions-runner
   curl -o actions-runner-linux-x64-2.311.0.tar.gz -L https://github.com/actions/runner/releases/download/v2.311.0/actions-runner-linux-x64-2.311.0.tar.gz
   tar xzf ./actions-runner-linux-x64-2.311.0.tar.gz
   ./config.sh --url https://github.com/moiseev1991-stack/Colaba --token <TOKEN>
   ```
4. Добавьте label (например, `colaba-prod`) при настройке
5. Запустите runner как systemd service:
   ```bash
   cd /opt/actions-runner
   sudo ./svc.sh install deploy
   sudo ./svc.sh start
   sudo ./svc.sh status
   ```

---

## Шаг 3: Файл окружения на сервере

Создайте файл `/opt/colaba/.env`:

```bash
sudo -u deploy nano /opt/colaba/.env
```

### Обязательные переменные

```env
SECRET_KEY=<сгенерируйте_надежный_секретный_ключ>
POSTGRES_USER=leadgen_user
POSTGRES_PASSWORD=<надежный_пароль>
POSTGRES_DB=leadgen_db
DATABASE_URL=postgresql+asyncpg://leadgen_user:<пароль>@postgres:5432/leadgen_db
DATABASE_URL_SYNC=postgresql://leadgen_user:<пароль>@postgres:5432/leadgen_db
REDIS_URL=redis://redis:6379/0
CELERY_BROKER_URL=redis://redis:6379/0
CELERY_RESULT_BACKEND=redis://redis:6379/0
NEXT_PUBLIC_API_URL=https://your-domain.com/api/v1
CORS_ORIGINS=https://your-domain.com
LOG_LEVEL=INFO
```

### Опциональные переменные

```env
ENVIRONMENT=production
DEBUG=False
BACKEND_PORT=8000
FRONTEND_PORT=3000
BACKEND_WORKERS=2
CELERY_CONCURRENCY=2
OPENAI_API_KEY=
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama2
YANDEX_XML_FOLDER_ID=
YANDEX_XML_KEY=
USE_PROXY=false
PROXY_URL=
PROXY_LIST=
```

### Генерация секретных значений

```bash
# SECRET_KEY
python -c "import secrets; print(secrets.token_urlsafe(32))"
# или
openssl rand -base64 32

# POSTGRES_PASSWORD
openssl rand -base64 24
```

### Права доступа

```bash
sudo chmod 600 /opt/colaba/.env
sudo chown deploy:deploy /opt/colaba/.env
```

---

## Шаг 4: GitHub Secrets и Variables

### Secrets -- НЕ требуются

В текущей конфигурации используются встроенные токены GitHub Actions (`GITHUB_TOKEN`), поэтому **дополнительные Secrets добавлять НЕ нужно**.

### Variables -- опционально

**Путь:** Settings --> Secrets and variables --> Actions --> Variables

| Имя переменной | Значение | Описание |
|----------------|----------|----------|
| `BACKEND_PORT` | `8000` | Порт backend (если отличается от дефолтного) |
| `FRONTEND_PORT` | `3000` | Порт frontend (если отличается от дефолтного) |

---

## Шаг 5: Workflow файлы

### `.github/workflows/ci.yml`

Запускается при каждом `push` и `pull_request`:
- **Backend job**: Python 3.11, PostgreSQL + Redis services, `pytest`
- **Frontend job**: Node.js 20, `npm run lint`, `npm run type-check`, `npm test`

### `.github/workflows/deploy.yml`

Запускается после успешного CI на ветке `main`:

1. **Job: build_images** (GitHub-hosted runner)
   - Имена образов: `ghcr.io/<owner>/<repo>-backend` и `ghcr.io/<owner>/<repo>-frontend`
   - Теги: `sha-<commit_sha>` и `latest`
   - Сборка и публикация в GHCR

2. **Job: deploy** (self-hosted runner)
   - Копирует `docker-compose.prod.yml` и `scripts/deployment/deploy.sh` в `/opt/colaba`
   - Поднимает инфраструктуру (postgres, redis)
   - Скачивает образы из GHCR
   - Запускает миграции Alembic
   - Запускает все сервисы
   - Проверяет health endpoints

---

## Чеклист проверки

### GitHub репозиторий
- [ ] Workflow файлы в `.github/workflows/` (`ci.yml`, `deploy.yml`)
- [ ] Файлы проекта закоммичены и запушены

### Self-hosted Runner
- [ ] Docker установлен (`docker --version`)
- [ ] Docker Compose установлен (`docker compose version`)
- [ ] Пользователь `deploy` создан и в группе `docker`
- [ ] Runner установлен в `/opt/actions-runner`
- [ ] Runner запущен как systemd service
- [ ] Runner виден в GitHub (статус: Online)

### Файл окружения
- [ ] `/opt/colaba/.env` создан
- [ ] Все обязательные переменные заполнены
- [ ] Права доступа: `-rw------- 1 deploy deploy`
- [ ] Файл НЕ в репозитории (проверьте `.gitignore`)

### Тестирование CI
- [ ] Тестовый commit/push --> workflow `CI` запустился
- [ ] `Backend tests` прошел
- [ ] `Frontend checks` прошел

### Тестирование Deploy
- [ ] Merge в `main` --> workflow `Deploy (main)` запустился
- [ ] `build_images` собрал и запушил образы в GHCR
- [ ] `deploy` выполнился на self-hosted runner
- [ ] Контейнеры запущены: `docker compose -f docker-compose.prod.yml ps`
- [ ] Health check: `curl http://localhost:8000/health`
- [ ] Frontend: `curl http://localhost:3000/`

---

## Troubleshooting

### Runner не запускается
```bash
cd /opt/actions-runner
sudo ./svc.sh status
sudo ./svc.sh restart
sudo journalctl -u actions.runner.* -f
```

### Не удается скачать образы из GHCR
1. Runner имеет доступ к интернету
2. Правильный токен для GHCR
3. Образы собраны (проверьте Packages в репозитории)

### Миграции не выполняются
1. Подключение к БД в `/opt/colaba/.env`
2. Доступность PostgreSQL
3. Логи: `docker logs leadgen-backend`

### Health checks не проходят
1. Порты в `.env` соответствуют `docker-compose.prod.yml`
2. Контейнеры запущены: `docker compose -f docker-compose.prod.yml ps`
3. Логи контейнеров

---

## Образы в GHCR

После успешного деплоя:
- `ghcr.io/moiseev1991-stack/colaba-backend:latest`
- `ghcr.io/moiseev1991-stack/colaba-backend:sha-<commit_sha>`
- `ghcr.io/moiseev1991-stack/colaba-frontend:latest`
- `ghcr.io/moiseev1991-stack/colaba-frontend:sha-<commit_sha>`

Просмотр: репозиторий --> **Packages**.

---

## Безопасность

1. **Никогда не коммитьте** `.env` с реальными секретами
2. Используйте надежные пароли (минимум 16 символов)
3. Регулярно обновляйте зависимости и базовые образы Docker
4. Ограничьте доступ к self-hosted runner
