"""Pydantic-схемы для KP-конвейера (Эпик A ТЗ 2026-06-12)."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class KpTemplateOut(BaseModel):
    """Системный или организационный шаблон КП — для селекта в модалке."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    key: str
    title: str
    sender_profile: str
    offer_hint: str
    is_system: bool


class KpGenerateRequest(BaseModel):
    """Тело POST /outreach/kp/generate.

    Эпик F (2026-06-12): принимается ЛИБО company_id (КП по компании из maps),
    ЛИБО site_lead_id (КП по найденному сайту). Ровно одно из двух.
    """

    company_id: int | None = None
    site_lead_id: int | None = None
    template_key: str = Field(..., min_length=1, max_length=40)
    tone: Literal["neutral", "bold"] = "neutral"
    # custom-шаблон: юзер вводит профиль отправителя сам, фронт
    # подкладывает 1-2 предложения в это поле. Для системных шаблонов
    # игнорируется (берётся sender_profile из БД).
    custom_sender_profile: str | None = Field(default=None, max_length=600)
    # 2026-07-11: выбор конкретных болей, о которых должно писать КП. Если
    # None или пусто — используется топ-1 боль (как раньше). Если 1-3 id —
    # используются эти боли, LLM получает промпт с их цитатами и генерит
    # письмо, затрагивающее каждую. Игнорируется для site_lead_id.
    pain_tag_ids: list[int] | None = Field(default=None, max_length=3)
    # 2026-07-11 «4 хода»: если True — новый промпт-каркас (боль→последствие
    # →решение→микрошаг) вместо свободного tail'а. По умолчанию False для
    # обратной совместимости, включается юзером в модалке КП.
    use_4hods: bool = False
    # 2026-07-11: канал — влияет только при use_4hods=True. messenger =
    # 4-6 строк без ссылок, email = 6-9 строк со ссылкой в подписи.
    channel: Literal["messenger", "email"] = "email"
    # 2026-07-11: короткое описание микрошага (ХОД4). «созвон 10 минут»,
    # «мини-аудит запись+дозвон», «показ на вашем примере». Игнорируется
    # при use_4hods=False.
    my_offer_step: str | None = Field(default=None, max_length=200)

    @model_validator(mode="after")
    def _check_xor_target(self):
        has_company = self.company_id is not None
        has_site = self.site_lead_id is not None
        if has_company == has_site:
            # Оба или ни одного — оба варианта нарушают XOR.
            raise ValueError(
                "Нужно передать ровно одно: company_id или site_lead_id."
            )
        return self


class SiteLeadCreate(BaseModel):
    """Тело POST /outreach/site-leads — сохранить результат web-поиска
    как лид для будущей генерации КП. Эпик F."""

    query: str = Field(..., min_length=1, max_length=500)
    entry: str = Field(default="", max_length=500)
    url: str = Field(..., min_length=1, max_length=2000)
    title: str | None = Field(default=None, max_length=500)
    snippet: str | None = None
    # Опционально: ссылка на исходный web-search из существующего модуля
    # searches, если site-lead создаётся из результата поиска.
    search_id: int | None = None


