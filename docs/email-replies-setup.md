# Настройка обработки ответов на письма

## Обзор системы

Система позволяет получать ответы на отправленные КП и автоматически пересылать их пользователям на их личные email.

### Архитектура

```
┌─────────────────────────────────────────────────────────────┐
│  1. Отправка КП                                              │
│                                                              │
│  From: noreply@yourdomain.com                               │
│  Reply-To: reply-123@yourdomain.com (123 = ID пользователя) │
│  To: client@potential-client.com                            │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  2. Клиент отвечает                                          │
│                                                              │
│  To: reply-123@yourdomain.com                               │
│  From: client@potential-client.com                          │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  3. IMAP сервис (каждые 5 минут)                            │
│     - Читает входящие                                        │
│     - Парсит reply-123 → user_id = 123                      │
│     - Сохраняет в БД                                         │
│     - Пересылает на user123@gmail.com                       │
└─────────────────────────────────────────────────────────────┘
```

## Ошибка «Request failed with status code 404» на `/app/email/replies` или `/app/email/settings`

1. **Бэкенд без новых роутов** — задеплойте образ с актуальным `main`, затем `alembic upgrade head` (таблица `email_replies`, `email_config`).
2. **Проверка API** (после авторизации, подставьте свой домен и токен): `GET https://ваш-домен/api/v1/email/replies` и `GET .../api/v1/email/settings/status`. Если 404 — запрос не доходит до FastAPI (старый контейнер) или неверный префикс у reverse proxy (должен проксировать `/api/v1` на backend).
3. Список ответов регистрируется как **`GET /api/v1/email/replies`** (явный путь, без пустого сегмента URL).

## Требования

### 1. DNS настройки

На вашем домене настройте **catch-all mailbox**:

```
@yourdomain.com  →  noreply@yourdomain.com
```

Это означает, что ВСЕ письма на `*@yourdomain.com` (включая `reply-123@...`) будут попадать в один ящик `noreply@yourdomain.com`.

### 2. IMAP конфигурация

Добавьте в `.env`:

```bash
# IMAP for receiving email replies
IMAP_HOST=mail.yourdomain.com
IMAP_PORT=993
IMAP_USER=noreply@yourdomain.com
IMAP_PASSWORD=your_imap_password
IMAP_USE_SSL=true
IMAP_MAILBOX=INBOX
REPLY_PREFIX=reply-
```

### 3. SMTP для пересылки

Система использует существующие SMTP настройки для пересылки ответов пользователям:

```bash
SMTP_HOST=smtp.yourdomain.com
SMTP_PORT=465
SMTP_USER=noreply@yourdomain.com
SMTP_PASSWORD=your_smtp_password
SMTP_USE_SSL=true
```

## Настройка

### Шаг 1: Создайте почтовый ящик

1. Создайте почтовый ящик `noreply@yourdomain.com`
2. Настройте **catch-all** на этот ящик

### Шаг 2: Добавьте конфигурацию

Обновите `.env` файл с IMAP настройками.

### Шаг 3: Примените миграции

```bash
docker-compose exec backend alembic upgrade head
```

### Шаг 4: Перезапустите сервисы

```bash
docker-compose restart backend celery celery-beat
```

## Как это работает

### Отправка КП

Когда пользователь отправляет КП:

1. Система генерирует `Reply-To: reply-{user_id}@domain.com`
2. Клиент видит письмо с возможностью ответить
3. При ответе клиент отправляет на `reply-123@domain.com`

### Обработка ответов

Celery Beat запускает задачу каждые 5 минут:

1. Подключается к IMAP серверу
2. Читает непрочитанные письма
3. Для каждого письма:
   - Извлекает `To:` заголовок
   - Парсит `reply-123@...` → `user_id = 123`
   - Сохраняет в таблицу `email_replies`
   - Отправляет на личный email пользователя (из его профиля)
   - Помечает письмо как прочитанное

### Просмотр ответов

Пользователи могут видеть ответы:
- **Frontend**: `/app/email/replies` - список всех ответов
- **Admin**: SQLAdmin → Email Replies - администратор видит все ответы

## Проверка

### Тестирование локально

1. Отправьте КП на свой тестовый email
2. Ответьте на письмо
3. Дождитесь обработки (максимум 5 минут)
4. Проверьте:
   - `/app/email/replies` - ответ должен появиться
   - Личный email - должно прийти пересланное письмо

### Логирование

Логи обработки ответов:

```bash
docker-compose logs -f celery | grep "process_email_replies"
```

## Альтернативные варианты

Если не хотите использовать catch-all, можно:

1. **Виртуальные алиасы** (Postfix):
   ```
   reply-*@domain.com → noreply@domain.com
   ```

2. **Регулярные выражения** (Exim):
   ```
   reply-\d+@domain.com
   ```

3. **Webhook от провайдера** (если используете внешний сервис):
   - Mailgun routes
   - SendGrid Inbound Parse
   - AWS SES Receipt Rules

## Безопасность

- IMAP подключение только по SSL/TLS
- Веб-интерфейс требует авторизации
- Пользователь видит только свои ответы
- Администратор видит все ответы

## Траблшутинг

### Ответы не приходят

1. Проверьте IMAP настройки:
   ```bash
   docker-compose exec backend python -c "
   from app.core.config import settings
   print(f'IMAP: {settings.IMAP_HOST}:{settings.IMAP_PORT}')
   print(f'User: {settings.IMAP_USER}')
   "
   ```

2. Проверьте catch-all:
   - Отправьте тестовое письмо на `reply-test@yourdomain.com`
   - Проверьте, что оно попало в ящик `noreply@yourdomain.com`

3. Проверьте логи:
   ```bash
   docker-compose logs celery | grep -i "reply"
   ```

### Ошибки пересылки

1. Проверьте SMTP настройки
2. Убедитесь, что у пользователя указан email в профиле
3. Проверьте логи отправки

## Файлы

### Backend
- `backend/app/models/email_reply.py` - модель данных
- `backend/app/modules/email/replies_service.py` - IMAP сервис
- `backend/app/modules/email/replies_router.py` - API endpoints
- `backend/app/admin/views/email_replies.py` - Admin view
- `backend/app/queue/tasks.py` - Celery task
- `backend/alembic/versions/012_add_email_replies_table.py` - миграция

### Frontend
- `frontend/app/app/email/replies/page.tsx` - страница ответов

### Config
- `backend/app/core/config.py` - IMAP настройки
