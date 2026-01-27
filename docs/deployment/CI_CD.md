# CI/CD (GitHub Actions) — автодеплой на сервер (self-hosted runner)

## Как работает

- **CI**: при `push` и `pull_request` запускается workflow `CI`:
  - backend: `pytest`
  - frontend: `lint`, `type-check`, `jest`
- **Deploy (main)** запускается **после успешного CI** на `main` и состоит из двух частей:
  - **build (GitHub-hosted runner)**: собирает и пушит Docker-образы в **GHCR**
  - **deploy (self-hosted runner на сервере)**: на сервере выполняет `pull → migrations → up → health checks`

Важно: деплой не использует SSH из GitHub Actions — деплой выполняется локально на сервере через self-hosted runner.

## Что нужно на GitHub

- Репозиторий GitHub → Settings → Actions → Runners: добавить **self-hosted runner** (repo-level).
- Secrets для SSH **не нужны**.

## Подготовка сервера (однократно)

### 1) Docker + Compose

Установите Docker Engine + compose plugin (Ubuntu):

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

### 2) Пользователь deploy и права

```bash
sudo adduser --disabled-password --gecos "" deploy || true
sudo usermod -aG docker deploy
sudo mkdir -p /opt/colaba
sudo chown -R deploy:deploy /opt/colaba
```

Перелогиньтесь под `deploy`, чтобы группа `docker` применились.

### 3) Файл окружения приложения

Создайте `/opt/colaba/.env` (НЕ коммитить). Минимум:

- `SECRET_KEY`
- `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` (или оставить дефолты)
- `NEXT_PUBLIC_API_URL` (URL backend для frontend, например `https://your-domain/api/v1`)
- при необходимости: прокси/ключи провайдеров

## Установка self-hosted runner (repo-level)

В GitHub откройте:

- Settings → Actions → Runners → **New self-hosted runner** → Linux

Скопируйте команды, которые GitHub показывает, и выполните их **под пользователем `deploy`**.

Рекомендации:
- Рабочая директория runner: `/opt/actions-runner`
- Добавьте label, например `colaba-prod` (удобно, если будет несколько runner’ов)
### Запуск runner как systemd service (рекомендуется)

Если вы ставили runner по инструкции GitHub, обычно внутри `/opt/actions-runner` есть `svc.sh`. Тогда:

```bash
cd /opt/actions-runner
sudo ./svc.sh install deploy
sudo ./svc.sh start
```

Проверка:

```bash
sudo ./svc.sh status
```

## Что именно деплоится на сервер

- В `/opt/colaba` workflow кладёт:
  - `docker-compose.prod.yml`
  - `scripts/deployment/deploy.sh`
- Скрипт деплоя делает:
  - `docker compose pull`
  - `alembic upgrade head`
  - `docker compose up -d`
  - health checks (`/health`, `/`)

## Образы

- `ghcr.io/<owner>/<repo>-backend:sha-<commit>` и `:latest`
- `ghcr.io/<owner>/<repo>-frontend:sha-<commit>` и `:latest`

