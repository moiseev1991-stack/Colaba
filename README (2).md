# LeadGen Constructor Frontend

Frontend приложение на Next.js 14 для модульной платформы автоматического сбора лидов и анализа данных.

## Технологии

- **Next.js 14**: React framework с App Router
- **React 18+**: UI library
- **TypeScript**: Type safety
- **Tailwind CSS**: Utility-first CSS framework
- **React Query**: Server state management
- **Zustand**: Client state management
- **Axios**: HTTP client

## Установка

### 1. Установить зависимости

```bash
npm install
# или
yarn install
# или
pnpm install
```

### 2. Настроить environment variables

Создать `.env.local` файл:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
```

### 3. Запустить dev сервер

```bash
npm run dev
# или
yarn dev
# или
pnpm dev
```

Откройте [http://localhost:3000](http://localhost:3000) в браузере.

## Структура проекта

```
frontend/
├── src/
│   ├── app/                          # Next.js 14 App Router
│   │   ├── layout.tsx                # Root layout
│   │   ├── page.tsx                  # Home page
│   │   ├── globals.css               # Global styles
│   │   └── ...
│   │
│   ├── components/                   # React components
│   │   ├── providers/                # Global providers
│   │   └── ...
│   │
│   ├── hooks/                        # Custom hooks
│   │   └── ...
│   │
│   ├── services/                     # API clients, services
│   │   ├── api/                      # API client
│   │   └── ...
│   │
│   ├── stores/                       # Zustand stores
│   │   └── ...
│   │
│   ├── types/                        # TypeScript types
│   │   └── ...
│   │
│   └── utils/                        # Utility functions
│       └── ...
│
├── public/                           # Static files
├── .env.local                        # Environment variables (gitignored)
├── package.json                      # Dependencies
├── tsconfig.json                     # TypeScript config
├── tailwind.config.js                # Tailwind config
├── next.config.js                    # Next.js config
└── README.md                         # Этот файл
```

## Разработка

### Type checking

```bash
npm run type-check
```

### Линтинг

```bash
npm run lint
```

### Форматирование кода

```bash
npm run format
```

### Тестирование

```bash
npm run test
npm run test:watch
npm run test:coverage
```

## Build для production

```bash
npm run build
npm start
```

## UI Спецификация

См. `TECHNICAL_SPECIFICATION.md` раздел 11 для детальной UI спецификации SEO MVP режима.

### Frame 1 — "Ввод"
- Hero блок (красный, высота 200px)
- Заголовок "Ввод"
- Поле ввода запроса
- 3 превью режимов (для лидов, для SEO, для цен)

### Frame 2 — "Результат"
- Таблица результатов
- Фильтры
- Кнопки действий (Copy outreach, Open domain)
