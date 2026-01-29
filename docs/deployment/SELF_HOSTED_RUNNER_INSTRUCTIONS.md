# Подробная инструкция: Add new self-hosted runner

Пошагово, по полям и кнопкам на странице GitHub **Add new self-hosted runner** для репозитория `moiseev1991-stack/Colaba`.

---

## Важно перед началом

Деплой Colaba (скрипт `deploy.sh`, Docker, docker-compose) рассчитан на **Linux**.  
Runner для job «Deploy on server» должен быть установлен на **Linux-сервере** (VPS), а не на Windows.

- Если вы ставите runner на **сервер с Linux** — выбирайте **Linux** и следуйте инструкции ниже.
- Если на странице у вас выбрано **Windows** — переключите на **Linux** (см. шаг 2).

---

## Что вы видите на странице

1. **Заголовок:** «Add new self-hosted runner · moiseev1991-stack/Colaba»
2. **Жёлтое предупреждение** про использование self-hosted runner в публичных репозиториях (риск при форках)
3. **Текст** про загрузку, настройку и запуск runner и про соглашение с GitHub
4. **Runner image** — выбор ОС: macOS / **Linux** / Windows
5. **Architecture** — выбор архитектуры (обычно x64)
6. **Download** — рекомендация по папке и дальше команды для установки

Ниже — что делать по шагам.

---

## Шаг 1. Предупреждение безопасности (жёлтый блок)

**Что написано:** использование self-hosted runner в публичных репозиториях не рекомендуется: форки могут запускать код на вашем runner через pull request.

**Что сделать:**
- Ознакомьтесь с текстом.
- Если репозиторий публичный — либо принимаете риск, либо делаете репозиторий приватным / используете только доверенные форки.
- При желании нажмите «Learn more about security hardening…» и прочитайте рекомендации GitHub.

Дальше можно продолжать настройку.

---

## Шаг 2. Runner image (операционная система)

**Поле:** «Runner image»  
**Варианты:** macOS | **Linux** | Windows

**Что сделать для Colaba:**
- Выберите **Linux** (радио-кнопка «Linux»).
- Не оставляйте Windows: скрипт деплоя (`deploy.sh`) и Docker Compose рассчитаны на Linux-сервер.

После выбора Linux страница покажет команды для Linux (Download, Configure и т.д.).

---

## Шаг 3. Architecture (архитектура)

**Поле:** «Architecture»  
**Обычно:** выпадающий список, по умолчанию **x64**.

**Что сделать:**
- Оставьте **x64**, если ваш сервер обычный (Intel/AMD 64-bit).
- Для ARM (например, некоторые VPS) выберите **Arm64**.

Сохраните выбор.

---

## Шаг 4. Блок «Download»

**Что там:** рекомендация по папке и команды для загрузки и распаковки runner.

- GitHub рекомендует папку вида `\actions-runner` (для Windows) или `/opt/actions-runner` (для Linux).
- Для **Linux** там будут команды вроде:
  - создать папку,
  - скачать архив (например `actions-runner-linux-x64-2.xxx.tar.gz`),
  - распаковать (`tar xzf ...`).

**Что сделать:**
- Прокрутите страницу до этого блока.
- Скопируйте команды **по порядку** — они будут использоваться на **сервере** (по SSH), не на вашем ПК.

Дальше на странице обычно идёт блок **Configure** и **Run**.

---

## Шаг 5. Configure (настройка runner)

На странице будет блок **Configure** с командой вида:

```bash
./config.sh --url https://github.com/moiseev1991-stack/Colaba --token <TOKEN>
```

**Важно:** `<TOKEN>` — одноразовый токен, который GitHub показывает на этой же странице (вместо буквального `<TOKEN>`). Токен действителен ограниченное время.

**Что сделать:**
- Скопируйте **полную** команду с подставленным токеном (или скопируйте токен и подставьте в команду вручную).
- Эту команду нужно выполнить на **сервере** в папке, куда распакован runner (например `/opt/actions-runner`).
- При настройке могут спросить:
  - **name** — имя runner (можно оставить по умолчанию или ввести, например `colaba-prod`).
  - **labels** — метки; можно добавить `colaba-prod`, чтобы в workflow использовать `runs-on: self-hosted:colaba-prod` (опционально).
  - **work folder** — рабочая папка (часто по умолчанию `_work`).

Сохраните команду — она понадобится на сервере.

---

## Шаг 6. Run (запуск runner)

На странице будет блок **Run** с командой запуска, например:

- Linux: `./run.sh` (или инструкция по установке службы `svc.sh`).

**Что сделать на сервере:**
- Один раз для проверки можно запустить вручную: `./run.sh`.
- Для постоянной работы лучше установить runner как службу (см. шаг 7).

---

## Шаг 7. Что делать на Linux-сервере (кратко)

Подключитесь к серверу по SSH. Выполните по порядку.

### 7.1. Подготовка (если ещё не сделано)

```bash
# Пользователь deploy и папки (если ещё нет)
sudo adduser --disabled-password --gecos "" deploy || true
sudo usermod -aG docker deploy
sudo mkdir -p /opt/colaba /opt/actions-runner
sudo chown -R deploy:deploy /opt/colaba /opt/actions-runner
```

Перелогиньтесь под `deploy` или выполните `newgrp docker`.

### 7.2. Установка runner под пользователем deploy

```bash
sudo -u deploy -i
cd /opt/actions-runner
```

Дальше — **команды из блоков Download и Configure с страницы GitHub** (те, что вы скопировали для Linux):

1. Скачать архив (команда `curl` или `wget` с страницы).
2. Распаковать: `tar xzf actions-runner-linux-x64-*.tar.gz`
3. Настроить: `./config.sh --url https://github.com/moiseev1991-stack/Colaba --token ВАШ_ТОКЕН`
   - Имя и labels введите по желанию (например label `colaba-prod`).

### 7.3. Установка и запуск службы

```bash
cd /opt/actions-runner
sudo ./svc.sh install deploy
sudo ./svc.sh start
sudo ./svc.sh status
```

В статусе должно быть что-то вроде «active (running)».

### 7.4. Проверка в GitHub

- Откройте: **Settings → Actions → Runners** репозитория `moiseev1991-stack/Colaba`.
- Должен появиться новый runner со статусом **Online** (зелёная точка).

После этого job «Deploy on server» в workflow «Deploy (main)» сможет выполняться на этом runner.

---

## Краткий чеклист по странице GitHub

- [ ] Прочитали предупреждение безопасности (жёлтый блок).
- [ ] В «Runner image» выбрали **Linux** (не Windows).
- [ ] В «Architecture» оставили **x64** (или Arm64 для ARM-сервера).
- [ ] Скопировали команды из блока **Download** для Linux.
- [ ] Скопировали команду из блока **Configure** (с токеном).
- [ ] На сервере выполнили Download → Configure → установили службу (`svc.sh`) и запустили runner.
- [ ] В **Settings → Actions → Runners** runner в статусе **Online**.

---

## Если выбрали Windows по ошибке

- Вернитесь на страницу «Add new self-hosted runner».
- Выберите **Linux** в «Runner image».
- Заново скопируйте команды из блоков Download и Configure для Linux и выполните их на **Linux-сервере**, как в шаге 7.

На этом всё, что нужно сделать на странице и на сервере для работы CI/CD с self-hosted runner.
