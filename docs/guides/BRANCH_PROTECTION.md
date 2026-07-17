# Защита ветки main (branch protection) — инструкция

> Это настройки GitHub, их **нельзя закоммитить** в репозиторий. Их нужно включить вручную один раз.
> Это **финальный барьер**, который ни один ИИ-агент не может обойти: даже если хуки (`--no-verify`) отключены,
> ломающий код не попадёт в `main` без зелёного CI и ревью.

## Зачем

Сейчас в `main` можно пушить напрямую, а CI — рекомендательный. Это корень проблемы «прод ломается»:
и ваш код, и код партнёра сливаются без обязательной проверки. Branch protection делает проверку обязательной.

## Как включить (репо: `moiseev1991-stack/Colaba`)

1. **GitHub → репозиторий → Settings → Branches → Add branch protection rule** (или «Rulesets» → New rule).
2. **Branch name pattern:** `main`
3. Включить:

### Обязательные проверки (Require status checks to pass before merging)

- [x] Require branches to be up to date before merging
- Required checks (добавить после первого срабатывания CI):
  - `Backend tests`
  - `Backend checks` → шаг **Ruff lint (blocking)** (если выделен в отдельную джобу) либо вся job `Backend tests`
  - `Frontend checks`

> ⚠️ Имена чеков появляются в списке **только после того, как CI хотя бы раз отработал**.
> Сначала пушьте PR, дождитесь CI — потом возвращайтесь сюда и выбирайте чеки.

### Защита от прямого пуша

- [x] **Require a pull request before merging** (запрет прямого пуша в `main`)
- [x] **Require approvals:** минимум 1 (один разработчик ревьюит другого)
- [x] **Require review from Code Owners** (включает `.github/CODEOWNERS`)

### Слияние / история

- [x] **Require linear history** (только rebase/squash — убирает merge-коммиты, снижает конфликты между агентами)
- Рекомендуется: разрешить только **Squash merge** (Settings → General → Pull Requests).

### Дополнительно

- [x] **Do not allow bypassing the above settings** (даже админ не пушит в обход — для прод-репо)
- [x] **Restrict who can push to matching branches** — оставить пустым (никто не пушит напрямую).

## Проверка

После настройки попробуйте запушить в `main` напрямую — GitHub должен отказать.
Создайте PR с нарушением (например, `random message` коммит) — CI должен покраснеть на commitlint/Ruff, и merge-кнопка будет неактивна.

## Что это даёт в связке с AGENTS.md + хуками

- **Локально (pre-commit):** guard + lint-staged ловят мусор и ломают коммит сразу.
- **На PR (CI required):** ruff/eslint/typecheck/тесты — обязательны.
- **На merge (branch protection):** зелёный CI + одобрение Code Owner — обязательны.
  Ни один слой по отдельности не идеален (хуки обходятся `--no-verify`), но **вместе три слоя** надёжно защищают `main`.
