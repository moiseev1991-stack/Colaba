# Настройка GitHub Actions CI/CD

Этот документ описывает настройку CI/CD для проекта Colaba с использованием GitHub Actions.

## Обзор архитектуры

- **CI**: Запускается при каждом `push` и `pull_request`
  - Backend: запуск тестов (`pytest`)
  - Frontend: линтинг, проверка типов, тесты (`jest`)
- **Deploy**: Запускается автоматически после успешного CI на ветке `main`
  - **Build**: Сборка Docker-образов и публикация в GHCR (GitHub Container Registry)
  - **Deploy**: Деплой на сервер через self-hosted runner

## Требования

### 1. GitHub репозиторий

Репозиторий должен быть настроен на GitHub: `https://github.com/moiseev1991-stack/Colaba`

### 2. Self-hosted runner на сервере

Self-hosted runner должен быть установлен и запущен на сервере деплоя.

**Инструкция по установке self-hosted runner:**

1. Перейдите в репозиторий: **Settings → Actions → Runners → New self-hosted runner**
2. Выберите **Linux** и скопируйте команды установки
3. На сервере выполните команды под пользователем `deploy`:
   ```bash
   # Пример команд (актуальные команды будут в интерфейсе GitHub)
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
   sudo ./svc.sh status  # Проверка статуса
   ```

### 3. Подготовка сервера

#### Установка Docker и Docker Compose

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

#### Создание пользователя deploy

```bash
sudo adduser --disabled-password --gecos "" deploy || true
sudo usermod -aG docker deploy
sudo mkdir -p /opt/colaba
sudo chown -R deploy:deploy /opt/colaba
```

**Важно:** После добавления пользователя в группу `docker` необходимо перелогиниться, чтобы изменения вступили в силу.

#### Создание файла окружения

Создайте файл `/opt/colaba/.env` с необходимыми переменными окружения:

```bash
sudo -u deploy nano /opt/colaba/.env
```

Минимальный набор переменных:

```env
# Базовые настройки
ENVIRONMENT=production
DEBUG=False
SECRET_KEY=<сгенерируйте_надежный_секретный_ключ>

# База данных
POSTGRES_USER=leadgen_user
POSTGRES_PASSWORD=<надежный_пароль>
POSTGRES_DB=leadgen_db
DATABASE_URL=postgresql+asyncpg://leadgen_user:<пароль>@postgres:5432/leadgen_db
DATABASE_URL_SYNC=postgresql://leadgen_user:<пароль>@postgres:5432/leadgen_db

# Redis
REDIS_URL=redis://redis:6379/0
CELERY_BROKER_URL=redis://redis:6379/0
CELERY_RESULT_BACKEND=redis://redis:6379/0

# Frontend
NEXT_PUBLIC_API_URL=https://your-domain.com/api/v1

# CORS
CORS_ORIGINS=https://your-domain.com

# Логирование
LOG_LEVEL=INFO

# Опционально: AI провайдеры
OPENAI_API_KEY=
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama2

# Опционально: Яндекс XML API
YANDEX_XML_FOLDER_ID=
YANDEX_XML_KEY=

# Опционально: Прокси
USE_PROXY=false
PROXY_URL=
PROXY_LIST=

# Порты (если отличаются от дефолтных)
BACKEND_PORT=8000
FRONTEND_PORT=3000
```

**Важно:** Файл `.env` содержит секретные данные и **НЕ должен** коммититься в репозиторий!

## GitHub Secrets и Variables

### Secrets (Settings → Secrets and variables → Actions → Secrets)

GitHub Actions автоматически использует встроенные токены, но для дополнительной безопасности можно настроить:

#### Обязательные (используются автоматически через GITHUB_TOKEN):

- `GITHUB_TOKEN` - автоматически предоставляется GitHub Actions, используется для:
  - Авторизации в GHCR (GitHub Container Registry)
  - Доступа к репозиторию

**Примечание:** В текущей конфигурации используются встроенные токены GitHub Actions (`github.token`, `github.actor`), поэтому дополнительные secrets не требуются.

### Variables (Settings → Secrets and variables → Actions → Variables)

Переменные окружения для workflow можно настроить здесь, если нужно переопределить значения по умолчанию:

#### Опциональные переменные:

- `BACKEND_PORT` - порт backend (по умолчанию: `8000`)
- `FRONTEND_PORT` - порт frontend (по умолчанию: `3000`)

