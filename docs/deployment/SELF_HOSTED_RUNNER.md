# Настройка Self-Hosted Runner для деплоя

Runner нужен для job `Deploy on server` в `.github/workflows/deploy.yml`.

## Шаги

### 1. SSH на сервер
```bash
ssh user@88.210.53.183
```

### 2. Скачать и распаковать
```bash
mkdir actions-runner && cd actions-runner
curl -o actions-runner-linux-x64-2.331.0.tar.gz -L \
  https://github.com/actions/runner/releases/download/v2.331.0/actions-runner-linux-x64-2.331.0.tar.gz
tar xzf ./actions-runner-linux-x64-2.331.0.tar.gz
```

### 3. Настроить
- GitHub → Settings → Actions → Runners → **New self-hosted runner**
- Выбрать **Linux**, **x64**
- Скопировать токен из команды `./config.sh` (он действует ограниченное время)

```bash
./config.sh --url https://github.com/moiseev1991-stack/Colaba --token ВСТАВЬ_ТОКЕН_С_GITHUB
```

При вопросах:
- Runner group: Enter (по умолчанию)
- Name: например `colaba-prod`

### 4. Запустить как сервис
```bash
sudo ./svc.sh install
sudo ./svc.sh start
```

### 5. Проверить
GitHub → Settings → Actions → Runners — должен появиться runner со статусом **Idle**.

### 6. Запустить деплой
Actions → Deploy (main) → Run workflow (или push в main после успешного CI).
