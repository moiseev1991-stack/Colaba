# AI-ассистенты

Конфигурация AI-моделей для вызовов в проекте: чат, Vision (распознавание изображений, в т.ч. для обхода капчи). Полный CRUD, реестр шаблонов по провайдерам.

---

## Назначение

- **Чат** — `chat(assistant_id, messages, db)` для текстовых запросов.
- **Vision** — `vision(assistant_id, image_b64, prompt, db)` для распознавания изображений (капча, скриншоты и т.п.).
- **Обход капчи** — AI с `supports_vision=true` используется в `CaptchaBypassConfig` для решения image-captcha (Яндекс, Google и др.).

---

## Модель БД: `AiAssistant`

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | int | PK |
| `name` | str | Название (например «GPT-4o» или «Ollama LLaVA») |
| `provider_type` | str | Тип провайдера: `openai`, `anthropic`, `google`, `mistral`, `ollama`, `groq`, `together`, `openrouter`, `azure_openai`, `xai`, `deepseek`, `other` |
| `model` | str | Имя модели (например `gpt-4o`, `claude-3-5-sonnet-20241022`, `llava`) |
| `config` | JSONB | Ключи: `api_key`, `base_url`, `organization`, `api_version`, `deployment_name` — в зависимости от `provider_type` |
| `supports_vision` | bool | Поддержка изображений (нужно для обхода капчи) |
| `is_default` | bool | Флаг «по умолчанию»; в таблице только один может быть `true` |
| `updated_at` | datetime | Время обновления |

Миграция: `backend/alembic/versions/005_add_ai_assistant.py`.

---

## Реестр провайдеров: `AI_ASSISTANT_REGISTRY`

Файл: `backend/app/modules/ai_assistants/registry.py`.

Для каждого `provider_type` заданы:

- `name` — отображаемое имя
- `config_keys` — список полей в `config` (api_key, base_url, organization, api_version, deployment_name, model)
- `model_examples` — примеры имён моделей
- `default_vision` — функция `(model) -> bool` для автоподстановки `supports_vision` по имени модели

Поддерживаемые провайдеры:

| provider_type | Примеры моделей |
|---------------|-----------------|
| `openai` | gpt-4o, gpt-4o-mini, gpt-4-turbo |
| `anthropic` | claude-3-5-sonnet-20241022, claude-3-opus-20240229 |
| `google` | gemini-2.0-flash, gemini-1.5-pro |
| `mistral` | mistral-large-latest, pixtral-12b-2409 |
| `ollama` | llava, llama3.2-vision, llama3.2 |
| `groq` | llama-3.1-70b-versatile, mixtral-8x7b-32768 |
| `together` | meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo |
| `openrouter` | openai/gpt-4o, anthropic/claude-3.5-sonnet |
| `azure_openai` | (deployment_name в config) |
| `xai` | grok-2, grok-2-vision |
| `deepseek` | deepseek-chat, deepseek-reasoner |
| `other` | OpenAI-совместимый API (api_key, base_url, model в config) |

Функции:

- `get_registry_entry(provider_type)` — запись реестра или `None`
- `get_settings_schema(provider_type)` — поля для формы: `key`, `label`, `type`, `required`, `secret`

---

## API: `/api/v1/ai-assistants`

Роутер: `backend/app/modules/ai_assistants/router.py`. Префикс: `/ai-assistants` (в API — `/api/v1/ai-assistants`).

| Метод | Путь | Описание | Доступ |
|-------|------|----------|--------|
| GET | `/ai-assistants` | Список ассистентов (config с замаскированными `api_key` → `***`) | auth |
| GET | `/ai-assistants/registry` | Реестр шаблонов: provider_type, name, config_keys, model_examples, settings_schema | auth |
| GET | `/ai-assistants/{id}` | Один ассистент | auth |
| POST | `/ai-assistants` | Создать. При `is_default=true` снимается флаг с остальных | superuser |
| PUT | `/ai-assistants/{id}` | Обновить. Секреты `***` не перезаписываются. `is_default=true` — снять с остальных | superuser |
| DELETE | `/ai-assistants/{id}` | Удалить. 409, если используется в `CaptchaBypassConfig` | superuser |

Схемы: `AiAssistantCreate`, `AiAssistantUpdate` в `backend/app/modules/ai_assistants/schemas.py`.

---

## Клиент: `chat` и `vision`

Файл: `backend/app/modules/ai_assistants/client.py`.

```python
from app.modules.ai_assistants.client import chat, vision
```

- **`chat(assistant_id, messages, db, max_tokens=1024, temperature=0.7) -> str`**  
  Универсальный чат. По `provider_type` вызывается адаптер (OpenAI, Anthropic, Google, Ollama, OpenAI‑compatible, Azure). `messages`: `[{"role":"user","content":"..."}]` и т.п.

- **`vision(assistant_id, image_b64, prompt, db) -> str`**  
  Отправка изображения (base64) и prompt. Используется в `captcha/solver.solve_image_captcha`.

Адаптеры: OpenAI, Ollama (httpx), Anthropic, Google (gemini), Groq/Together/OpenRouter/DeepSeek/xAI/Mistral/other (OpenAI‑compatible), Azure OpenAI. Для Vision — отдельные `_vision_*` с передачей `image_url` или `inline_data` в зависимости от API.

---

## Сервис: CRUD и маскирование

Файл: `backend/app/modules/ai_assistants/service.py`.

- `list_ai_assistants(db)`, `get_ai_assistant(id, db)`, `get_ai_assistant_row(id, db)` — чтение; в `config` ключи из `SECRET_KEYS` (например `api_key`) заменяются на `***`.
- `create_ai_assistant(..., db)`, `update_ai_assistant(id, ..., db)` — создание/обновление; при `is_default=True` выполняется `_unset_default`.
- `delete_ai_assistant(id, db)` — удаление; при использовании в `CaptchaBypassConfig` выбрасывается `UsedInCaptchaError`.

`_is_configured(config, provider_type)` — проверка, что обязательные для провайдера поля заполнены (для `azure_openai` — в т.ч. `deployment_name`).

---

## Frontend

- **Страница:** `frontend/app/settings/ai-assistants/page.tsx`
- **API-клиент:** `frontend/src/services/api/ai_assistants.ts`
- **Ссылки:** TopBar, `/settings` → «AI-ассистенты», путь `/settings/ai-assistants`

Функции: список, создание из шаблона по `provider_type`, редактирование, «Сделать по умолчанию», удаление. Форма строится по `settings_schema` из `/ai-assistants/registry`.

---

## См. также

- [CAPTCHA_BYPASS.md](CAPTCHA_BYPASS.md) — использование AI с Vision в обходе капчи
- [PROVIDERS_SETTINGS.md](PROVIDERS_SETTINGS.md) — настройки провайдеров поиска
