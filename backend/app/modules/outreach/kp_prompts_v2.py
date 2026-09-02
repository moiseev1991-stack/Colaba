"""Промпт-каркас «4 хода» для КП (ТЗ 2026-07-11).

Новый промпт-шаблон, работающий рядом со старым (kp_prompts.py). Юзер
переключает feature-flag`ом в kp_service.build_kp_prompt (см. параметр
`use_4hods`). Старый промпт остаётся до полного A/B и сравнения глазами.

Каркас:
  ХОД1: доказательство «я смотрел вас» (боль + счётчик + цитата)
  ХОД2: перевод боли в деньги (consequence из pain_dictionaries)
  ХОД3: решение результатом, не технологией (solution из pain_dictionaries)
  ХОД4: микрошаг + один вопрос (my_offer_step из шаблона)

LLM получает СТРУКТУРУ с данными, а не «напиши письмо». Задача LLM —
склеить и очеловечить, НЕ придумать содержание ходов.
"""

from __future__ import annotations

from .pain_dictionaries import PainFilled

# Плейсхолдер, когда PUBLIC_BOT_USERNAME не задан в .env — код не падает,
# в текст попадает явная заглушка (см. build_prompt_4hods).
_BOT_PLACEHOLDER = "[бот_не_задан]"


# ---------------------------------------------------------------------------
# Инструкции LLM (system-level, независят от компании)
# ---------------------------------------------------------------------------

# Telegram: 4-6 строк, без ссылок, один вопрос в конце, контакт для ответа = @бот.
KP_4HODS_MESSENGER_HEADER = (
    "Ты пишешь короткое холодное сообщение в Telegram на русском языке "
    "от лица: {sender_profile}.\n"
    "\n"
    "СТРОГИЙ ФОРМАТ: ровно 4 хода, 4–6 строк суммарно. Ниже данные для каждого хода —\n"
    "склей их в живое сообщение, СОДЕРЖАНИЕ ходов не меняй, ничего не выдумывай.\n"
)

# Email: те же ходы, но допустимо 6–9 строк + тема письма + подпись.
KP_4HODS_EMAIL_HEADER = (
    "Ты пишешь короткое холодное email на русском языке от лица: {sender_profile}.\n"
    "\n"
    "СТРОГИЙ ФОРМАТ: ровно 4 хода, 6–9 строк в теле. Ниже данные для каждого хода —\n"
    "склей их в живое письмо, СОДЕРЖАНИЕ ходов не меняй, ничего не выдумывай.\n"
    "Плюс тема письма — сжатый ход 1 (до 8 слов).\n"
)


KP_4HODS_RECIPIENT = (
    "\n"
    "Получатель: {company_name} — {niche}, {city}.\n"
    "{addressing_line}"
    "\n"
    "ДАННЫЕ ДЛЯ ХОДОВ (используй ТОЛЬКО их):\n"
)


# Форматтеры отдельных ходов ------------------------------------------------


def _fmt_hod1(pains: list[PainFilled]) -> str:
    """ХОД 1 — «я смотрел именно вас». Боль(и) + счётчик + короткая цитата.

    Если болей несколько — упоминаем все, склеиваем через «плюс».
    Если у боли нет цитаты — просто «N человек пишут про X».
    """
    if not pains:
        return "ХОД1: у компании нет проанализированных болей — просто скажи, что смотрел их отзывы и хочешь предложить точечно."
    parts: list[str] = []
    for p in pains:
        chunk = f"«{p.label}» ({p.mention_count} упоминаний)"
        if p.source:
            src = {
                "2gis": "2ГИС",
                "yandex_maps": "Я.Карты",
                "google": "Google",
            }.get(p.source, p.source)
            chunk = f"на {src}: {chunk}"
        if p.top_quote:
            safe = p.top_quote.strip().replace("\n", " ")[:180]
            chunk += f' — цитата клиента: «{safe}»'
        parts.append(chunk)
    joined = "; плюс ".join(parts)
    return f"ХОД1: смотрел отзывы — {joined}."


