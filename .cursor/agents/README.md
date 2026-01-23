# Cursor Agents для проекта Colaba

Этот каталог содержит агентов для Cursor IDE, которые автоматизируют разработку проекта LeadGen Constructor (Colaba).

## Архитектура системы

Система состоит из **Orchestrator Agent** (главный координатор) и **10 специализированных агентов**:

```
                        Orchestrator Agent
                        (Главный координатор)
                                │
                ┌───────────────┼───────────────┐
                │               │               │
    ┌───────────▼────────┐ ┌───▼──────────┐ ┌──▼─────────────┐
    │ Architecture Agent │ │Backend Agent │ │Frontend Agent  │
    └───────────────────┘ └──────────────┘ └────────────────┘
                │               │               │
    ┌───────────▼────────┐ ┌───▼──────────┐ ┌──▼─────────────┐
    │  DevOps Agent      │ │  QA Agent    │ │Security Agent  │
    └───────────────────┘ └──────────────┘ └────────────────┘
                │               │               │
    ┌───────────▼────────┐ ┌───▼──────────┐ ┌──▼─────────────┐
    │Documentation Agent │ │Code Review   │ │Optimization    │
    │                    │ │Agent         │ │Agent           │
    └───────────────────┘ └──────────────┘ └────────────────┘
                │
    ┌───────────▼────────┐
    │  Learning Agent    │
    └───────────────────┘
```

## Как работает система

### 1. Пользователь общается с Orchestrator

**Важно**: Пользователь общается **ТОЛЬКО** с Orchestrator Agent. Orchestrator сам определяет, каких агентов вызвать.

### 2. Orchestrator анализирует промпт

Orchestrator определяет тип задачи из промпта:
- Создание нового кода
- Исправление багов
- Оптимизация
- Тестирование
- Code Review
- Документация
- Безопасность
- DevOps
- Архитектура

### 3. Orchestrator вызывает нужных агентов

На основе анализа промпта Orchestrator автоматически вызывает нужных специализированных агентов в правильном порядке.

### 4. Агенты выполняют работу

Каждый агент применяет свои правила и best practices для выполнения задачи.

### 5. Orchestrator собирает результаты

Orchestrator собирает результаты от всех агентов и представляет финальный результат пользователю.

## Агенты

### Orchestrator Agent

**Файл**: `orchestrator-agent.mdc`

Главный координатор системы. Анализирует промпты пользователя и автоматически вызывает нужных специализированных агентов.

**Когда использовать**: Всегда (это точка входа для пользователя)

### Architecture Agent

**Файл**: `architecture-agent.mdc`

Проектирование системы, выбор технологического стека, определение API контрактов.

**Когда вызывается**:
- Создание нового кода (для проверки архитектуры)
- Архитектурные вопросы
- Выбор паттернов

**Основные правила**:
- SOLID принципы
- Проверка соответствия ARCHITECTURE.md
- Правильный tech stack
- API Design (OpenAPI 3.0)

### Backend Agent

**Файл**: `backend-agent.mdc`

Разработка серверной логики, API endpoints, управление базами данных.

**Когда вызывается**:
- Создание/изменение API endpoints
- Backend задачи
- Работа с БД

**Основные правила**:
- FastAPI Patterns (Repository, Service, Dependency Injection)
- Async/await для I/O операций
- SQLAlchemy 2.0+
- Type hints
- Error handling

### Frontend Agent

**Файл**: `frontend-agent.mdc`

Разработка пользовательского интерфейса, управление состоянием, интеграция с API.

**Когда вызывается**:
- Создание/изменение UI компонентов
- Frontend задачи
- Работа с React/TypeScript

**Основные правила**:
- React 18+ Patterns
- TypeScript strict mode
- React Query для server state
- Zustand для client state
- Accessibility (WCAG 2.1 AA)

### DevOps Agent

**Файл**: `devops-agent.mdc`

Инфраструктура, containerization, CI/CD, мониторинг.

**Когда вызывается**:
- Docker задачи
- CI/CD настройка
- Инфраструктура
- Health checks

**Основные правила**:
- Multi-stage Docker builds
- Non-root user в контейнерах
- Health checks
- CI/CD pipelines
- Structured logging

### QA Agent

**Файл**: `qa-agent.mdc`

Тестирование, обеспечение качества кода.

**Когда вызывается**:
- Создание нового кода (для тестов)
- Тестирование задач
- Проверка coverage

**Основные правила**:
- Минимум 80% coverage (backend) / 70% (frontend)
- Unit, Integration, E2E тесты
- pytest (backend), Vitest (frontend)
- Моки для внешних зависимостей

### Security Agent

