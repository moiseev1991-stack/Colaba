"""Детерминированные фразы тренда и бенчмарка для промпта КП.

Эпик D §3 ТЗ 2026-06-12: «Формулировки генерить детерминированно в
Python (не LLM)». Логика проста и unit-тестируема:

- trend_phrase: rising → «жалобы на это выросли за последние N мес.»;
  falling → «жалобы на это снижаются»; stable/no_data → пустая строка
  (промпт-сборщик пропустит строку).

- benchmark_phrase: ratio > 1.5 → «упоминается в X раза чаще, чем в
  среднем по нише»; ratio < 0.66 → «эта проблема у них слабее средней»;
  иначе → пустая строка.

Все функции pure — без БД, без LLM. Возвращают `str` (пустая строка =
«фразы не будет в промпте»).
"""

from __future__ import annotations


def trend_phrase(verdict: str, period_months: int = 1) -> str:
    """Фраза о динамике негатива.

    `verdict` — из `/maps/companies/{id}/negative-trend`:
    'rising' | 'falling' | 'stable' | 'no_data'.

    `period_months` — окно сравнения. Эндпоинт сравнивает last_30d vs
    prev_30d, то есть 1 месяц. На будущее, если бэк начнёт сравнивать
    по более широким окнам, передаём явно.
    """
    if verdict == "rising":
        if period_months <= 1:
            return "жалобы на это выросли за последний месяц"
        return f"жалобы на это выросли за последние {period_months} мес."
    if verdict == "falling":
        return "жалобы на это снижаются — проблему уже частично закрыли"
    # stable / no_data / unknown → не говорим ничего, чтобы письмо не
    # делало вид что есть какая-то динамика.
    return ""


def benchmark_phrase(ratio: float | None) -> str:
    """Фраза о сравнении с нишей.

    `ratio` — из `/maps/companies/{id}/pain-benchmark` для конкретной
    pain: `company_mentions / max(0.25, niche_avg_per_company)`.
    На стороне эндпоинта `verdict`:
      - worse  (ratio >= 1.5)
      - better (ratio <  0.66)
      - on_par (остальное)
    Здесь воспроизводим ту же логику — но возвращаем словесную фразу
    для письма.

    Передавай `None` если бенчмарк не считался (нет данных по нише,
    мало компаний) — вернёт пустую строку.
    """
    if ratio is None:
        return ""
    # Защита от мусорных значений (negative ratio быть не должно, но
    # пусть будет gracefully).
    if ratio <= 0:
        return ""

    if ratio >= 1.5:
        # «в 1.5 раза» звучит коряво — округляем до 1 знака. Если
        # совсем близко к целому — берём целое («в 2 раза», не «в 2.0»).
        #
        # ВАЖНО: проверку «близко к целому» делаем на ИСХОДНОМ ratio,
        # а не на round(ratio, 1), потому что 1.95 в double = 1.949999…
        # и round(1.95, 1) = 1.9, а не 2.0 (банкирское округление +
        # float-погрешность). Поэтому брать close-to-integer от уже
        # округлённого значения — баг: 1.95 уходило бы в строку «1.9»
        # вместо «2».
        nearest_int = round(ratio)
        if abs(ratio - nearest_int) < 0.1:
            rounded_str = str(int(nearest_int))
        else:
            rounded = round(ratio, 1)
            rounded_str = f"{rounded:.1f}".rstrip("0").rstrip(".")
        return (
            f"эта проблема у них упоминается в {rounded_str} раза чаще, "
            "чем в среднем по нише"
        )
    if ratio < 0.66:
        return (
            "эта проблема у них упоминается реже, чем в среднем по нише — "
            "они держат планку"
        )
    # on_par — не пишем ничего, потому что «у них всё как у всех» не
    # убеждающий аргумент.
    return ""


def website_status_phrase(website: str | None) -> str:
    """Короткая фраза про сайт компании.

    Используется в KP_FACT_WEBSITE_LINE. Возвращает 'нет сайта' или
    'есть сайт {url}'.
    """
    raw = (website or "").strip()
    if not raw:
        return "нет сайта"
    return f"есть сайт {raw}"
