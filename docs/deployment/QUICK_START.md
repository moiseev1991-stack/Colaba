# Быстрый старт CI/CD

Краткая инструкция по настройке CI/CD для проекта Colaba.

## Шаг 1: Подготовка GitHub репозитория

1. Убедитесь, что репозиторий находится на GitHub: `https://github.com/moiseev1991-stack/Colaba`
2. Проверьте, что workflow файлы находятся в `.github/workflows/`:
   - `ci.yml` - CI pipeline
   - `deploy.yml` - Deploy pipeline

## Шаг 2: Настройка Self-hosted Runner

### На сервере:

1. **Установите Docker и Docker Compose** (см. `CI_CD.md`)

2. **Создайте пользователя deploy:**
   ```bash
   sudo adduser --disabled-password --gecos "" deploy
   sudo usermod -aG docker deploy
   sudo mkdir -p /opt/colaba
   sudo chown -R deploy:deploy /opt/colaba
   ```

3. **Войдите под пользователем deploy:**
   ```bash
   sudo su - deploy
   ```

4. **Установите self-hosted runner:**
   - Перейдите в GitHub: **Settings → Actions → Runners → New self-hosted runner**
   - Выберите **Linux**
   - Скопируйте и выполните команды установки
   - При настройке добавьте label: `colaba-prod` (опционально)

5. **Запустите runner как service:**
   ```bash
   cd /opt/actions-runner
   sudo ./svc.sh install deploy
   sudo ./svc.sh start
   sudo ./svc.sh status
   ```

## Шаг 3: Создание файла окружения

1. **Скопируйте пример файла:**
   ```bash
   sudo -u deploy cp /path/to/repo/docs/deployment/ENV_PRODUCTION.example /opt/colaba/.env
   ```

2. **Отредактируйте файл:**
   ```bash
   sudo -u deploy nano /opt/colaba/.env
   ```

3. **Обязательно заполните:**
   - `SECRET_KEY` - сгенерируйте надежный ключ
   - `POSTGRES_PASSWORD` - надежный пароль для БД
   - `NEXT_PUBLIC_API_URL` - URL вашего домена
   - `CORS_ORIGINS` - ваш домен

## Шаг 4: Проверка работоспособности

### Тест CI:

1. Создайте тестовый commit и push в любую ветку
2. Перейдите в **Actions** в GitHub
3. Убедитесь, что workflow `CI` успешно выполнился

### Тест Deploy:

1. Сделайте merge в ветку `main` (после успешного CI)
2. В **Actions** должен запуститься `Deploy (main)`
3. Проверьте логи деплоя
4. На сервере проверьте контейнеры:
   ```bash
   cd /opt/colaba
   docker compose -f docker-compose.prod.yml ps
   ```

## Что происходит при деплое

1. **Build (GitHub-hosted runner):**
   - Собирает Docker-образы backend и frontend
   - Публикует их в GHCR (GitHub Container Registry)

2. **Deploy (self-hosted runner на сервере):**
   - Копирует `docker-compose.prod.yml` и `deploy.sh` в `/opt/colaba`
   - Поднимает инфраструктуру (postgres, redis)
   - Скачивает новые образы из GHCR
   - Запускает миграции Alembic
   - Запускает все сервисы
   - Проверяет health endpoints

## Troubleshooting

### Runner не запускается:
```bash
cd /opt/actions-runner
sudo ./svc.sh restart
sudo journalctl -u actions.runner.* -f
```

### Проблемы с деплоем:
- Проверьте логи в GitHub Actions
- Проверьте файл `/opt/colaba/.env`
- Проверьте статус контейнеров: `docker compose -f docker-compose.prod.yml ps`
- Проверьте логи контейнеров: `docker logs leadgen-backend`

## Дополнительная документация

- Полная инструкция: `CI_CD.md`
- Настройка GitHub Actions: `GITHUB_ACTIONS_SETUP.md`
- Пример переменных окружения: `ENV_PRODUCTION.example`
