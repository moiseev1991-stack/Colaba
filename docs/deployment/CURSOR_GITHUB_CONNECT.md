# Подключение Cursor к GitHub

## Текущее состояние

Ваш проект **уже привязан** к GitHub:

- **Remote:** `origin` → `https://github.com/moiseev1991-stack/Colaba.git`
- **Ветка:** `main` отслеживает `origin/main`
- **Папка с репозиторием:** `C:\cod\Colaba\Colaba` (внутри неё есть папка `.git`)

Чтобы Cursor корректно работал с Git и GitHub, сделайте следующее.

---

## 1. Открыть правильную папку в Cursor

Git должен видеть репозиторий в **корне** открытой папки.

- **Правильно:** открыть папку `C:\cod\Colaba\Colaba` (где лежит `.git`).
- **Неправильно:** открывать только `C:\cod\Colaba` — тогда репозиторий будет в подпапке `Colaba`, и встроенный Git может вести себя не так, как ожидается.

**Как открыть:**
- **File → Open Folder** (или Ctrl+K Ctrl+O).
- Выберите `C:\cod\Colaba\Colaba` и нажмите «Выбор папки».

После этого в боковой панели **Source Control** (иконка ветки) будет отображаться этот репозиторий.

---

## 2. Войти в GitHub в Cursor

Чтобы пушить, пуллить и работать с GitHub из Cursor без лишних запросов:

1. Нажмите на иконку **аккаунта** (или **Source Control** в боковой панели).
2. В разделе **Accounts** нажмите **Sign in** и выберите **GitHub**.
3. Подтвердите вход в браузере (OAuth).

После входа Cursor сможет использовать ваш GitHub-аккаунт для `git push`, `git pull` и т.д.

---

## 3. Проверить подключение и подтянуть изменения (в один клик)

**Вариант A — из Cursor:**
1. Убедитесь, что открыта папка `C:\cod\Colaba\Colaba` (File → Open Folder).
2. **Terminal → Run Task** (или Ctrl+Shift+B / Cmd+Shift+B).
3. Выберите задачу:
   - **Git: Connect to GitHub (fetch + status)** — проверить remote и подтянуть ссылки;
   - **Git: Pull from GitHub (main)** — скачать последние изменения в `main`.

**Вариант B — скрипт из папки проекта:**
- В проводнике дважды запустите `scripts\git-sync-github.bat` (или в терминале: `.\scripts\git-sync-github.ps1`).

**Вручную в терминале:**

```powershell
cd C:\cod\Colaba\Colaba
git remote -v
git fetch origin
git status
```

- **git remote -v** — должен показать `origin` и URL репозитория.
- **git fetch origin** — подтянет последние ссылки с GitHub (без слияния с вашей веткой).
- **git status** — покажет текущую ветку и есть ли локальные изменения.

Если `git fetch` проходит без ошибок — подключение к GitHub работает.

---

## 4. Если Cursor открывает папку `C:\cod\Colaba`

Тогда в корне открытой папки нет `.git` (он в `Colaba\Colaba`). Варианты:

**Вариант A (рекомендуется):** открыть в Cursor именно папку с репозиторием:
- **File → Open Folder** → `C:\cod\Colaba\Colaba`

**Вариант B:** оставить открытой `C:\cod\Colaba` и работать с Git из терминала, явно заходя в репозиторий:
```powershell
cd C:\cod\Colaba\Colaba
git pull origin main
git push origin main
```

---

## Краткий чеклист

- [ ] В Cursor открыта папка `C:\cod\Colaba\Colaba` (где лежит `.git`).
- [ ] Выполнен вход в GitHub (Accounts → Sign in → GitHub).
- [ ] В терминале `git remote -v` показывает `origin` и URL репозитория.
- [ ] `git fetch origin` выполняется без ошибок.

После этого Cursor считается подключённым к GitHub: можно коммитить, пушить и пуллить из интерфейса и терминала.