class SiteLeadOut(BaseModel):
    """Ответ GET/POST /outreach/site-leads."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    search_id: int | None = None
    query: str
    entry: str
    url: str
    domain: str
    title: str | None = None
    snippet: str | None = None
    created_at: datetime


class KpPainArg(BaseModel):
    """Одна боль в контексте КП — id тега, лейбл, цитата, кол-во упоминаний,
    источник. Используется в KpArgumentsUsed.pains для multi-pain-КП
    (2026-07-11). Первая всегда дублируется в плоские pain_label/quote/…
    для обратной совместимости старого UI."""

    pain_tag_id: int | None = None
    label: str
    top_quote: str | None = None
    mention_count: int | None = None
    source: str | None = None


class KpArgumentsUsed(BaseModel):
    """Снимок входных данных для промпта — отдаётся обратно во фронт +
    хранится в kp_drafts.arguments_used JSONB. Сделан плоским, без
    nested-объектов, чтобы UI-блок «Аргументы» рендерился без условий.
    """

    pain_label: str | None = None
    quote: str | None = None
    mention_count: int | None = None
    # 2026-07-11: полный список болей, на которых построено письмо.
    # None если КП сгенерировано «в общем» (без болей). Плоские
    # pain_label/quote/mention_count дублируют первую боль из списка.
    pains: list[KpPainArg] | None = None
    trend: str | None = None  # rising/stable/falling/no_data
    trend_phrase: str | None = None  # человеческая фраза или ""
    benchmark_ratio: float | None = None
    benchmark_phrase: str | None = None
    source: str | None = None  # 2gis/yandex_maps/google — источник pain'а
    # Эпик F: поля для КП по сайту (заполнены, если КП сгенерирован
    # по SiteLead, а не по Company). UI-блок «Аргументы» рендерит их
    # вместо company-полей, если site_url задан.
    site_url: str | None = None
    site_domain: str | None = None
    entry: str | None = None
    entry_meaning: str | None = None
    sender_profile: str
    offer_hint: str
    tone: str
    template_key: str


class KpDraftOut(BaseModel):
    """Ответ POST /outreach/kp/generate."""

    id: int
    # Эпик F: либо company_id, либо site_lead_id заполнено (XOR).
    company_id: int | None = None
    site_lead_id: int | None = None
    template_key: str
    subject: str
    body: str
    arguments_used: KpArgumentsUsed
    # Эпик E ещё не реализован, всегда None. Фронт показывает счётчик
    # только когда != None — на старте просто скрыт.
    remaining_free: int | None = None
    created_at: datetime


class KpBulkGenerateRequest(BaseModel):
    """Тело POST /outreach/kp/bulk-generate. Только по company_ids — bulk
    по найденным сайтам сейчас не нужен (вкладка «Сайты» уже работает
    одиночными генерациями)."""

    company_ids: list[int] = Field(..., min_length=1, max_length=500)
    template_key: str = Field(..., min_length=1, max_length=40)
    tone: Literal["neutral", "bold"] = "neutral"
    custom_sender_profile: str | None = Field(default=None, max_length=600)
    # 2026-07-12: если задан — КП на КАЖДУЮ выбранную компанию генерится
    # по этим 1-3 болям (унифицированный оффер под общую боль партии).
    # Если None — каждой компании берётся её топ-1 автоматически.
    pain_tag_ids: list[int] | None = Field(default=None, max_length=3)
    # 2026-07-12: те же поля что у одиночного generate — применяются ко
    # ВСЕЙ партии единообразно.
    use_4hods: bool = False
    channel: Literal["messenger", "email"] = "email"
    my_offer_step: str | None = Field(default=None, max_length=200)


class KpCommonPainOut(BaseModel):
    """Одна общая боль партии — встречается у ≥1 из выбранных компаний.
    Возвращается endpoint'ом /outreach/kp/common-pains для выбора юзером."""

    pain_tag_id: int
    label: str
    # сколько из company_ids запроса имеют эту боль (mention_count >= 1)
    companies_hit: int
    total_mentions: int
    example_quote: str | None = None


class KpBulkDraftPreview(BaseModel):
    """Лёгкое превью КП для live-списка в модалке прогресса."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    company_id: int | None = None
    subject: str
    created_at: datetime


class KpDraftListItem(BaseModel):
    """Лёгкая строка для вкладки «КП» в History — без полного body, с
    распакованным именем компании.
    """

    id: int
    company_id: int | None = None
    site_lead_id: int | None = None
    company_name: str | None = None
    company_city: str | None = None
    template_key: str
    subject: str
    body_preview: str
    created_at: datetime


class KpDraftListResponse(BaseModel):
    items: list[KpDraftListItem]
    total: int
    limit: int
    offset: int


class KpDraftUpdateRequest(BaseModel):
    """Тело PATCH /outreach/kp/drafts/{id} — юзер правит сгенерированный
    AI-черновик прямо в модалке.

    Оба поля опциональны: если пришло только subject — body не трогаем
    (и наоборот). Хотя бы одно должно быть непустым; пустые строки
    отвергаются на уровне роутера, чтобы случайный ctrl+A+del не стёр
    письмо.
    """

    subject: str | None = Field(default=None, max_length=500)
    body: str | None = Field(default=None, min_length=1)


class KpBulkJobOut(BaseModel):
    """Ответ POST /outreach/kp/bulk-generate, GET /outreach/kp/jobs/{id},
    POST /outreach/kp/jobs/{id}/cancel.
    """

    model_config = ConfigDict(from_attributes=True)

    id: int
    status: Literal["queued", "running", "done", "cancelled", "failed"]
    template_key: str
    tone: str
    total: int
    generated: int
    failed: int
    last_company_id: int | None = None
    cancel_requested: bool
    error_message: str | None = None
    created_at: datetime
    started_at: datetime | None = None
    finished_at: datetime | None = None
    recent_drafts: list[KpBulkDraftPreview] = []


class KpJobItem(BaseModel):
    """Строка таблицы на странице партии КП: компания + статус + (если
    готов) сам draft. Status вычисляется на бэке по позиции company_id
    в job.company_ids относительно job.last_company_id и факту наличия
    KpDraft на эту компанию в окне created_at >= job.started_at.

    Заполнение draft-полей:
      - status='done'  → draft_id/template_key/subject/body/draft_created_at заполнены.
      - status='failed' с уцелевшим draft → тоже заполнены (редкий случай).
      - status='queued'/'running'/'failed' без draft → draft-поля null.
    """

    company_id: int | None = None
    company_name: str | None = None
    company_city: str | None = None
    company_legal_short: str | None = None
    status: Literal["queued", "running", "done", "failed"]
    draft_id: int | None = None
    template_key: str | None = None
    subject: str | None = None
    body: str | None = None
    draft_created_at: datetime | None = None
    # Адресат для основной (email) рассылки. None — у компании нет валидного
    # email-а в companies.emails. Фронт показывает «Кому: …» и блокирует
    # отправку для компаний без recipient. См. kp_send_service._pick_recipient
    # — логика выбора первого валидного email тут и там должна совпадать.
    recipient_email: str | None = None
    # URL логотипа компании (из 2GIS raw_data). Для аватарки в таблице
    # партии и в шапке drawer'а. None → фронт рисует инициалы из company_name.
    company_logo_url: str | None = None
    # Основной телефон компании (companies.phone, как пришёл из источника).
    # Фронт нормализует и подставляет в wa.me/{phone}-линк когда email
    # отсутствует — даёт юзеру ручной канал для «нет контакта»-строк.
    company_phone: str | None = None
    # Статус последней email-отправки этого draft'а — для подсветки
    # RowSendButton после reload, чтобы юзер не нажал send повторно.
    # null → ещё не пытались отправить.
    email_send_status: Literal[
        "queued", "sending", "sent", "failed", "skipped"
    ] | None = None
    # ИНН компании (company_legal.inn) — для раскрывающегося списка
    # «Кто получит КП» в SendBar, чтобы юзер опознавал компанию по
    # реквизитам и при желании снимал галочку.
    company_inn: str | None = None
    # Полное юр. название (company_legal.legal_name) — «Общество с
    # ограниченной ответственностью Ромашка». Для того же SendBar-списка.
    # Если null — фронт fallback'нется на company_name.
    company_legal_full: str | None = None
    # Адрес компании (companies.address) — для SendBar-списка.
    company_address: str | None = None


class KpJobItemsResponse(BaseModel):
    """Ответ GET /outreach/kp/jobs/{job_id}/items — страница партии:
    шапка job'а + полный список всех компаний (а не только готовых),
    чтобы юзер видел таблицу с прогрессом.
    """

    job: KpBulkJobOut
    items: list[KpJobItem]


class KpJobListItem(BaseModel):
    """Строка списка партий для вкладки «Партии КП» в History."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    status: Literal["queued", "running", "done", "cancelled", "failed"]
    template_key: str
    tone: str
    total: int
    generated: int
    failed: int
    created_at: datetime
    started_at: datetime | None = None
    finished_at: datetime | None = None


