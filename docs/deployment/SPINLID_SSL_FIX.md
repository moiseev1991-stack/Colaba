# Исправление SSL для spinlid.ru (сайт «лёг»)

## Причина

При заходе на https://spinlid.ru браузер показывает ошибку сертификата (self-signed). Контейнеры и приложение работают; nginx на 443 отдаёт блок **parking** (default_server) с самоподписанным сертификатом вместо блока spinlid с корректным сертификатом GlobalSign.

**Важно:** даже после добавления `default_server` в блок spinlid проблема может оставаться, потому что в `conf.d/parking.conf` есть **явный** `listen 88.210.53.183:443 ssl default_server`. Для этого IP тогда используется parking. Нужно **убрать** `default_server` у parking на 443 (см. скрипт ниже).

## Что сделано в репозитории

1. **Проверен default server для 443** — блок с `server_name _` и `listen 88.210.53.183:443 ssl default_server` использует `parking.crt` (self-signed). Блок spinlid слушает 443 без `default_server`, поэтому при части запросов к 88.210.53.183:443 выбирается parking.
2. **Проверен fullchain** — в `/etc/nginx/ssl/spinlid.ru/fullchain.pem` два сертификата (сайт + промежуточный GlobalSign), пересборка не требуется.
3. **Подготовлены правка и скрипт**:
   - [docs/deployment/nginx-spinlid-default-server.conf](nginx-spinlid-default-server.conf) — эталонный фрагмент конфига с `default_server`.
   - [scripts/apply-spinlid-nginx-default-server.sh](../scripts/apply-spinlid-nginx-default-server.sh) — добавляет `default_server` и `listen [::]:443`, затем проверяет конфиг и перезагружает nginx.

## Что выполнить на сервере

На хосте spinlid.ru (88.210.53.183).

**Шаг 1 — убрать default_server у parking (обязательно):**

```bash
cd /opt/colaba/src
sudo bash scripts/fix-spinlid-ssl-remove-parking-default.sh
```

**Шаг 2 — если в spinlid ещё нет default_server**, применить один из вариантов ниже.

**Вариант A — скрипт (один раз введёте пароль sudo):**

```bash
cd /opt/colaba/src
sudo bash scripts/apply-spinlid-nginx-default-server.sh
```

**Вариант B — скопировать готовый конфиг и перезагрузить:**

```bash
sudo cp /opt/colaba/src/scripts/spinlid-frontend-full.conf /etc/nginx/sites-available/spinlid-frontend.conf
sudo nginx -t && sudo systemctl reload nginx
```

**Вариант C — ручное редактирование:** в `/etc/nginx/sites-available/spinlid-frontend.conf` в блоке `server` для 443 заменить строку `listen 443 ssl http2;` на две строки:

```
  listen 443 ssl http2 default_server;
  listen [::]:443 ssl http2 default_server;
```

Затем (пользователь deploy может перезагрузить nginx без пароля):

```bash
sudo -n nginx -t && sudo -n systemctl reload nginx
```

## Проверка после применения

С любой машины (не с самого сервера):

```bash
curl -vI https://spinlid.ru
curl -vI https://www.spinlid.ru
```

Ошибки «self-signed certificate» быть не должно; в ответе должен быть сертификат для spinlid.ru / www.spinlid.ru.
