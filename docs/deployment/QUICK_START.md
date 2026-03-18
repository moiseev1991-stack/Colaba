# Быстрый старт CI/CD

Краткая инструкция по настройке CI/CD для проекта Colaba.

## Предварительные требования

- GitHub репозиторий: `https://github.com/moiseev1991-stack/Colaba`
- Workflow файлы в `.github/workflows/`: `ci.yml`, `deploy.yml`
- Сервер с Linux (Ubuntu) и доступом по SSH

## Шаг 1: Подготовка сервера

```bash
# Установить Docker
sudo apt update && sudo apt -y install ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo \"$VERSION_CODENAME\") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update && sudo apt -y install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Создать пользователя deploy
sudo adduser --disabled-password --gecos "" deploy
sudo usermod -aG docker deploy
sudo mkdir -p /opt/colaba
sudo chown -R deploy:deploy /opt/colaba
```

## Шаг 2: Установить self-hosted runner

1. GitHub: **Settings --> Actions --> Runners --> New self-hosted runner** --> Linux
2. На сервере под `deploy`:
   ```bash
   mkdir -p /opt/actions-runner && cd /opt/actions-runner
   # Скопируйте команды установки из интерфейса GitHub
   ./config.sh --url https://github.com/moiseev1991-stack/Colaba --token <TOKEN>
   cd /opt/actions-runner
   sudo ./svc.sh install deploy && sudo ./svc.sh start
   ```

## Шаг 3: Создать файл окружения

```bash
sudo -u deploy nano /opt/colaba/.env
```

Минимальный набор (заполните свои значения):
```env
SECRET_KEY=<сгенерируйте: python -c "import secrets; print(secrets.token_urlsafe(32))">
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

Полный пример: см. [ENV_PRODUCTION.example](./ENV_PRODUCTION.example).

## Шаг 4: Проверить

```bash
# Тест CI: push в любую ветку --> Actions в GitHub --> workflow CI

# Тест Deploy: merge в main --> Actions --> Deploy (main)

# Проверка на сервере:
cd /opt/colaba
docker compose -f docker-compose.prod.yml ps
curl http://localhost:8000/health
curl http://localhost:3000/
```

## Что происходит при деплое

1. **Build** (GitHub-hosted): сборка и публикация образов в GHCR
2. **Deploy** (self-hosted runner): скачивание образов, миграции, запуск сервисов, health checks

## Если что-то не работает

- Runner: `cd /opt/actions-runner && sudo ./svc.sh restart && sudo journalctl -u actions.runner.* -f`
- Логи GitHub: вкладка **Actions** в репозитории
- Логи контейнеров: `cd /opt/colaba && docker compose -f docker-compose.prod.yml logs`
- Файл `.env`: проверьте все обязательные переменные

## Дополнительная документация

- Полная инструкция: [GITHUB_ACTIONS.md](./GITHUB_ACTIONS.md)
- Справочник переменных: [VARIABLES_REFERENCE.md](./VARIABLES_REFERENCE.md)
- Пример `.env`: [ENV_PRODUCTION.example](./ENV_PRODUCTION.example)
- Архитектура CI/CD: [CI_CD.md](./CI_CD.md)