class KpJobListResponse(BaseModel):
    items: list[KpJobListItem]


# --- Отправка КП -----------------------------------------------------------
#
# Добавлено 2026-06-21 (миграция 038): рабочая отправка с bulk-страницы
# партии. Канал email — реально шлёт через EmailService (Hyvor/SMTP);
# каналы telegram/whatsapp/max принимаются, но создают строки KpSend
# со status='skipped' и error_code='channel_unavailable' до коннекторов.

SendChannel = Literal["email", "telegram", "whatsapp", "max"]
SendStatus = Literal["queued", "sending", "sent", "failed", "skipped"]


class KpJobSendRequest(BaseModel):
    """Тело POST /outreach/kp/jobs/{job_id}/send — отправить готовые КП
    партии по выбранным каналам.

    channels — мульти-выбор. Хотя бы один обязателен. Дубликаты схлопываются.

    draft_ids — опциональный фильтр: если задан, отправляем только эти
    конкретные драфты из партии (one-click resend конкретной строки после
    правки темы/тела). null/пусто → шлём все готовые драфты партии (старое
    bulk-поведение для совместимости с SendBar внизу страницы).
    """

    channels: list[SendChannel] = Field(..., min_length=1, max_length=4)
    draft_ids: list[int] | None = Field(default=None, max_length=500)


class KpJobSendStatusOut(BaseModel):
    """Сводка по отправкам конкретной партии — то, что поллит SendBar
    после нажатия «Отправить».

    Cчётчики покрывают все KpSend для job_id юзера (включая 'skipped').
    is_active=true пока есть строки в queued/sending — UI оставляет
    спиннер; false — все отгружены или skipped, UI показывает «Готово».
    """

    job_id: int
    total: int
    queued: int
    sending: int
    sent: int
    failed: int
    skipped: int
    is_active: bool
    last_error: str | None = None


class KpSendListItem(BaseModel):
    """Строка для вкладки «Отправки» в /history — одна строка = одна
    попытка отправить один draft в один канал.
    """

    id: int
    job_id: int | None = None
    draft_id: int
    company_id: int | None = None
    company_name: str | None = None
    company_city: str | None = None
    subject: str | None = None
    template_key: str | None = None
    channel: SendChannel
    recipient: str | None = None
    status: SendStatus
    error_code: str | None = None
    error_message: str | None = None
    created_at: datetime
    sent_at: datetime | None = None


class KpSendListResponse(BaseModel):
    items: list[KpSendListItem]
    total: int
    limit: int
    offset: int
