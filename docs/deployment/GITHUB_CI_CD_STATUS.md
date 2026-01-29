# Проверка CI/CD на GitHub (moiseev1991-stack/Colaba)

**Дата проверки:** по содержимому ветки `main` на GitHub.

---

## ✅ Что есть на GitHub для работы CI/CD

### 1. Workflow-файлы (ветка `main`)

| Файл | Статус | Описание |
|------|--------|----------|
| `.github/workflows/ci.yml` | ✅ Есть | CI: тесты backend + frontend при push/PR |
| `.github/workflows/deploy.yml` | ✅ Есть | Deploy: сборка образов в GHCR + деплой на self-hosted runner |

Оба файла присутствуют в репозитории и содержат ожидаемую конфигурацию.

---

### 2. Файлы, используемые деплоем

| Файл | Статус | Использование |
|------|--------|----------------|
| `scripts/deployment/deploy.sh` | ✅ Есть | Копируется на сервер, запускается при деплое |
| `docker-compose.prod.yml` | ✅ Есть | Копируется в `/opt/colaba`, используется для запуска контейнеров |
| `backend/Dockerfile` | ✅ (в репозитории) | Сборка образа backend в workflow |
| `frontend/Dockerfile` | ✅ (в репозитории) | Сборка образа frontend в workflow |

Все необходимые для CI/CD файлы есть на GitHub.

---

### 3. Содержимое workflow’ов

**CI (`ci.yml`):**
- Триггеры: `push`, `pull_request` на все ветки (`**`)
- Job `backend`: PostgreSQL 16, pytest, переменные окружения заданы
- Job `frontend`: Node 20, npm ci, lint, type-check, jest
- Runners: `ubuntu-latest` (хосты GitHub)

**Deploy (`deploy.yml`):**
- Триггер: `workflow_run` после завершения CI на ветке `main`
- Job `build_images`: checkout, подготовка имён образов, логин в GHCR, сборка и push backend/frontend
- Job `deploy`: checkout, логин в GHCR, копирование `docker-compose.prod.yml` и `deploy.sh` в `/opt/colaba`, запуск `deploy.sh`
- Runner для деплоя: `self-hosted` (нужен настроенный runner на вашем сервере)

Конфигурация соответствует описанной в `CI_CD.md`.

---

## Что не проверялось (только в веб-интерфейсе GitHub)

- **Actions включены** — по умолчанию включены для публичных репозиториев; для приватных проверьте: Settings → Actions → General.
- **Self-hosted runner** — есть ли и в статусе ли Online: **Settings → Actions → Runners**.
- **Запуски workflow’ов** — история и статусы: вкладка **Actions** репозитория.
- **Secrets / Variables** — для текущей схемы дополнительные Secrets не нужны; при необходимости: **Settings → Secrets and variables → Actions**.

---

## Итог

| Компонент | На GitHub |
|-----------|-----------|
| Workflow CI | ✅ Есть |
| Workflow Deploy | ✅ Есть |
| Скрипт деплоя | ✅ Есть |
| docker-compose.prod.yml | ✅ Есть |
| Dockerfile backend/frontend | ✅ В репозитории |

Для работы CI/CD на GitHub в репозитории есть всё нужное.  
CI будет запускаться при push/PR. Deploy после успешного CI на `main` будет работать, когда на сервере настроен и зарегистрирован self-hosted runner (см. `CI_CD.md` и `NEXT_STEPS_CI_CD.md`).

---

## Полезные ссылки

- Actions (запуски): https://github.com/moiseev1991-stack/Colaba/actions  
- Runners: https://github.com/moiseev1991-stack/Colaba/settings/actions/runners  
- Workflows в репозитории: https://github.com/moiseev1991-stack/Colaba/tree/main/.github/workflows  