def _fmt_hod2(pains: list[PainFilled]) -> str | None:
    """ХОД 2 — что эта боль стоит в деньгах/клиентах.

    Берём consequence из справочника для первой боли с известным key.
    Если у всех pain_key = None — ХОД2 пропускается (LLM инструктируется
    не выдумывать)."""
    for p in pains:
        if p.consequence:
            return f'ХОД2: последствие боли для их бизнеса — «{p.consequence}». Без выдуманных цифр.'
    return None


def _fmt_hod3(pains: list[PainFilled]) -> str | None:
    """ХОД 3 — решение результатом (не технологией).

    Берём solution первой боли с известным key."""
    for p in pains:
        if p.solution:
            return (
                f'ХОД3: что предлагаешь как результат для клиента — '
                f'«{p.solution}». ЗАПРЕЩЕНО в этом ходе использовать слова: '
                f'«бот», «CRM», «интеграция», «автоматизация», «внедрение», '
                f'«IP-телефония» — только эффект для клиента.'
            )
    return None


def _fmt_hod4(my_offer_step: str) -> str:
    """ХОД 4 — микрошаг + ОДИН вопрос в конце.

    my_offer_step: короткое «что сделаешь бесплатно / за минуту»
    (созвон, показ на их примере, мини-аудит)."""
    step = my_offer_step or "короткий созвон 10 минут"
    return (
        f'ХОД4: микрошаг — «{step}». '
        'Заверши ОДНИМ вопросом («Удобно завтра / в такой-то день?» или '
        '«Скинуть пример на вашей нише?»). Больше вопросов в тексте нет.'
    )


# Общие правила для tail'а --------------------------------------------------

KP_4HODS_TAIL_MESSENGER = (
    "\n"
    "ПРАВИЛА:\n"
    "1. 4–6 строк суммарно. Без темы. Без ссылок (ни одной https:// или t.me/).\n"
    "2. Один вопрос в конце. Больше нигде вопросов не задаём.\n"
    "3. Не начинай с «Здравствуйте, мы компания X». Представление коротко в подписи.\n"
    "4. Не выдумывай точных цифр («потеряете 47500 ₽»). Абстрактные оценки ок.\n"
    "5. ЗАПРЕЩЕНО: «уникальное», «инновационное», «предлагаем сотрудничество»,\n"
    "   «взаимовыгодное», «динамично развивающаяся», «мы — компания»,\n"
    "   «10-летний опыт», «спешим предложить».\n"
    "6. Контакт для ответа — вставь ЕСТЕСТВЕННО (рядом с вопросом или в подписи):\n"
    "   ответить можно в Telegram — {bot_handle}. Пиши ровно {bot_handle} как @-упоминание,\n"
    "   НЕ оформляй как ссылку (без https://, без t.me/).\n"
    "7. Тон: {tone}. Живой человек написал лично, не маркетинг.\n"
    "\n"
    "Верни строго JSON: {{\"subject\": \"\", \"body\": \"...\"}} — subject для\n"
    "Telegram пусто, body — сообщение.\n"
)

KP_4HODS_TAIL_EMAIL = (
    "\n"
    "ПРАВИЛА:\n"
    "1. Тема письма: до 8 слов, сжатый ход 1 (например: «12 жалоб на дозвон в отзывах {company_name}»).\n"
    "2. Тело: 6–9 строк, абзацы по 1–3 предложения.\n"
    "3. Один вопрос в конце. Больше нигде вопросов нет.\n"
    "4. В самом тексте письма (вне подписи) ссылок быть не должно — все ссылки только в подписи.\n"
    "5. Не выдумывай точных цифр («потеряете 47500 ₽»).\n"
    "6. ЗАПРЕЩЕНО: «уникальное», «инновационное», «предлагаем сотрудничество»,\n"
    "   «взаимовыгодное», «динамично развивающаяся», «мы — компания»,\n"
    "   «10-летний опыт», «спешим предложить».\n"
    "7. ПОДПИСЬ (обязательна, отдели пустой строкой в конце body). В подписи —\n"
    "   имя отправителя и контакты ровно в таком виде (это исключение из правила про ссылки):\n"
    "   Telegram: {tg_deeplink}\n"
    "   e-mail: {contact_email}\n"
    "   сайт: {landing_url}\n"
    "8. Тон: {tone}. Уважительно, на «вы», без канцелярита.\n"
    "\n"
    "Верни строго JSON: {{\"subject\": \"...\", \"body\": \"...\"}}\n"
)


