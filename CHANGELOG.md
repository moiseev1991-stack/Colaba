# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added

- Глобальная конфигурация email (`email_config`): Hyvor Relay или SMTP/IMAP из UI и SQLAdmin, API `/email/settings`, зависимость `aiosmtplib`.
- Страница «Настройка email» (`/app/email/settings`), клиент `emailSettings.ts`, пункт в сайдбаре.
- Миграции Alembic для email-модуля и `email_config` (ревизия 013).
- Тесты `tests/test_email_outreach_config.py`; настройка pytest (asyncio session scope, `ENVIRONMENT=test` в conftest).

### Fixed

- Прокси Next.js в dev: по умолчанию upstream `http://127.0.0.1:8001` вместо недоступного hostname `backend` на хосте.
- Outreach и `GET /outreach/config` используют `EmailService` и настройки из БД.

### Documentation

- Обновлены `docs/STATUS.md`, `docs/guides/LOCAL_SETUP.md`, `docs/deployment/WORKLOG.md`, `docs/changes/email-config-local-dev-pytest-2026-04-21.md`.

### Deployment

- После обновления `backend/requirements.txt` необходима **пересборка** Docker-образа backend.

## [0.1.0] - 2026-03-16

### Added
- Initial project setup with FastAPI backend and Next.js frontend
- User authentication with JWT tokens (access + refresh)
- Organization management with roles (OWNER, ADMIN, MEMBER)
- SEO audit module
- Lead generation module
- Government tenders module
- Dashboard with statistics
