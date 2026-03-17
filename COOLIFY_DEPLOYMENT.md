# Инструкция по развертыванию через Coolify

Полное руководство по развертыванию Colaba (SpinLid) на платформе Coolify.

---

## Содержание

1. [Подготовка OAuth приложений](#1-подготовка-oauth-приложений)
2. [Развертывание на Coolify](#2-развертывание-на-coolify)
3. [Настройка Environment Variables](#3-настройка-environment-variables)
4. [Настройка DNS и доменов](#4-настройка-dns-и-доменов)
5. [Проверка деплоя](#5-проверка-деплоя)
6. [Настройка SSL сертификатов](#6-настройка-ssl-сертификатов)
7. [Мониторинг и логи](#7-мониторинг-и-логи)

---

## 1. Подготовка OAuth приложений

Перед деплоем вам нужно получить credentials для всех OAuth провайдеров.

### 1.1 Google OAuth

**Сайт:** https://console.cloud.google.com/

**Шаги:**

1. Войдите в Google аккаунт
2. Нажмите **"Создать проект"**
3. Введите имя проекта: `SpinLid Production`
4. Нажмите **"Создать"**
5. Меню слева → **API и сервисы** → **Учетные данные** (Credentials)
6. Нажмите **"Создать учетные данные"** → **OAuth-идентификатор клиента** (OAuth client ID)
7. Тип приложения: **Веб-приложение** (Web application)
8. Заполните форму:

   ```
   Название: SpinLid Production
   Авторизованные перенаправления:
   - https://ваш-домен.com/auth/callback
   - https://staging.ваш-домен.com/auth/callback (если есть staging)
   ```

9. Нажмите **"Создать"**
10. Скопируйте **Client ID** и **Client Secret**

**Что сохранить:**
```
GOOGLE_CLIENT_ID = xxxxxxxxxxxxxxxxxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET = GOCSPX-xxxxxxxxxxxxxxxx
```

---

### 1.2 Yandex OAuth

**Сайт:** https://oauth.yandex.ru/

**Шаги:**

1. Нажмите **"Зарегистрировать новое приложение"**
2. Заполните форму:

   ```
   Название: SpinLid Production
   Описание: Приложение для авторизации пользователей
   Адрес сайта: https://ваш-домен.com
   ```

3. Раздел **"Доступы"** → выберите:
   - ✅ **Логин на Яндекс** (Login with Yandex)
   - ✅ **Email пользователя**
   - ✅ **ФИО пользователя**
   - ✅ **Аватар пользователя**

4. Раздел **"Платформа"** → выберите **"Веб-сайт"**
5. Раздел **"Redirect URI"** → добавьте:

   ```
   https://ваш-домен.com/auth/callback
   ```

6. Нажмите **"Создать приложение"**
7. Скопируйте **ID** и **Пароль**

**Что сохранить:**
```
YANDEX_CLIENT_ID = xxxxxxxxxxxxxxxxxxxx
YANDEX_CLIENT_SECRET = xxxxxxxxxxxxxxxxxxxx
```

---

### 1.3 VK OAuth

**Сайт:** https://id.vk.com/

**Шаги:**

1. Войдите в VK аккаунт
2. Меню → **"Разработчикам"** → **"Создать приложение"**
3. Заполните форму:

   ```
   Название: SpinLid Production
   Тип: Standalone-приложение
   Платформа: Сайт
   Адрес сайта: https://ваш-домен.com
   Базовый домен: ваш-домен.com
   ```

4. Нажмите **"Создать приложение"**
5. Скопируйте **ID приложения** и **Защищенный ключ**
6. Нажмите **"Настройки"** → вкладка **"OpenAPI"**
7. В разделе **"URL для перенаправления"** добавьте:

   ```
   https://ваш-домен.com/auth/callback
   ```

**Что сохранить:**
```
VK_CLIENT_ID = xxxxxxxxxxxxxxxxxxxx
VK_CLIENT_SECRET = xxxxxxxxxxxxxxxxxxxx
```

---

### 1.4 Telegram Bot

**Сайт:** Telegram (бот @BotFather)

**Шаги:**

1. Откройте Telegram
2. Найдите бота **@BotFather**
3. Напишите команду: `/newbot`
4. Введите имя бота: `SpinLid Auth Bot`
5. Введите username бота: `spinlid_auth_bot` (или любой другой)
6. Скопируйте **API Token**

**Что сохранить:**
```
TELEGRAM_BOT_TOKEN = 1234567890:ABCdefGHIjklMNOpqrsTUVwxyz
```

---

## 2. Развертывание на Coolify

### 2.1 Предварительные требования

- Аккаунт на Coolify (можно self-hosted или облако)
- Доступ к DNS вашего домена
- Git репозиторий с кодом проекта (GitHub, GitLab, Bitbucket)

### 2.2 Подключение репозитория

1. Войдите в Coolify
2. Меню → **"New Service"** → **"Git"**
3. Выберите провайдер (GitHub, GitLab и т.д.)
4. Авторизуйте Coolify в вашем Git аккаунте
5. Выберите репозиторий `colaba2402` (или ваш репозиторий)
6. Нажмите **"Continue"**

### 2.3 Создание сервисов

Вам нужно создать 3 сервиса: PostgreSQL, Redis, и Backend.

#### Сервис 1: PostgreSQL

1. **New Service** → **"Database"** → **"PostgreSQL"**
2. Настройки:

   ```
   Service Name: colaba-postgres
   Version: 16
   Container Size: Medium (2GB RAM, 1 CPU)
   Storage: 20GB
   ```

3. **Environment Variables:**
   ```
   POSTGRES_USER = colaba_user
   POSTGRES_PASSWORD = [сгенерируйте надежный пароль]
   POSTGRES_DB = colaba_db
   ```

4. **Advanced Options:**
   ```
   - Public IP: ✅ (для доступа из других сервисов Coolify)
   - Port Mapping: 5432:5432
   ```

5. Нажмите **"Deploy"**
6. После деплоя скопируйте **Database URL**:
   ```
   postgresql://colaba_user:пароль@postgres-ip:5432/colaba_db
   ```

#### Сервис 2: Redis

1. **New Service** → **"Database"** → **"Redis"**
2. Настройки:

   ```
   Service Name: colaba-redis
   Version: 7
   Container Size: Small (1GB RAM, 0.5 CPU)
   Storage: 5GB
   ```

3. **Advanced Options:**
   ```
   - Public IP: ✅
   - Port Mapping: 6379:6379
   ```

4. Нажмите **"Deploy"**
5. После деплоя скопируйте **Redis URL**:
   ```
   redis://redis-ip:6379/0
   ```

#### Сервис 3: Backend (FastAPI)

1. **New Service** → **"Git"**
2. Выберите репозиторий
3. Настройки:

   ```
   Service Name: colaba-backend
   Build Path: /backend
   Container Size: Medium (2GB RAM, 1 CPU)
   Port: 8000
   ```

4. **Build Options:**
   ```
   Dockerfile: Dockerfile.dev (или production Dockerfile, если есть)
   Branch: main
   ```

5. **Environment Variables** (См. раздел 3)
6. **Advanced Options:**
   ```
   - Domain: api.ваш-домен.com
   - Port Mapping: 8000:8000
   - Enable HTTPS: ✅ (Coolify автоматически выдаст SSL сертификат)
   - Enable Websocket: ✅ (если нужен для реального времени)
   ```

7. Нажмите **"Deploy"**

#### Сервис 4: Frontend (Next.js)

1. **New Service** → **"Git"**
2. Настройки:

   ```
   Service Name: colaba-frontend
   Build Path: /frontend
   Container Size: Medium (2GB RAM, 1 CPU)
   Port: 3000
   ```

3. **Build Options:**
   ```
   Dockerfile: Dockerfile
   Branch: main
   Build Args:
     - APP_VERSION = 1.0.0
     - GIT_SHA = latest
     - BUILD_TIME = $(date -u +"%Y-%m-%dT%H:%M:%SZ")
   ```

4. **Environment Variables:**
   ```
   NEXT_PUBLIC_API_URL = /api/v1
   INTERNAL_BACKEND_ORIGIN = http://colaba-backend:8000
   BACKEND_HOSTNAME = colaba-backend
   BACKEND_PORT = 8000
   ```

5. **Advanced Options:**
   ```
   - Domain: ваш-домен.com
   - Port Mapping: 3000:3000
   - Enable HTTPS: ✅
   ```

6. Нажмите **"Deploy"**

---

## 3. Настройка Environment Variables

### 3.1 Backend Environment Variables

Добавьте эти переменные в сервис **colaba-backend**:

#### Основные настройки:

```
ENVIRONMENT = production
DEBUG = False

# Secret Key (сгенерируйте надежный случайный ключ)
SECRET_KEY = [сгенерируйте через: openssl rand -base64 64]

# Database
DATABASE_URL = postgresql://colaba_user:пароль@colaba-postgres:5432/colaba_db
DATABASE_URL_SYNC = postgresql://colaba_user:пароль@colaba-postgres:5432/colaba_db

# Redis
REDIS_URL = redis://colaba-redis:6379/0
CELERY_BROKER_URL = redis://colaba-redis:6379/0
CELERY_RESULT_BACKEND = redis://colaba-redis:6379/0

# CORS (разрешите ваш домен)
CORS_ORIGINS = https://ваш-домен.com,https://api.ваш-домен.com

# OAuth Frontend URL
OAUTH_FRONTEND_URL = https://ваш-домен.com
```

#### OAuth Credentials (из раздела 1):

```
# Google
GOOGLE_CLIENT_ID = xxxxxxxxxxxxxxxxxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET = GOCSPX-xxxxxxxxxxxxxxxx

# Yandex
YANDEX_CLIENT_ID = xxxxxxxxxxxxxxxxxxxx
YANDEX_CLIENT_SECRET = xxxxxxxxxxxxxxxxxxxx

# VK
VK_CLIENT_ID = xxxxxxxxxxxxxxxxxxxx
VK_CLIENT_SECRET = xxxxxxxxxxxxxxxxxxxx

# Telegram
TELEGRAM_BOT_TOKEN = 1234567890:ABCdefGHIjklMNOpqrsTUVwxyz
```

#### Опциональные настройки:

```
# Email (для отправки уведомлений)
SMTP_HOST = smtp.example.com
SMTP_PORT = 587
SMTP_USER = noreply@ваш-домен.com
SMTP_PASSWORD = ваш-smtp-пароль
SMTP_FROM = SpinLid <noreply@ваш-домен.com>
```

### 3.2 Frontend Environment Variables

Добавьте эти переменные в сервис **colaba-frontend**:

```
# Backend connection
NEXT_PUBLIC_API_URL = /api/v1
INTERNAL_BACKEND_ORIGIN = http://colaba-backend:8000
BACKEND_HOSTNAME = colaba-backend
BACKEND_PORT = 8000

# Version info (опционально)
NEXT_PUBLIC_APP_VERSION = 1.0.0
NEXT_PUBLIC_GIT_SHA = latest
NEXT_PUBLIC_BUILD_TIME = 2026-03-17T12:00:00Z
```

---

## 4. Настройка DNS и доменов

### 4.1 Настройка DNS записей

В панели вашего регистратора домена создайте следующие записи:

#### Для основного сайта (Frontend):

```
Тип: A
Имя: @ (или www)
Значение: [IP адрес frontend сервиса от Coolify]
TTL: 3600
```

#### Для API (Backend):

```
Тип: A
Имя: api
Значение: [IP адрес backend сервиса от Coolify]
TTL: 3600
```

#### CNAME (опционально, если Coolify использует CNAME):

```
Тип: CNAME
Имя: @ (или www)
Значение: [CNAME от Coolify для frontend]
```

### 4.2 Проверка DNS

Проверьте, что записи созданы правильно:

```bash
# Проверка A записи
nslookup ваш-домен.com

# Проверка API
nslookup api.ваш-домен.com
```

### 4.3 Настройка доменов в Coolify

В каждом сервисе добавьте свои домены:

- **Frontend сервис**: ваш-домен.com, www.ваш-домен.com
- **Backend сервис**: api.ваш-домен.com

Coolify автоматически выдаст SSL сертификаты через Let's Encrypt.

---

## 5. Проверка деплоя

### 5.1 Проверка Frontend

1. Откройте в браузере: `https://ваш-домен.com`
2. Проверьте:
   - ✅ Главная страница загружается
   - ✅ Формы работают
   - ✅ Перенаправления корректны
   - ✅ API запросы идут на правильный URL

### 5.2 Проверка Backend API

1. Откройте: `https://api.ваш-домен.com/health`
2. Должен вернуть:
   ```json
   {
     "status": "healthy",
     "version": "0.1.0"
   }
   ```

3. Откройте: `https://api.ваш-домен.com/api/v1/health`
4. Должен вернуть:
   ```json
   {
     "status": "ok",
     "message": "API is running",
     "version": "0.1.0"
   }
   ```

5. Откройте: `https://api.ваш-домен.com/api/docs`
6. Должна открыться документация Swagger

### 5.3 Проверка OAuth

1. Откройте: `https://ваш-домен.com/auth/login`
2. Проверьте:
   - ✅ Кнопки OAuth отображаются
   - ✅ При нажатии на "Войти через Google" вас перенаправляет на Google
   - ✅ После авторизации в Google возвращаетесь обратно на ваш сайт
   - ✅ Создается аккаунт и вы в logged in

---

## 6. Настройка SSL сертификатов

Coolify автоматически настраивает SSL через Let's Encrypt.

### Проверка SSL

1. В браузере нажмите на замочек 🔒 в адресной строке
2. Должно быть: **"Соединение защищено"** или **"Connection is secure"**

### Принудительное обновление SSL

Если сертификат не обновился автоматически:

1. В Coolify → Выберите сервис → **"Domains"**
2. Нажмите **"Renew Certificate"**
3. Подождите 1-2 минуты
4. Проверьте снова

---

## 7. Мониторинг и логи

### 7.1 Просмотр логов

В Coolify:

1. Выберите сервис (например, `colaba-backend`)
2. Меню → **"Logs"**
3. Здесь вы увидите логи в реальном времени

### 7.2 Мониторинг ресурсов

1. Меню → **"Resources"**
2. Здесь вы увидите использование CPU, RAM, диска
3. Если не хватает ресурсов, можно масштабировать контейнер

### 7.3 Настройка уведомлений

1. Настройки → **"Notifications"**
2. Подключите:
   - Email уведомления
   - Slack уведомления
   - Telegram уведомления (через webhook)

---

## 8. Масштабирование и оптимизация

### 8.1 Масштабирование Backend

Если нагрузка растет:

1. Выберите сервис `colaba-backend`
2. **"Resources"** → **"Scale"**
3. Увеличьте:
   ```
   CPU: 2 cores
   RAM: 4GB
   Replicas: 2 (2 экземпляра для load balancing)
   ```

### 8.2 Оптимизация PostgreSQL

1. Выберите сервис `colaba-postgres`
2. **"Resources"** → настройте:
   ```
   Storage: 50GB (если база растет)
   Backup: Enable (ежедневные бэкапы)
   ```

---

## 9. Безопасность

### 9.1 Секреты и пароли

- ❌ **НЕ коммитите** .env файл в Git
- ❌ **НЕ делитесь** credentials публично
- ✅ Используйте **Coolify Environment Variables** для хранения секретов
- ✅ Используйте **сложные пароли** (минимум 32 символов)

### 9.2 Firewall

В Coolify:

1. Настройки → **"Firewall"**
2. Закройте ненужные порты
3. Разрешите только:
   - 80 (HTTP)
   - 443 (HTTPS)
   - 22 (SSH, если нужен доступ по SSH)

### 9.3 Rate Limiting

Добавьте rate limiting для защиты API:

```
# В Coolify → Load Balancer settings
Max Requests per IP: 100/minute
Block Duration: 1 hour
```

---

## 10. Troubleshooting

### Проблема: OAuth не работает

**Симптом:** При нажатии на кнопку OAuth появляется ошибка

**Решения:**

1. Проверьте Environment Variables в backend сервисе:
   ```
   GOOGLE_CLIENT_ID установлен?
   GOOGLE_CLIENT_SECRET установлен?
   OAUTH_FRONTEND_URL правильный?
   ```

2. Проверьте Redirect URI в OAuth приложении:
   ```
   Должен быть: https://ваш-домен.com/auth/callback
   ```

3. Проверьте логи backend сервиса:
   ```
   Coolify → colaba-backend → Logs
   ```

### Проблема: Frontend не видит Backend

**Симптом:** API запросы возвращают ошибки

**Решения:**

1. Проверьте CORS_ORIGINS в backend:
   ```
   CORS_ORIGINS = https://ваш-домен.com
   ```

2. Проверьте INTERNAL_BACKEND_ORIGIN в frontend:
   ```
   INTERNAL_BACKEND_ORIGIN = http://colaba-backend:8000
   ```

3. Проверьте, что backend контейнер запущен и доступен

### Проблема: База данных недоступна

**Симптом:** Ошибка подключения к PostgreSQL

**Решения:**

1. Проверьте DATABASE_URL:
   ```
   postgresql://colaba_user:password@colaba-postgres:5432/colaba_db
   ```

2. Проверьте, что PostgreSQL контейнер запущен

3. Проверьте логи PostgreSQL

---

## 11. Полезные команды

### Генерация SECRET_KEY

```bash
# Linux/Mac
openssl rand -base64 64

# Windows PowerShell
# Используйте online генератор или установите OpenSSL
```

### Тестирование подключения к базе

```bash
# Изнутри backend контейнера
docker exec -it colaba-backend psql postgresql://colaba_user:password@colaba-postgres:5432/colaba_db

# Или через Coolify терминал
psql postgresql://colaba_user:password@colaba-postgres:5432/colaba_db
```

### Проверка Redis

```bash
# Изнутри backend контейнера
docker exec -it colaba-backend redis-cli -h colaba-redis ping

# Должен вернуть: PONG
```

---

## 12. Ссылки

- **Coolify документация:** https://coolify.io/docs
- **Google OAuth:** https://console.cloud.google.com/apis/credentials
- **Yandex OAuth:** https://oauth.yandex.ru/
- **VK OAuth:** https://id.vk.com/
- **Telegram BotFather:** https://t.me/BotFather
- **Let's Encrypt:** https://letsencrypt.org/

---

## Краткая чек-лист деплоя

- [ ] OAuth приложения созданы
- [ ] Credentials получены и сохранены
- [ ] PostgreSQL сервис создан
- [ ] Redis сервис создан
- [ ] Backend сервис создан
- [ ] Frontend сервис создан
- [ ] Environment Variables настроены
- [ ] DNS записи созданы
- [ ] Домены настроены в Coolify
- [ ] SSL сертификаты получены
- [ ] Frontend доступен по HTTPS
- [ ] Backend API доступен
- [ ] OAuth кнопки работают
- [ ] Регистрация/вход работают
- [ ] SQLAdmin доступен (опционально)

---

## Поддержка

Если возникают проблемы:

1. Проверьте логи в Coolify
2. Прочтите документацию Coolify: https://coolify.io/docs
3. Проверьте troubleshooting раздел этой инструкции

Удачи с деплоем! 🚀