**Файл**: `security-agent.mdc`

Защита от уязвимостей, соблюдение OWASP Top 10.

**Когда вызывается**:
- Создание нового кода (для проверки безопасности)
- Security задачи
- Code review

**Основные правила**:
- OWASP Top 10 checks
- Input validation (Pydantic)
- Secrets management (env variables)
- Access control
- SQL injection prevention

### Documentation Agent

**Файл**: `documentation-agent.mdc`

Документирование кода, API, архитектурных решений.

**Когда вызывается**:
- Создание нового кода (для docstrings)
- Документация задач
- API endpoints

**Основные правила**:
- Docstrings для всех функций
- OpenAPI документация
- ADRs для архитектурных решений
- README обновления

### Code Review Agent

**Файл**: `code-review-agent.mdc`

Проверка качества кода перед коммитом/PR.

**Когда вызывается**:
- Проверка кода перед коммитом
- Code review задачи
- Проверка качества

**Основные правила**:
- Соответствие style guide
- DRY principle
- Test coverage
- Security review
- Best practices

### Optimization Agent

**Файл**: `optimization-agent.mdc`

Оптимизация производительности, выявление узких мест.

**Когда вызывается**:
- Оптимизация задач
- Проблемы производительности
- Медленные запросы

**Основные правила**:
- Database optimization (N+1 prevention, индексы)
- Caching (Redis)
- Frontend optimization (code splitting, bundle size)
- Performance metrics

### Learning Agent

**Файл**: `learning-agent.mdc`

Документирование learnings, анализ метрик, непрерывное улучшение.

**Когда вызывается**:
- Архитектурные решения (для ADR)
- Анализ багов (RCA)
- Обновление best practices

**Основные правила**:
- ADRs для решений
- Troubleshooting guides
- Metrics tracking
- Knowledge base обновления

## Примеры использования

### Пример 1: Создание API endpoint

**Промпт пользователя**: "Создай API endpoint для поиска доменов"

**Действия Orchestrator**:
1. Анализ: создание нового API endpoint → Backend задача
2. Вызов агентов:
   - Architecture Agent: проверка соответствия ARCHITECTURE.md
   - Backend Agent: создание endpoint с правильными паттернами
   - Security Agent: добавление валидации и access control
   - Documentation Agent: добавление docstrings и OpenAPI аннотаций
   - QA Agent: предложение тестов
3. Сбор результатов и представление пользователю

### Пример 2: Исправление бага

**Промпт пользователя**: "Исправить баг в frontend - не работает загрузка данных"

**Действия Orchestrator**:
1. Анализ: исправление бага → Frontend задача
2. Вызов агентов:
   - Frontend Agent: анализ проблемы, исправление
   - QA Agent: тесты для исправления
   - Code Review Agent: проверка качества
3. Сбор результатов и представление пользователю

### Пример 3: Оптимизация

**Промпт пользователя**: "Оптимизировать запрос к БД, он работает медленно"

**Действия Orchestrator**:
1. Анализ: оптимизация производительности → Backend задача
2. Вызов агентов:
   - Optimization Agent: анализ запроса, выявление N+1 problem
   - Backend Agent: применение оптимизации
3. Сбор результатов и представление пользователю

## Специфика проекта

Все агенты учитывают специфику проекта LeadGen Constructor:

- **SEO MVP режим**: 20 страниц максимум, 7 этапов прогресса
- **Модульная архитектура**: модули (Search, Filter, Analytics, Automation, Messaging)
- **Multi-tenancy**: все данные привязаны к `organization_id`
- **Tech stack**: Next.js 14, React 18, TypeScript, FastAPI, PostgreSQL 16, Redis, Celery

## Документы проекта

Агенты ссылаются на следующие документы (когда будут созданы):

- `docs/guides/LEADGEN_RULES.md` - полные правила проекта
- `docs/architecture/ARCHITECTURE.md` - архитектурные решения
- `docs/api/API_REFERENCE.md` - API контракты
- `docs/guides/MODULE_GUIDE.md` - руководство по модулям
- `docs/guides/DATABASE_SCHEMA.md` - структура БД

## Как добавить нового агента

1. Создать файл `.mdc` в `.cursor/agents/`
2. Добавить YAML frontmatter с `name` и `description`
3. Описать роль агента
4. Добавить обязательные правила
5. Добавить примеры правильного кода
6. Обновить этот README

## Ссылки

- Полные правила проекта: `docs/guides/LEADGEN_RULES.md` (когда будет создан)
- Структура проекта: `docs/guides/PROJECT_STRUCTURE_RULES.md`
- Git workflow: `docs/guides/REPOSITORY_WORKFLOW_RULES.md`
