# Подключение к серверу по SSH-ключу

Примеры для ключа `colaba_deploy_ed25519` (приватный) и `colaba_deploy_ed25519.pub` (публичный).

---

## 1. Один раз: добавить ключ на сервер

Подключитесь к серверу **как обычно** (логин/пароль или уже имеющийся ключ).

### Вариант A: у вас есть пароль от пользователя на сервере

```bash
# На вашем ПК (Windows PowerShell или WSL) — скопировать публичный ключ в буфер (если есть clip)
Get-Content C:\cod\Colaba\Colaba\colaba_deploy_ed25519.pub | Set-Clipboard

# На сервере — один раз выполнить (подставьте свой логин: root, ubuntu, deploy и т.д.):
mkdir -p ~/.ssh
chmod 700 ~/.ssh
echo "ВСТАВЬТЕ_СЮДА_СОДЕРЖИМОЕ_ФАЙЛА_colaba_deploy_ed25519.pub" >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

**Что вставить вместо «ВСТАВЬТЕ_СЮДА_…»:**  
Откройте файл `colaba_deploy_ed25519.pub` и вставьте **целиком одну строку**, например:

```
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIAx7JELFh6uzwoB6W83pLv7l6zlQ5pIo8MBLc0EWy2Uc colaba-deploy
```

### Вариант B: скопировать ключ одной командой с ПК на сервер (если уже есть доступ по паролю)

**Из PowerShell (Windows):** сначала установите `ssh-copy-id` (через Git for Windows или WSL), либо вручную:

```powershell
# Показать содержимое публичного ключа — скопируйте и на сервере вставьте в ~/.ssh/authorized_keys
type C:\cod\Colaba\Colaba\colaba_deploy_ed25519.pub
```

На сервере:

```bash
mkdir -p ~/.ssh
chmod 700 ~/.ssh
nano ~/.ssh/authorized_keys
# Вставьте скопированную строку из .pub, сохраните (Ctrl+O, Enter, Ctrl+X)
chmod 600 ~/.ssh/authorized_keys
```

После этого можно подключаться по ключу.

---

## 2. Подключиться по ключу (образец)

### Windows (PowerShell или CMD)

Базовый образец:

```powershell
ssh -i "C:\cod\Colaba\Colaba\colaba_deploy_ed25519" пользователь@IP_или_домен_сервера
```

**Примеры:**

```powershell
# Подключение под пользователем root
ssh -i "C:\cod\Colaba\Colaba\colaba_deploy_ed25519" root@192.168.1.100

# Под пользователем ubuntu (часто на VPS)
ssh -i "C:\cod\Colaba\Colaba\colaba_deploy_ed25519" ubuntu@myserver.com

# Под пользователем deploy (как в инструкции Colaba)
ssh -i "C:\cod\Colaba\Colaba\colaba_deploy_ed25519" deploy@myserver.com

# Указать порт (если не 22)
ssh -i "C:\cod\Colaba\Colaba\colaba_deploy_ed25519" -p 2222 deploy@myserver.com
```

Подставьте вместо `пользователь`, `IP_или_домен_сервера` и пути к ключу свои значения.

---

## 3. Не вводить путь к ключу каждый раз (config)

Создайте файл конфига SSH (на Windows обычно `C:\Users\ВашЛогин\.ssh\config`).

**Пример содержимого:**

```
Host colaba-server
    HostName 192.168.1.100
    User deploy
    IdentityFile C:\cod\Colaba\Colaba\colaba_deploy_ed25519
    IdentitiesOnly yes
```

Тогда подключение:

```powershell
ssh colaba-server
```

**Ещё пример с доменом и портом:**

```
Host colaba-prod
    HostName myserver.com
    Port 22
    User deploy
    IdentityFile C:\cod\Colaba\Colaba\colaba_deploy_ed25519
    IdentitiesOnly yes
```

Подключение: `ssh colaba-prod`.

---

## 4. Проверка прав на ключ (Linux/WSL)

Если используете WSL или Linux, у приватного ключа не должно быть лишних прав:

```bash
chmod 600 /path/to/colaba_deploy_ed25519
```

На Windows обычно достаточно того, что ключ не доступен «всем».

---

## 5. Частые ошибки

| Ошибка | Что сделать |
|--------|-------------|
| `Permission denied (publickey)` | Проверить, что на сервере в `~/.ssh/authorized_keys` добавлена **одна строка** из `colaba_deploy_ed25519.pub` и права: `chmod 600 ~/.ssh/authorized_keys`. |
| `Could not open a connection to your authentication agent` | На Windows это обычно не нужно; подключайтесь так: `ssh -i "путь\к\colaba_deploy_ed25519" user@host`. |
| Ключ просят ввести фразой (passphrase) | Если при создании ключа задавали пароль — его нужно ввести при подключении. Без пароля — просто Enter. |
| Подключение по паролю всё равно спрашивает пароль | Убедитесь, что в команде указан именно приватный ключ (`colaba_deploy_ed25519` **без** `.pub`) и что эта строка лежит в `authorized_keys` на сервере. |

---

## Кратко: один раз на сервере, потом с ПК

**На сервере (один раз):**

```bash
mkdir -p ~/.ssh
echo "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIAx7JELFh6uzwoB6W83pLv7l6zlQ5pIo8MBLc0EWy2Uc colaba-deploy" >> ~/.ssh/authorized_keys
chmod 700 ~/.ssh
chmod 600 ~/.ssh/authorized_keys
```

**С вашего ПК (Windows):**

```powershell
ssh -i "C:\cod\Colaba\Colaba\colaba_deploy_ed25519" deploy@IP_ВАШЕГО_СЕРВЕРА
```

Подставьте свой логин и IP/домен — этого достаточно для подключения по ключу.
