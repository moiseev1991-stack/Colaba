"""Транзакционные письма авторизации: сброс пароля, подтверждение email.

Отдельно от outreach-рассылок: простой aiosmtplib через SMTP_* настройки,
без провайдеров/кампаний. Письма — текст+HTML, без трекинга.
"""

import logging
from email.message import EmailMessage

import aiosmtplib

from app.core.config import settings

logger = logging.getLogger(__name__)


async def send_transactional_email(to_email: str, subject: str, html: str) -> bool:
    """Отправить письмо через настроенный SMTP. False — не смогли (не роняем флоу)."""
    if not settings.SMTP_HOST or not settings.SMTP_USER:
        logger.warning("Transactional email skipped: SMTP not configured (to=%s)", to_email)
        return False

    msg = EmailMessage()
    # SMTP_FROM — адрес отправителя, когда SMTP-логин технический
    # (Яндекс Postbox: логин postbox_*_Bd, адрес hello@spinlid.ru).
    msg["From"] = getattr(settings, "SMTP_FROM", "") or settings.SMTP_USER
    msg["To"] = to_email
    msg["Subject"] = subject
    msg.set_content("Откройте письмо в HTML-совместимом клиенте.")
    msg.add_alternative(html, subtype="html")

    try:
        # aiosmtplib 5.x: всё в конструкторе; 465 — SSL, 587/2525 — STARTTLS
        smtp = aiosmtplib.SMTP(
            hostname=settings.SMTP_HOST,
            port=settings.SMTP_PORT,
            username=settings.SMTP_USER,
            password=settings.SMTP_PASSWORD,
            use_tls=settings.SMTP_PORT == 465,
            start_tls=None if settings.SMTP_PORT == 465 else True,
            timeout=20,
        )
        await smtp.connect()
        try:
            await smtp.send_message(msg)
        finally:
            await smtp.quit()
        return True
    except Exception:
        logger.exception("Transactional email failed (to=%s)", to_email)
        return False


def _wrap(title: str, body_html: str) -> str:
    return f"""<!doctype html><html><body style="margin:0;background:#f5f5f7;font-family:Manrope,system-ui,sans-serif">
<div style="max-width:520px;margin:32px auto;background:#fff;border-radius:14px;padding:32px">
<div style="font-weight:800;font-size:20px;color:#111;margin-bottom:20px">SpinLid</div>
<h1 style="font-size:18px;color:#111;margin:0 0 12px">{title}</h1>
{body_html}
<p style="font-size:12px;color:#86868b;margin-top:28px">Это автоматическое письмо сервиса SpinLid.
Если вы не запрашивали действие — просто проигнорируйте его.</p>
</div></body></html>"""


def reset_password_html(link: str) -> str:
    return _wrap(
        "Сброс пароля",
        f"""<p style="font-size:14px;color:#333;margin:0 0 20px">Вы запросили сброс пароля.
Перейдите по ссылке и задайте новый пароль — ссылка действует 1 час.</p>
<a href="{link}" style="display:inline-block;background:#10b981;color:#fff;text-decoration:none;
font-weight:700;font-size:14px;padding:12px 24px;border-radius:8px">Задать новый пароль</a>
<p style="font-size:13px;color:#86868b;margin-top:20px">Или скопируйте ссылку: {link}</p>""",
    )


def verify_email_html(link: str) -> str:
    return _wrap(
        "Подтверждение email",
        f"""<p style="font-size:14px;color:#333;margin:0 0 20px">Подтвердите адрес электронной почты
для вашего аккаунта SpinLid — ссылка действует 24 часа.</p>
<a href="{link}" style="display:inline-block;background:#10b981;color:#fff;text-decoration:none;
font-weight:700;font-size:14px;padding:12px 24px;border-radius:8px">Подтвердить email</a>
<p style="font-size:13px;color:#86868b;margin-top:20px">Или скопируйте ссылку: {link}</p>""",
    )
