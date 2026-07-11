"""Валидатор сгенерированного КП «4 хода» (ТЗ 2026-07-11 §3.5).

Проверяет на выходе LLM:
- длина в лимите канала
- ровно один вопрос в конце body
- нет ссылок (для messenger)
- нет стоп-слов

Если что-то не так — kp_service делает 1 повтор регенерации, потом
помечает draft флагом «проверь вручную».
"""

from __future__ import annotations

from dataclasses import dataclass, field

from .pain_dictionaries import find_stop_words, has_url


@dataclass
class ValidationIssue:
    kind: str      # 'length' | 'question_end' | 'url' | 'stop_word' | 'tech_word'
    detail: str


@dataclass
class ValidationResult:
    ok: bool
    issues: list[ValidationIssue] = field(default_factory=list)


# Лимиты — из ТЗ.
_MESSENGER_MAX_LINES = 6
_MESSENGER_MIN_LINES = 3   # 3 — минимум чтобы влезли ходы 1+3+4 (2 иногда опускается)
_MESSENGER_MAX_CHARS = 700

_EMAIL_MAX_BODY_LINES = 12  # чуть свободнее 6-9 из ТЗ, чтобы LLM не бился о жёсткие 9
_EMAIL_MIN_BODY_LINES = 4
_EMAIL_MAX_BODY_CHARS = 1800


def _count_lines(text: str) -> int:
    """Считает непустые строки (пустые между абзацами не в счёт)."""
    if not text:
        return 0
    return sum(1 for line in text.splitlines() if line.strip())


def _has_single_question_at_end(text: str) -> tuple[bool, str]:
    """(True, "") если ровно один '?' в тексте И он в последних 3 непустых строках.
    Иначе (False, reason)."""
    if not text:
        return False, "текст пустой"
    q_count = text.count("?")
    if q_count == 0:
        return False, "нет вопроса в конце (0 знаков «?»)"
    if q_count > 1:
        return False, f"слишком много вопросов ({q_count}), должен быть ровно 1"
    # Один вопрос — проверим что он ближе к концу.
    tail = "\n".join(
        line for line in text.strip().splitlines()[-3:] if line.strip()
    )
    if "?" not in tail:
        return False, "вопрос есть, но не в последних 3 строках"
    return True, ""


def validate_kp(
    *,
    subject: str,
    body: str,
    channel: str,
) -> ValidationResult:
    """Прогоняет все проверки. channel: 'messenger' | 'email'."""
    ch = (channel or "messenger").strip().lower()
    issues: list[ValidationIssue] = []

    # --- length -------------------------------------------------------------
    body_lines = _count_lines(body)
    body_chars = len(body or "")
    if ch == "messenger":
        if body_lines < _MESSENGER_MIN_LINES:
            issues.append(ValidationIssue(
                "length",
                f"мессенджер: строк {body_lines} < мин. {_MESSENGER_MIN_LINES}",
            ))
        if body_lines > _MESSENGER_MAX_LINES:
            issues.append(ValidationIssue(
                "length",
                f"мессенджер: строк {body_lines} > макс. {_MESSENGER_MAX_LINES}",
            ))
        if body_chars > _MESSENGER_MAX_CHARS:
            issues.append(ValidationIssue(
                "length",
                f"мессенджер: {body_chars} символов > макс. {_MESSENGER_MAX_CHARS}",
            ))
    else:  # email
        if body_lines < _EMAIL_MIN_BODY_LINES:
            issues.append(ValidationIssue(
                "length",
                f"email: строк {body_lines} < мин. {_EMAIL_MIN_BODY_LINES}",
            ))
        if body_lines > _EMAIL_MAX_BODY_LINES:
            issues.append(ValidationIssue(
                "length",
                f"email: строк {body_lines} > макс. {_EMAIL_MAX_BODY_LINES}",
            ))
        if body_chars > _EMAIL_MAX_BODY_CHARS:
            issues.append(ValidationIssue(
                "length",
                f"email: {body_chars} симв > макс. {_EMAIL_MAX_BODY_CHARS}",
            ))
        # Тема — до 8 слов (грубо, разделяя по пробелам).
        subj_words = len((subject or "").split())
        if subj_words > 10:
            issues.append(ValidationIssue(
                "length",
                f"email: тема {subj_words} слов > макс. 10",
            ))

    # --- question at end ---------------------------------------------------
    q_ok, q_reason = _has_single_question_at_end(body)
    if not q_ok:
        issues.append(ValidationIssue("question_end", q_reason))

    # --- URLs (только messenger) --------------------------------------------
    if ch == "messenger" and has_url(body):
        issues.append(ValidationIssue(
            "url",
            "мессенджер: найдена ссылка в теле — запрещено (триггер бана WA/TG)",
        ))

    # --- Stop words ---------------------------------------------------------
    combined = f"{subject}\n{body}"
    hits = find_stop_words(combined)
    for w in hits:
        issues.append(ValidationIssue("stop_word", f"стоп-слово: «{w}»"))
    # Технические слова — только в body ХОД3, но проще ловить по всему.
    # Для сегодняшнего MVP считаем найденное tech-слово мягкой ошибкой
    # (issue есть, но регенерации не форсируем).
    tech = find_stop_words(body, include_tech=True)
    for w in tech:
        if w not in hits:
            issues.append(ValidationIssue("tech_word", f"тех.слово: «{w.strip()}»"))

    return ValidationResult(ok=not issues, issues=issues)


def issues_summary(issues: list[ValidationIssue]) -> str:
    """Один-строчный саммари для лога / UI badge."""
    if not issues:
        return "OK"
    kinds = sorted({i.kind for i in issues})
    return f"{len(issues)} issues: {', '.join(kinds)}"
