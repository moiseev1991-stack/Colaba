# Готовые значения для копирования

## 🔐 GitHub Secrets

**НЕ ТРЕБУЮТСЯ** - используются встроенные токены GitHub Actions.

---

## 📋 GitHub Variables (опционально)

Если нужно переопределить порты, добавьте в:
**Settings → Secrets and variables → Actions → Variables → New repository variable**

### BACKEND_PORT
```
8000
```

### FRONTEND_PORT
```
3000
```

---

## 🖥️ Файл `/opt/colaba/.env` на сервере

Скопируйте этот блок, замените значения и сохраните в `/opt/colaba/.env`:

```env
# ============================================
# ОБЯЗАТЕЛЬНЫЕ ПЕРЕМЕННЫЕ
# ============================================

# Сгенерируйте: python -c "import secrets; print(secrets.token_urlsafe(32))"
SECRET_KEY=ЗАМЕНИТЕ_НА_СГЕНЕРИРОВАННЫЙ_КЛЮЧ

# Сгенерируйте: openssl rand -base64 24
POSTGRES_USER=leadgen_user
POSTGRES_PASSWORD=ЗАМЕНИТЕ_НА_СГЕНЕРИРОВАННЫЙ_ПАРОЛЬ
POSTGRES_DB=leadgen_db

DATABASE_URL=postgresql+asyncpg://leadgen_user:ЗАМЕНИТЕ_ПАРОЛЬ@postgres:5432/leadgen_db
DATABASE_URL_SYNC=postgresql://leadgen_user:ЗАМЕНИТЕ_ПАРОЛЬ@postgres:5432/leadgen_db

REDIS_URL=redis://redis:6379/0
CELERY_BROKER_URL=redis://redis:6379/0
CELERY_RESULT_BACKEND=redis://redis:6379/0

# Замените на ваш домен
NEXT_PUBLIC_API_URL=https://your-domain.com/api/v1
CORS_ORIGINS=https://your-domain.com

# ============================================
# ОПЦИОНАЛЬНЫЕ ПЕРЕМЕННЫЕ
# ============================================

ENVIRONMENT=production
DEBUG=False
LOG_LEVEL=INFO
BACKEND_PORT=8000
FRONTEND_PORT=3000
BACKEND_WORKERS=2
CELERY_CONCURRENCY=2
```

---

## 🔑 Команды для генерации секретов

### SECRET_KEY:
```bash
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

### POSTGRES_PASSWORD:
```bash
openssl rand -base64 24
```

---

## ✅ Быстрая настройка

1. **GitHub:** Ничего добавлять не нужно (Secrets не требуются)

2. **Сервер:** 
   ```bash
   sudo nano /opt/colaba/.env
   # Вставьте содержимое выше, замените значения
   sudo chmod 600 /opt/colaba/.env
   sudo chown deploy:deploy /opt/colaba/.env
   ```

Готово! 🎉
