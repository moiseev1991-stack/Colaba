# Исправления сборки Frontend (2026-03-16)

Документ описывает исправления ошибок сборки frontend, выявленные и исправленные в ходе работы.

---

## 1. Проблема с несуществующим CSS файлом

### Симптом
```
Module not found: Can't resolve './mobile-overrides.css'
```

### Причина
В `frontend/app/layout.tsx` был импорт несуществующего файла `mobile-overrides.css`.

### Решение
Удалён импорт из `layout.tsx`:

```diff
- import './globals.css';
- import './mobile-overrides.css';
+ import './globals.css';
  import { AppShell } from '@/components/AppShell';
```

### Файлы изменены
- `frontend/app/layout.tsx`

---

## 2. Проблема с дублированием зависимостей в package.json

### Симптом
```
npm warn ERESOLVE overriding peer dependency
```

### Причина
`autoprefixer` и `tailwindcss` дублировались в `dependencies` и `devDependencies`.

### Решение
Перемещены в `devDependencies`:

```json
{
  "dependencies": {
    // tailwindcss и autoprefixer удалены отсюда
  },
  "devDependencies": {
    "autoprefixer": "10.4.16",
    "tailwindcss": "^3.4.0"
  }
}
```

### Файлы изменены
- `frontend/package.json`

---

## 3. Неиспользуемые импорты (TypeScript ошибки)

### Симптом
```
Type error: 'X' is declared but its value is never read.
```

### Решения

#### 3.1 OAuthButton.tsx
```diff
- import { use } from 'react';
  import { Button } from '@/components/ui/button';
```

#### 3.2 OAuthIcons.tsx
```diff
- import { Facebook } from 'lucide-react';
  
  export const GoogleIcon = () => (
```

#### 3.3 VersionBadge.tsx
```diff
- import { useEffect, useState } from 'react';
+ import { useState } from 'react';
```

Также упрощён компонент - `versionInfo` вынесен как константа вместо useState:

```tsx
const versionInfo = {
  version: process.env.NEXT_PUBLIC_APP_VERSION || '0.0.0-dev',
  gitSha: process.env.NEXT_PUBLIC_GIT_SHA || 'local',
  buildTime: process.env.NEXT_PUBLIC_BUILD_TIME || new Date().toISOString(),
};

export function VersionBadge() {
  const [expanded, setExpanded] = useState(false);
  // ...
}
```

### Файлы изменены
- `frontend/components/OAuthButton.tsx`
- `frontend/components/OAuthIcons.tsx`
- `frontend/components/VersionBadge.tsx`

---

## 4. Ошибки Next.js Static Generation

### Симптом
```
useSearchParams() should be wrapped in a suspense boundary at page "/auth/callback"
Error: No QueryClient set, use QueryClientProvider to set one
```

### Решения

#### 4.1 /auth/callback/page.tsx

Добавлен `Suspense` boundary для `useSearchParams()`:

```tsx
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function CallbackContent() {
  const searchParams = useSearchParams();
  // ... логика компонента
}

export default function OAuthCallbackPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-blue-500" />
      </div>
    }>
      <CallbackContent />
    </Suspense>
  );
}
```

#### 4.2 /settings/deployments/page.tsx

Добавлен `export const dynamic = 'force-dynamic'` для отключения статической генерации:

```tsx
'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

export const dynamic = 'force-dynamic';
```

### Файлы изменены
- `frontend/app/auth/callback/page.tsx`
- `frontend/app/settings/deployments/page.tsx`

---

## 5. Удалён неиспользуемый JSON в callback page

### Симптом
```
Type error: 'data' is declared but its value is never read.
```

### Решение
Удалён неиспользуемый вызов `response.json()`:

```diff
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.detail || 'Ошибка авторизации');
  }

- const data = await response.json();

  // Cookies are set by backend proxy automatically
```

### Файлы изменены
- `frontend/app/auth/callback/page.tsx`

---

## Рекомендации для избежания подобных проблем

### 1. Проверка перед коммитом

Всегда запускайте локально:
```bash
cd frontend
npm run build
```

### 2. TypeScript strict mode

Проект использует строгий режим TypeScript. Убедитесь, что:
- Все импорты используются
- Нет неиспользуемых переменных
- Типы определены корректно

### 3. Next.js App Router

При использовании `useSearchParams()`, `useParams()` и других хуков, которые зависят от URL:
- Оборачивайте компонент в `<Suspense>`
- Или используйте `export const dynamic = 'force-dynamic'`

### 4. React Query

Страницы с `useQuery` должны быть динамическими:
```tsx
export const dynamic = 'force-dynamic';
```

---

## Статус

- ✅ Frontend собирается без ошибок
- ✅ TypeScript проверка проходит
- ✅ Статические страницы генерируются корректно