TONE_HINTS = {
    "neutral": "нейтральный, по-деловому",
    "bold": "уверенный, прямой, но без давления",
}


def _with_utm(url: str, source: str) -> str:
    """Добавляет utm_source к URL, не дублируя, если уже есть query."""
    url = (url or "").strip()
    if not url:
        return ""
    sep = "&" if "?" in url else "?"
    return f"{url}{sep}utm_source={source}"


# ---------------------------------------------------------------------------
# Главный сборщик
# ---------------------------------------------------------------------------


def build_prompt_4hods(
    *,
    channel: str,  # 'messenger' | 'email'
    sender_profile: str,
    company_name: str,
    niche: str,
    city: str,
    pains: list[PainFilled],
    my_offer_step: str,
    tone: str,
    recipient_first_name: str | None = None,
    bot_username: str | None = None,
    contact_email: str = "",
    landing_url: str = "",
) -> str:
    """Собирает промпт «4 хода». Данные подставляются как заполненный
    каркас, LLM их не меняет.

    Контакты рассылки (персона «Дмитрий», без SpinLid/Colaba):
      - messenger: контакт для ответа = @<bot_username> (без ссылки);
      - email: подпись с t.me/<bot>?start=email, contact_email, landing_url.
    Если bot_username пуст — в текст идёт явный плейсхолдер, код не падает.
    """
    channel = (channel or "messenger").strip().lower()
    if channel not in ("messenger", "email"):
        channel = "messenger"

    bot = (bot_username or "").lstrip("@").strip()
    bot_handle = f"@{bot}" if bot else _BOT_PLACEHOLDER
    tg_deeplink = f"https://t.me/{bot}?start=email" if bot else _BOT_PLACEHOLDER
    landing_link = _with_utm(landing_url or "", "email") or "[сайт_не_задан]"
    contact_email = (contact_email or "").strip() or "[email_не_задан]"
    header_tpl = (
        KP_4HODS_MESSENGER_HEADER if channel == "messenger" else KP_4HODS_EMAIL_HEADER
    )
    tail_tpl = (
        KP_4HODS_TAIL_MESSENGER if channel == "messenger" else KP_4HODS_TAIL_EMAIL
    )

    if recipient_first_name:
        addressing_line = (
            f"Обращение: по имени «{recipient_first_name}».\n"
        )
    else:
        addressing_line = (
            "Обращение: нейтральное «Здравствуйте!» (ЛПР не найден).\n"
        )

    parts: list[str] = [
        header_tpl.format(sender_profile=sender_profile or "—"),
        KP_4HODS_RECIPIENT.format(
            company_name=company_name or "—",
            niche=niche or "—",
            city=city or "—",
            addressing_line=addressing_line,
        ),
    ]
    parts.append(_fmt_hod1(pains))
    h2 = _fmt_hod2(pains)
    if h2:
        parts.append(h2)
    else:
        parts.append(
            "ХОД2: последствие боли не задано в справочнике — пропусти этот ход, "
            "перейди сразу к ходу 3."
        )
    h3 = _fmt_hod3(pains)
    if h3:
        parts.append(h3)
    else:
        parts.append(
            "ХОД3: решение под эту боль не задано в справочнике — напиши "
            "нейтрально «есть решение, которое помогает похожим {niche} закрывать "
            "эту боль» БЕЗ технологий.".format(niche=niche or "компаниям")
        )
    parts.append(_fmt_hod4(my_offer_step))
    if channel == "messenger":
        tail = tail_tpl.format(
            tone=TONE_HINTS.get(tone, tone or "нейтральный"),
            company_name=company_name or "—",
            bot_handle=bot_handle,
        )
    else:
        tail = tail_tpl.format(
            tone=TONE_HINTS.get(tone, tone or "нейтральный"),
            company_name=company_name or "—",
            tg_deeplink=tg_deeplink,
            contact_email=contact_email,
            landing_url=landing_link,
        )
    parts.append(tail)
    return "\n".join(parts)
