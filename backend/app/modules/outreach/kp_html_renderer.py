"""HTML-обёртка для КП-писем (миграция 039, 2026-06-21).

До этой миграции tasks.py слал только plain-text body (markdown как-есть).
В новом потоке `tasks.py._send_one` берёт EmailConfig, рендерит markdown
тело в HTML и оборачивает в шаблон:

  ┌─────────────────────────┐
  │  [logo]                 │   ← если sender_logo_url задан
  │  ─────────────          │   ← brand-полоса
  ├─────────────────────────┤
  │  <body markdown→HTML>   │
  ├─────────────────────────┤
  │  <signature markdown    │   ← если sender_signature_html задан
  │   → HTML>               │
  └─────────────────────────┘

HTML — простой table-based layout, inline-стили, без классов/JS/external CSS:
Gmail/Mail.ru/Outlook не понимают современный CSS и режут <style>. Размер
готового письма у Димы ~5-8KB.

Если logo не задан — шапка скрыта. Подпись (подвал с контактами) показываем
всегда: если своя не задана, подставляем DEFAULT_SENDER_SIGNATURE_MD, чтобы
письмо не уходило без обратной связи отправителя.

Plain-text fallback (поле `body` в EmailService) остаётся как был — для
старых клиентов и для readability в "Show original" Gmail.
"""

from __future__ import annotations

import html
import logging
import re

import markdown as md_lib

logger = logging.getLogger(__name__)


# Дефолтный hex для brand-полосы, если EmailConfig.sender_brand_color пуст.
# Совпадает с brand-600 нашего фронта (--signal-cool в Pipedrive-палитре).
_DEFAULT_BRAND_COLOR = "#3B82F6"

# Максимальные ширины «бумаги»: 600px — стандарт email-newsletter'ов,
# хорошо тащит и на десктопе (плавающий контейнер по центру) и на мобиле
# (растягивается до ширины экрана).
_CONTAINER_MAX_WIDTH_PX = 600

# Markdown extensions:
#   - nl2br: одиночный перенос строки → <br/>. Без него «\n» в теле КП
#     схлопывается в один абзац и письмо превращается в простыню.
#   - sane_lists: понимает «- » и «1. » без хака с двумя \n.
#   - tables: иногда LLM генерит таблицу-сравнение, пусть рендерится.
_MD_EXTENSIONS = ["nl2br", "sane_lists", "tables"]


# Дефолтная подпись-контакты отправителя. Используется, когда в EmailConfig
# не задана своя sender_signature_html — чтобы в КАЖДОМ КП-письме были
# контакты отправителя, а не безымянная простыня без обратной связи.
# Пока зашита под SpinLid; когда у пользователя появится свой профиль
# отправителя (см. /app/email/settings) — он перекроет этот дефолт.
# Markdown: nl2br включён, поэтому одиночный \n превращается в перенос.
DEFAULT_SENDER_SIGNATURE_MD = (
    "**SpinLid** — привлечение клиентов и рассылка коммерческих предложений\n"
    "Сайт: spinlid.ru · Почта: support@spinlid.ru"
)

# Plain-text вариант той же подписи — для мессенджеров (WhatsApp/Telegram),
# где HTML не нужен. Держим рядом, чтобы контакты не разъезжались.
DEFAULT_SENDER_SIGNATURE_TEXT = "—\nSpinLid · spinlid.ru · support@spinlid.ru"


_HEX_RE = re.compile(r"^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$")


def _safe_brand_color(raw: str | None) -> str:
    """Валидация hex; если кривой — возвращаем дефолтный.

    Цвет идёт прямо в style="border-color: ..." — без валидации можно
    словить XSS через `;background-url(...)`.
    """
    if not raw:
        return _DEFAULT_BRAND_COLOR
    s = raw.strip()
    if _HEX_RE.match(s):
        return s
    return _DEFAULT_BRAND_COLOR


def _md_to_html(text: str | None) -> str:
    """Markdown → HTML. Пустой ввод → пустая строка."""
    if not text:
        return ""
    try:
        return md_lib.markdown(text, extensions=_MD_EXTENSIONS, output_format="html")
    except Exception as e:  # noqa: BLE001
        # markdown почти никогда не падает, но если расширения сломаны —
        # отдадим экранированный plain-text, лишь бы письмо ушло.
        logger.warning("kp_html_renderer: markdown failed (%s), falling back to <pre>", e)
        return f"<pre style=\"white-space:pre-wrap;font-family:inherit\">{html.escape(text)}</pre>"


def _logo_block(logo_url: str | None, brand_color: str) -> str:
    """Шапка письма: логотип + brand-полоса. Пусто, если URL не задан."""
    if not logo_url:
        return ""
    safe_url = html.escape(logo_url.strip(), quote=True)
    return (
        f'<tr><td style="padding:24px 28px 12px 28px;">'
        f'<img src="{safe_url}" alt="" '
        f'style="max-height:44px;max-width:200px;display:block;border:0;outline:none;text-decoration:none;" />'
        f"</td></tr>"
        f'<tr><td style="padding:0 28px;">'
        f'<div style="height:3px;background:{brand_color};border-radius:2px;"></div>'
        f"</td></tr>"
    )


def _signature_block(signature_html: str | None) -> str:
    """Подвал с подписью. Юзер мог записать markdown — рендерим, иначе пусто."""
    if not signature_html or not signature_html.strip():
        return ""
    rendered = _md_to_html(signature_html)
    if not rendered.strip():
        return ""
    return (
        '<tr><td style="padding:18px 28px 6px 28px;border-top:1px solid #e5e7eb;">'
        '<div style="font-size:13px;line-height:1.5;color:#374151;">'
        f"{rendered}"
        "</div></td></tr>"
    )


def render_kp_html(
    *,
    body_md: str,
    logo_url: str | None = None,
    signature_html: str | None = None,
    brand_color: str | None = None,
) -> str:
    """Полный HTML письма. body_md — markdown тело КП из kp_drafts.body.

    Никаких {{плейсхолдеров}} тут не разрешаем — подстановка имени компании
    и т.п. делается на этапе генерации КП (LLM), а не на этапе render-to-html.
    """
    safe_brand = _safe_brand_color(brand_color)
    body_html = _md_to_html(body_md)

    header = _logo_block(logo_url, safe_brand)
    # Контакты отправителя обязательны: если своя подпись не задана —
    # подставляем дефолтную (SpinLid), чтобы письмо не уходило безымянным.
    footer = _signature_block(signature_html or DEFAULT_SENDER_SIGNATURE_MD)

    # table-based layout — на старых Outlook'ах единственный надёжный способ
    # центрирования. Background для письма #f4f5f7 — мягкий серый, контейнер
    # белый, чтобы шапка с лого читалась.
    return (
        '<!doctype html><html><head><meta charset="utf-8"/>'
        '<meta name="viewport" content="width=device-width,initial-scale=1"/>'
        "<title>Предложение</title></head>"
        '<body style="margin:0;padding:0;background:#f4f5f7;'
        'font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;'
        'color:#1f2937;line-height:1.55;">'
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" '
        'border="0" style="background:#f4f5f7;padding:24px 12px;">'
        '<tr><td align="center">'
        f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" '
        f'border="0" style="max-width:{_CONTAINER_MAX_WIDTH_PX}px;background:#ffffff;'
        f'border-radius:12px;box-shadow:0 1px 2px rgba(0,0,0,0.04);">'
        f"{header}"
        '<tr><td style="padding:20px 28px;font-size:15px;color:#1f2937;">'
        f"{body_html}"
        "</td></tr>"
        f"{footer}"
        "</table></td></tr></table></body></html>"
    )
