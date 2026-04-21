# Email config, локальная разработка, pytest — 2026-04-21

## Суть

- Глобальная конфигурация исходящей почты в БД (`email_config`), API настроек, SMTP через `aiosmtplib`, outreach и `/outreach/config` используют `EmailService` с учётом БД.
- Локальный фронт: прокси Next.js в dev по умолчанию на `http://127.0.0.1:8001`; корневой `.env.example` дополнен под `127.0.0.1:5433` для Postgres с хоста.
- Тесты: `ENVIRONMENT=test` в `tests/conftest.py` до импорта приложения; `pytest-asyncio` 0.23.x; `asyncio_default_fixture_loop_scope=session`; тест `tests/test_email_outreach_config.py`.

## Деплой

После изменения `backend/requirements.txt` (в т.ч. `aiosmtplib`) выполнить **пересборку** образа backend и пересоздание контейнера, иначе при старте будет `ModuleNotFoundError` и API не поднимется.

## Файлы (ориентир)

- Backend: `app/modules/email/`, `app/models/email_config.py`, миграция `013_add_email_config_table.py`, `outreach/service.py`, `outreach/router.py`
- Frontend: `app/app/email/settings/`, `src/services/api/emailSettings.ts`, `app/api/v1/[...path]/route.ts`
- Документация: `docs/STATUS.md`, `docs/guides/LOCAL_SETUP.md`, `docs/email-replies-setup.md`
