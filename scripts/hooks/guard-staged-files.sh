#!/usr/bin/env bash
# Guard-скрипт для pre-commit хука.
# Блокирует коммит, если в staged-файлах есть запрещённые паттерны (мусор от ИИ-агентов)
# или код/доки, созданные не в тех папках. Правила — в AGENTS.md §2 и §3.
#
# Запуск: scripts/hooks/guard-staged-files.sh
set -euo pipefail

# Статус выхода: 0 = ok, 1 = найдены нарушения.
status=0
errors=()

# Список staged-файлов (только добавленные/изменённые, без удалённых).
mapfile -t files < <(git diff --cached --name-only --diff-filter=ACMR)

# --- Запрещённые имена файлов (в любом месте репо) ---
forbidden_globs=(
  '*_SUMMARY.md' '*_REPORT.md' '*_RESULT*.md' '*_RESULTS*.md'
  'REORGANIZATION_*.md' 'CLEANUP_*.md' 'DIAGNOSTIC_*.md'
  'TROUBLESHOOTING_*.md' '*_FIX_SUMMARY.md' 'RUN_LOCAL_NOW.md'
  'tmp_*.txt' 'verify_*.txt' '*_log*.txt' 'log.txt'
  'service (2).py' 'page (2).tsx' '* (2).*'
)

for f in "${files[@]}"; do
  base="$(basename "$f")"

  # 1) Проверка запрещённых имён.
  for pat in "${forbidden_globs[@]}"; do
    case "$base" in
      $pat)
        errors+=("Запрещённый файл: $f (шаблон «$pat»). Не создавайте одноразовые отчёты/сводки — обновите docs/STATUS.md. См. AGENTS.md §3.")
        status=1
        ;;
    esac
  done

  # 2) Код/доки в корне запрещены. Разрешены только конфиги и README/CHANGELOG/AGENTS.
  #    Т.е. путь не должен содержать «/» и при этом быть кодом/докой.
  if [[ "$f" != *"/"* ]]; then
    case "$base" in
      *.py|*.ts|*.tsx|*.js|*.jsx)
        errors+=("Код в корне запрещён: $f. Backend → backend/app/, Frontend → frontend/. См. AGENTS.md §2.")
        status=1
        ;;
      *.md)
        # В корне разрешены только эти .md
        case "$base" in
          README.md|CHANGELOG.md|AGENTS.md) ;;
          *) errors+=("Документация в корне запрещена: $f. Все .md → docs/. См. AGENTS.md §2."); status=1 ;;
        esac
        ;;
      *.sh)
        errors+=("Скрипт в корне запрещён: $f. Скрипты → scripts/. См. AGENTS.md §2.")
        status=1
        ;;
    esac
  fi
done

if [ "$status" -ne 0 ]; then
  echo "============================================================" >&2
  echo "🚫 pre-commit guard: коммит заблокирован (нарушения правил)" >&2
  echo "============================================================" >&2
  for e in "${errors[@]}"; do
    echo "  • $e" >&2
  done
  echo "" >&2
  echo "Полные правила: AGENTS.md (в корне репо)." >&2
  echo "Если нужно обойти проверку ОСОЗНАННО: git commit --no-verify (не злоупотреблять)." >&2
  exit 1
fi

exit 0