Эти переменные можно задать в GitHub Variables или в файле `/opt/colaba/.env` на сервере.

## Структура workflow файлов

### `.github/workflows/ci.yml`

Запускается при каждом `push` и `pull_request`:

- **Backend job**: Устанавливает Python 3.11, запускает PostgreSQL и Redis через services, выполняет `pytest`
- **Frontend job**: Устанавливает Node.js 20, выполняет `npm run lint`, `npm run type-check`, `npm test`

### `.github/workflows/deploy.yml`

Запускается автоматически после успешного выполнения CI на ветке `main`:

1. **Job: build_images** (GitHub-hosted runner)
   - Подготавливает имена образов: `ghcr.io/<owner>/<repo>-backend` и `ghcr.io/<owner>/<repo>-frontend`
   - Создает теги: `sha-<commit_sha>` и `latest`
   - Собирает и пушит Docker-образы в GHCR

2. **Job: deploy** (self-hosted runner)
   - Копирует `docker-compose.prod.yml` и `scripts/deployment/deploy.sh` в `/opt/colaba`
   - Выполняет скрипт деплоя, который:
     - Поднимает инфраструктуру (postgres, redis)
     - Скачивает новые образы из GHCR
     - Запускает миграции Alembic
     - Запускает все сервисы
     - Проверяет health endpoints

## Проверка работоспособности

### 1. Проверка CI

1. Создайте тестовый pull request или сделайте push в любую ветку
2. Перейдите в **Actions** в репозитории GitHub
3. Убедитесь, что workflow `CI` запустился и успешно завершился

### 2. Проверка деплоя

1. Сделайте merge в ветку `main` (после успешного CI)
2. В **Actions** должен запуститься workflow `Deploy (main)`
3. Проверьте логи:
   - `build_images` должен успешно собрать и запушить образы
   - `deploy` должен успешно выполниться на self-hosted runner
4. На сервере проверьте статус контейнеров:
   ```bash
   cd /opt/colaba
   docker compose -f docker-compose.prod.yml ps
   ```

### 3. Проверка health endpoints

После успешного деплоя проверьте доступность сервисов:

```bash
# Backend health check
curl http://localhost:8000/health

# Frontend
curl http://localhost:3000/
```

## Troubleshooting

### Проблема: Self-hosted runner не запускается

```bash
cd /opt/actions-runner
sudo ./svc.sh status
sudo ./svc.sh restart
# Проверьте логи
sudo journalctl -u actions.runner.* -f
```

### Проблема: Не удается скачать образы из GHCR

Убедитесь, что:
1. Self-hosted runner имеет доступ к интернету
2. В workflow используется правильный токен для авторизации в GHCR
3. Образы успешно собраны и запушены в GHCR (проверьте в **Packages** репозитория)

### Проблема: Миграции не выполняются

Проверьте:
1. Подключение к базе данных в `/opt/colaba/.env`
2. Доступность PostgreSQL контейнера
3. Логи контейнера backend:
   ```bash
   docker logs leadgen-backend
   ```

### Проблема: Health checks не проходят

Проверьте:
1. Порты в `/opt/colaba/.env` соответствуют портам в `docker-compose.prod.yml`
2. Контейнеры запущены: `docker compose -f docker-compose.prod.yml ps`
3. Логи контейнеров на наличие ошибок

## Образы в GHCR

После успешного деплоя образы будут доступны в GitHub Container Registry:

- `ghcr.io/moiseev1991-stack/colaba-backend:latest`
- `ghcr.io/moiseev1991-stack/colaba-backend:sha-<commit_sha>`
- `ghcr.io/moiseev1991-stack/colaba-frontend:latest`
- `ghcr.io/moiseev1991-stack/colaba-frontend:sha-<commit_sha>`

Для просмотра образов перейдите в репозиторий: **Packages** (в правом меню).

## Безопасность

1. **Никогда не коммитьте** файл `.env` с реальными секретами
2. Используйте GitHub Secrets для чувствительных данных (если потребуется в будущем)
3. Регулярно обновляйте зависимости и базовые образы Docker
4. Используйте надежные пароли для базы данных
5. Ограничьте доступ к self-hosted runner только необходимым пользователям

## Дополнительные ресурсы

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Self-hosted runners](https://docs.github.com/en/actions/hosting-your-own-runners)
- [GitHub Container Registry](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry)
