# Инструкция по настройке Git для работы с GitHub

## Проблема
Git не может выполнить push, потому что требуется аутентификация в GitHub.

## Решение: Создать Personal Access Token (PAT)

### Варианты токенов

**Classic Token (классический)**:
- ✅ Проще создать и использовать
- ⚠️ Даёт доступ ко **ВСЕМ** вашим репозиториям (публичным и приватным)
- Подходит, если вы доверяете токену и работаете с несколькими проектами

**Fine-grained Token (новый, более безопасный)**:
- ✅ Можно ограничить доступ **только конкретным репозиториям**
- ✅ Более детальный контроль прав (только read, только write и т.д.)
- ⚠️ Немного сложнее в настройке
- **Рекомендуется GitHub** для новых проектов

### Шаг 1: Создать токен на GitHub

#### Вариант A: Fine-grained Token (рекомендуется)

1. Откройте: https://github.com/settings/tokens
2. Нажмите **"Generate new token"** → **"Generate new token (fine-grained)"**
3. Заполните форму:
   - **Token name**: `Colaba Project`
   - **Expiration**: выберите срок (например, 90 дней)
   - **Repository access**: выберите **"Only select repositories"** → выберите `moiseev1991-stack/Colaba`
   - **Permissions**: 
     - **Repository permissions** → **Contents**: Read and write
     - **Repository permissions** → **Metadata**: Read-only (достаточно)
4. Нажмите **"Generate token"**
5. **ВАЖНО**: Скопируйте токен сразу! Он показывается только один раз.

#### Вариант B: Classic Token (проще, но менее безопасно)

1. Откройте: https://github.com/settings/tokens
2. Нажмите **"Generate new token"** → **"Generate new token (classic)"**
3. Заполните форму:
   - **Note**: `Colaba Project` (любое название)
   - **Expiration**: выберите срок (например, 90 дней)
   - **Select scopes**: отметьте **`repo`** (полный доступ ко ВСЕМ репозиториям)
4. Нажмите **"Generate token"** внизу страницы
5. **ВАЖНО**: Скопируйте токен сразу! Он показывается только один раз.
   - Токен выглядит примерно так: `ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`

### Шаг 2: Использовать токен для push

Когда Git запросит пароль, используйте токен вместо пароля:

```powershell
cd c:\Colaba
git push origin test/test-folder-push
```

При запросе:
- **Username**: `the4per` (ваш GitHub username)
- **Password**: вставьте ваш Personal Access Token (не пароль от GitHub!)

### Альтернатива: Сохранить токен в URL (менее безопасно, но удобно)

Если хотите, чтобы Git запоминал токен, можно добавить его в URL:

```powershell
git remote set-url origin https://the4per:ВАШ_ТОКЕН@github.com/moiseev1991-stack/Colaba.git
```

**⚠️ ВНИМАНИЕ**: Токен будет виден в конфигурации Git. Не делитесь файлом `.git/config` публично!

## Текущая настройка

- **Email**: the4per@gmail.com ✅
- **Username**: the4per ✅
- **Remote**: https://github.com/moiseev1991-stack/Colaba.git ✅
- **Credential helper**: store (сохраняет учетные данные) ✅

## Проверка

После настройки токена выполните:

```powershell
cd c:\Colaba
git push origin test/test-folder-push
```

Если всё настроено правильно, ветка будет отправлена в репозиторий.
