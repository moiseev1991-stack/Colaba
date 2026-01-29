# Что сделать, чтобы CI/CD заработал на GitHub

Пошаговая инструкция: что делать дальше после того, как у вас есть проект и ключ `colaba_deploy_ed25519.pub`.

---

## Про SSH-ключ `colaba_deploy_ed25519.pub`

- Это **публичный** SSH-ключ. В текущем CI/CD **GitHub Actions не использует SSH** для деплоя (деплой идёт через self-hosted runner на сервере).
- Ключ можно использовать **для входа на сервер** (см. шаг 2).  
- **Приватный ключ** (`colaba_deploy_ed25519` без `.pub`) **не коммитить** в репозиторий — он уже добавлен в `.gitignore`.

---

## Шаг 1. Убедиться, что workflow в GitHub

1. Закоммитьте и запушьте код (в т.ч. `.github/workflows/`):

```powershell
cd C:\cod\Colaba\Colaba
git add .
git status
git commit -m "CI/CD workflows and deployment docs"
git push origin main
```

2. Проверьте в браузере:
   - Репозиторий: `https://github.com/moiseev1991-stack/Colaba`
   - Вкладка **Actions** — должны быть workflow «CI» и «Deploy (main)».

После этого **CI уже может работать** при каждом push (тесты backend/frontend на GitHub).

---

## Шаг 2. Сервер для деплоя (если ещё нет)

Нужен сервер (VPS) с Linux (например Ubuntu), куда будет ставиться self-hosted runner и где будет крутиться приложение.

1. Создайте сервер (любой провайдер: Timeweb, Selectel, DigitalOcean, и т.д.).
2. Подключитесь по SSH (логин обычно `root` или пользователь, который создали).
3. Добавьте **публичный** ключ на сервер, чтобы входить с Windows без пароля:
   - На сервере: `mkdir -p ~/.ssh && echo "ВСТАВЬТЕ_СЮДА_СОДЕРЖИМОЕ_colaba_deploy_ed25519.pub" >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys`
   - Содержимое `colaba_deploy_ed25519.pub` можно скопировать из файла в проекте.

Дальше все команды на сервере выполняются по SSH (в т.ч. под пользователем `deploy`).

---

## Шаг 3. Подготовка сервера (один раз)

Выполните на сервере (по SSH).

### 3.1. Docker и Docker Compose

```bash
sudo apt update
sudo apt -y install ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt -y install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

### 3.2. Пользователь deploy и каталог

```bash
sudo adduser --disabled-password --gecos "" deploy || true
sudo usermod -aG docker deploy
sudo mkdir -p /opt/colaba
sudo chown -R deploy:deploy /opt/colaba
```

После этого **перелогиньтесь** под `deploy` (или выполните `newgrp docker`), чтобы группа `docker` применилась.

### 3.3. Файл окружения на сервере

Под пользователем `deploy` создайте `/opt/colaba/.env`:

```bash
sudo -u deploy nano /opt/colaba/.env
```

Вставьте (и замените значения на свои):

```env
SECRET_KEY=сгенерируйте_ключ
POSTGRES_USER=leadgen_user
POSTGRES_PASSWORD=сгенерируйте_пароль
POSTGRES_DB=leadgen_db
DATABASE_URL=postgresql+asyncpg://leadgen_user:ВАШ_ПАРОЛЬ@postgres:5432/leadgen_db
DATABASE_URL_SYNC=postgresql://leadgen_user:ВАШ_ПАРОЛЬ@postgres:5432/leadgen_db
REDIS_URL=redis://redis:6379/0
CELERY_BROKER_URL=redis://redis:6379/0
CELERY_RESULT_BACKEND=redis://redis:6379/0
NEXT_PUBLIC_API_URL=https://ваш-домен.com/api/v1
CORS_ORIGINS=https://ваш-домен.com
```

Сгенерировать значения можно так (на своей машине или на сервере):

- SECRET_KEY: `python -c "import secrets; print(secrets.token_urlsafe(32))"`
- POSTGRES_PASSWORD: `openssl rand -base64 24` (или аналог в PowerShell из прошлой инструкции)

Сохраните файл. Права: `sudo chmod 600 /opt/colaba/.env`.

---

## Шаг 4. Self-hosted runner на сервере

Деплой в этом проекте работает так: **на сервере** крутится runner GitHub Actions; GitHub не подключается по SSH, а отдаёт задачи этому runner.

1. В GitHub откройте:  
   **Settings → Actions → Runners → New self-hosted runner**  
   Репозиторий: `https://github.com/moiseev1991-stack/Colaba`

2. Выберите **Linux**, скопируйте команды с страницы.

3. На сервере **под пользователем `deploy`** выполните эти команды (директорию можно сделать `/opt/actions-runner`):

```bash
sudo -u deploy -i
mkdir -p /opt/actions-runner && cd /opt/actions-runner
# Дальше — команды с GitHub (Download, Configure, при желании label colaba-prod)
```

4. Установите и запустите runner как службу:

```bash
cd /opt/actions-runner
sudo ./svc.sh install deploy
sudo ./svc.sh start
sudo ./svc.sh status
```

5. В GitHub в **Settings → Actions → Runners** должен появиться runner со статусом **Online**.

После этого при успешном CI на ветке `main` будет запускаться workflow «Deploy (main)»: сбор образов в GHCR и деплой на этот сервер через runner.

---

## Шаг 5. Проверка, что всё работает

1. **CI (уже на GitHub):**
   - Сделайте любой коммит и `git push origin main`.
   - Откройте **Actions** — должен запуститься workflow **CI** (backend + frontend). Зелёные галочки = CI работает.

2. **Deploy:**
   - После успешного CI на `main` должен запуститься **Deploy (main)**.
   - В **Actions** посмотрите логи job’ов `build_images` и `deploy`.
   - На сервере:  
     `cd /opt/colaba && docker compose -f docker-compose.prod.yml ps`  
     — все сервисы должны быть в статусе Up.

3. **Приложение:**
   - На сервере: `curl http://localhost:8000/health` и `curl http://localhost:3000/` (если порты не меняли).

---

## Краткий чеклист

- [ ] Код с `.github/workflows/` запушен в `main`.
- [ ] В GitHub во вкладке Actions видны workflow CI и Deploy.
- [ ] Есть сервер с Docker и пользователем `deploy`.
- [ ] На сервере создан `/opt/colaba/.env` с нужными переменными.
- [ ] Self-hosted runner установлен и в GitHub отображается как Online.
- [ ] После push в `main` CI проходит, затем запускается Deploy и контейнеры поднимаются на сервере.

---

## Полезные файлы в репозитории

- `docs/deployment/CI_CD.md` — общее описание CI/CD.
- `docs/deployment/COPY_PASTE_VALUES.md` — готовые значения для `.env`.
- `docs/deployment/QUICK_START.md` — краткий старт по деплою.

Если выполните шаги 1–5, CI/CD будет работать на GitHub: CI при каждом push, деплой на ваш сервер после успешного CI на `main`.
