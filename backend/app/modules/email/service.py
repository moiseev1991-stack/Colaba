"""
Email service: Hyvor Relay API or direct SMTP (from DB config or env).
"""

import hashlib
import hmac
import logging
from datetime import datetime
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import formataddr
from typing import Optional, Tuple

import aiosmtplib
import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.email import (
    EmailCampaign,
    EmailLog,
    EmailStatus,
)
from app.models.email_config import EmailConfig
from app.models.search import SearchResult

logger = logging.getLogger(__name__)


class EmailServiceError(Exception):
    """Email service error."""

    pass


class EmailService:
    """Send email via Hyvor Relay API or SMTP."""

    def __init__(self):
        self.api_url = settings.HYVOR_RELAY_API_URL
        self.api_key = settings.HYVOR_RELAY_API_KEY
        self.webhook_secret = settings.HYVOR_RELAY_WEBHOOK_SECRET
        self.enabled = settings.HYVOR_RELAY_ENABLED

    async def _get_config_row(self, db: AsyncSession) -> Optional[EmailConfig]:
        result = await db.execute(select(EmailConfig).where(EmailConfig.id == 1))
        return result.scalar_one_or_none()

    def _resolve_hyvor(
        self, row: Optional[EmailConfig]
    ) -> Tuple[str, str, bool]:
        """api_url, api_key, use_db."""
        if row and row.hyvor_api_url and row.hyvor_api_key:
            return row.hyvor_api_url.rstrip("/"), row.hyvor_api_key, True
        if self.enabled and self.api_key:
            return self.api_url.rstrip("/"), self.api_key, False
        if row and row.provider_type == "hyvor" and row.hyvor_api_key:
            return (row.hyvor_api_url or self.api_url).rstrip("/"), row.hyvor_api_key, True
        return self.api_url.rstrip("/"), self.api_key or "", False

    def _resolve_smtp(
        self, row: Optional[EmailConfig]
    ) -> Tuple[str, int, str, str, bool]:
        if row and row.smtp_host:
            return (
                row.smtp_host,
                int(row.smtp_port or 465),
                row.smtp_user or "",
                row.smtp_password or "",
                bool(row.smtp_use_ssl),
            )
        return (
            settings.SMTP_HOST,
            int(settings.SMTP_PORT),
            settings.SMTP_USER,
            settings.SMTP_PASSWORD,
            bool(settings.SMTP_USE_SSL),
        )

    def _resolve_outreach_provider(self, row: Optional[EmailConfig]) -> str:
        """Same selection rules as ``send_email`` (Hyvor vs SMTP)."""
        provider: Optional[str] = None
        if not provider and row:
            provider = row.provider_type or "smtp"
        if not provider:
            provider = "hyvor" if self.enabled and self.api_key else "smtp"
        return provider

    async def get_outreach_config_summary(self, db: AsyncSession) -> dict:
        """
        Resolved email settings for ``GET /outreach/config`` (no secrets).
        ``configured`` means outbound send is possible with current settings.
        """
        row = await self._get_config_row(db)
        provider = self._resolve_outreach_provider(row)

        if provider == "hyvor":
            api_url, api_key, _ = self._resolve_hyvor(row)
            return {
                "provider_type": "hyvor",
                "host": "",
                "port": 465,
                "user": "",
                "use_ssl": True,
                "configured": bool(api_key),
                "hyvor_api_url": (api_url or "").rstrip("/"),
            }

        host, port, user, _password, use_ssl = self._resolve_smtp(row)
        mail_from = (row.smtp_from_email if row else None) or user or ""
        configured = bool(host and mail_from)
        return {
            "provider_type": "smtp",
            "host": host or "",
            "port": int(port),
            "user": user or "",
            "use_ssl": use_ssl,
            "configured": configured,
            "hyvor_api_url": None,
        }

    def generate_reply_to_address(
        self,
        user_id: int,
        domain: str,
        reply_prefix: Optional[str] = None,
    ) -> str:
        prefix = reply_prefix or settings.REPLY_PREFIX
        return f"{prefix}{user_id}@{domain}"

    def _get_headers(self, api_key: str) -> dict:
        return {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }

    async def send_email(
        self,
        to_email: str,
        subject: str,
        body: str,
        from_email: Optional[str] = None,
        from_name: Optional[str] = None,
        reply_to: Optional[str] = None,
        html_body: Optional[str] = None,
        idempotency_key: Optional[str] = None,
        db: Optional[AsyncSession] = None,
        force_provider: Optional[str] = None,
    ) -> dict:
        """
        Send via Hyvor Relay or SMTP. If ``db`` is set, loads ``EmailConfig`` id=1.
        ``force_provider``: ``hyvor`` | ``smtp`` to override auto selection.
        """
        row: Optional[EmailConfig] = None
        if db is not None:
            row = await self._get_config_row(db)

        provider = force_provider
        if not provider and row:
            provider = row.provider_type or "smtp"
        if not provider:
            provider = "hyvor" if self.enabled and self.api_key else "smtp"

        if provider == "hyvor":
            return await self._send_via_hyvor(
                to_email=to_email,
                subject=subject,
                body=body,
                from_email=from_email,
                from_name=from_name,
                reply_to=reply_to,
                html_body=html_body,
                idempotency_key=idempotency_key,
                row=row,
            )

        return await self._send_via_smtp(
            to_email=to_email,
            subject=subject,
            body=body,
            from_email=from_email,
            from_name=from_name,
            reply_to=reply_to,
            html_body=html_body,
            row=row,
        )

    async def _send_via_hyvor(
        self,
        to_email: str,
        subject: str,
        body: str,
        from_email: Optional[str],
        from_name: Optional[str],
        reply_to: Optional[str],
        html_body: Optional[str],
        idempotency_key: Optional[str],
        row: Optional[EmailConfig],
    ) -> dict:
        api_url, api_key, _ = self._resolve_hyvor(row)
        if not api_key:
            raise EmailServiceError("Hyvor Relay API key is not configured")

        payload = {
            "to": to_email,
            "subject": subject,
            "body": html_body or body,
        }
        if from_email:
            payload["from"] = (
                from_email if not from_name else f"{from_name} <{from_email}>"
            )
        if reply_to:
            payload["reply_to"] = reply_to
        if html_body:
            payload["body_type"] = "html"

        headers = self._get_headers(api_key)
        if idempotency_key:
            headers["X-Idempotency-Key"] = idempotency_key

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    f"{api_url}/api/console/sends",
                    json=payload,
                    headers=headers,
                )
                if response.status_code == 200:
                    data = response.json()
                    return {
                        "success": True,
                        "message_id": data.get("id"),
                        "external_message_id": data.get("message_id"),
                    }
                error_detail = response.text
                try:
                    error_json = response.json()
                    error_detail = error_json.get("message", error_detail)
                except Exception:
                    pass
                raise EmailServiceError(
                    f"Hyvor API error: {response.status_code} - {error_detail}"
                )
        except httpx.TimeoutException:
            raise EmailServiceError("Hyvor Relay API timeout")
        except httpx.RequestError as e:
            raise EmailServiceError(f"Hyvor Relay API request error: {e}")

    async def _send_via_smtp(
        self,
        to_email: str,
        subject: str,
        body: str,
        from_email: Optional[str],
        from_name: Optional[str],
        reply_to: Optional[str],
        html_body: Optional[str],
        row: Optional[EmailConfig],
    ) -> dict:
        host, port, user, password, use_ssl = self._resolve_smtp(row)
        if not host:
            raise EmailServiceError("SMTP host is not configured (UI or SMTP_HOST)")

        mail_from = from_email or (
            row.smtp_from_email if row and row.smtp_from_email else user
        )
        disp_name = from_name or (row.smtp_from_name if row else None) or ""
        if not mail_from:
            raise EmailServiceError("SMTP From address is not configured")

        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = (
            formataddr((disp_name, mail_from)) if disp_name else mail_from
        )
        msg["To"] = to_email
        if reply_to:
            msg["Reply-To"] = reply_to

        if html_body:
            msg.attach(MIMEText(html_body, "html", "utf-8"))
        else:
            msg.attach(MIMEText(body, "plain", "utf-8"))

        try:
            smtp = aiosmtplib.SMTP(hostname=host, port=port)
            if use_ssl:
                await smtp.connect(use_tls=True)
            else:
                await smtp.connect()
                await smtp.starttls()
            if user and password:
                await smtp.login(user, password)
            await smtp.send_message(msg)
            await smtp.quit()
            return {
                "success": True,
                "message_id": None,
                "external_message_id": None,
            }
        except Exception as e:
            logger.exception("SMTP send failed")
            raise EmailServiceError(f"SMTP error: {e}") from e

    async def send_campaign_email(
        self,
        db: AsyncSession,
        campaign: EmailCampaign,
        search_result: SearchResult,
        log: EmailLog,
    ) -> EmailLog:
        """Send one campaign email; updates ``EmailLog``."""
        try:
            idempotency_key = hashlib.sha256(
                f"{campaign.id}:{search_result.id}:{log.id}".encode()
            ).hexdigest()[:32]

            body = campaign.body
            subject = campaign.subject
            replacements = {
                "{{domain}}": search_result.domain or "",
                "{{url}}": search_result.url or "",
                "{{title}}": search_result.title or "",
                "{{email}}": search_result.email or "",
                "{{phone}}": search_result.phone or "",
                "{{seo_score}}": str(search_result.seo_score)
                if search_result.seo_score
                else "",
                "{{issues}}": self._format_issues(search_result),
            }
            for placeholder, value in replacements.items():
                body = body.replace(placeholder, value)
                subject = subject.replace(placeholder, value)

            row = await self._get_config_row(db)
            reply_prefix = (
                row.reply_prefix if row and row.reply_prefix else settings.REPLY_PREFIX
            )

            reply_to = campaign.reply_to_email
            if not reply_to and campaign.from_email:
                from_domain = (
                    campaign.from_email.split("@")[-1]
                    if "@" in campaign.from_email
                    else None
                )
                if from_domain and campaign.user_id:
                    reply_to = self.generate_reply_to_address(
                        campaign.user_id, from_domain, reply_prefix=reply_prefix
                    )

            result = await self.send_email(
                to_email=log.to_email,
                subject=subject,
                body=body,
                from_email=campaign.from_email,
                from_name=campaign.from_name,
                reply_to=reply_to,
                idempotency_key=idempotency_key,
                db=db,
            )

            log.status = EmailStatus.SENT
            log.external_message_id = result.get("external_message_id")
            log.sent_at = datetime.utcnow()
            log.body_preview = body[:500] if body else None

            db.add(log)
            await db.commit()

            return log

        except EmailServiceError as e:
            log.status = EmailStatus.FAILED
            log.error_message = str(e)
            log.error_code = "SEND_FAILED"
            db.add(log)
            await db.commit()
            raise

    def _format_issues(self, search_result: SearchResult) -> str:
        if not search_result.extra_data:
            return ""
        issues = []
        extra = search_result.extra_data
        if extra.get("missing_title"):
            issues.append("Missing title tag")
        if extra.get("missing_description"):
            issues.append("Missing meta description")
        if extra.get("missing_h1"):
            issues.append("Missing H1 tag")
        if extra.get("no_robots_txt"):
            issues.append("No robots.txt")
        if extra.get("no_sitemap"):
            issues.append("No sitemap")
        return ", ".join(issues) if issues else "SEO audit completed"

    def verify_webhook_signature(
        self, payload: bytes, signature: str, secret_override: Optional[str] = None
    ) -> bool:
        secret = secret_override or self.webhook_secret
        if not secret:
            logger.warning(
                "Webhook secret not configured, skipping signature verification"
            )
            return True
        expected_signature = hmac.new(
            secret.encode(),
            payload,
            hashlib.sha256,
        ).hexdigest()
        return hmac.compare_digest(signature, expected_signature)

    async def process_webhook_event(
        self,
        db: AsyncSession,
        event_type: str,
        data: dict,
    ) -> Optional[EmailLog]:
        external_message_id = data.get("message_id")
        if not external_message_id:
            logger.warning(f"Webhook event missing message_id: {event_type}")
            return None

        result = await db.execute(
            select(EmailLog).where(EmailLog.external_message_id == external_message_id)
        )
        log = result.scalar_one_or_none()

        if not log:
            logger.warning(
                f"EmailLog not found for message_id: {external_message_id}"
            )
            return None

        now = datetime.utcnow()

        if event_type == "delivered":
            log.status = EmailStatus.DELIVERED
            log.delivered_at = now
        elif event_type == "bounced":
            log.status = EmailStatus.BOUNCED
            log.bounced_at = now
            log.error_message = data.get("bounce_reason", "Bounced")
        elif event_type == "opened":
            if log.status != EmailStatus.OPENED:
                log.status = EmailStatus.OPENED
            log.opened_at = now
        elif event_type == "clicked":
            if log.status not in [EmailStatus.OPENED, EmailStatus.CLICKED]:
                log.status = EmailStatus.CLICKED
            log.clicked_at = now
            if not log.extra_data:
                log.extra_data = {}
            log.extra_data.setdefault("clicks", []).append(
                {
                    "url": data.get("url"),
                    "timestamp": now.isoformat(),
                }
            )
        elif event_type == "spam":
            log.status = EmailStatus.SPAM
            log.error_message = "Marked as spam"

        db.add(log)
        await db.commit()

        if log.campaign_id:
            await self._update_campaign_stats(db, log.campaign_id)

        return log

    async def _update_campaign_stats(self, db: AsyncSession, campaign_id: int):
        from sqlalchemy import func

        from app.models.email import EmailCampaign

        result = await db.execute(
            select(EmailCampaign).where(EmailCampaign.id == campaign_id)
        )
        campaign = result.scalar_one_or_none()
        if not campaign:
            return

        stats_result = await db.execute(
            select(
                EmailLog.status,
                func.count(EmailLog.id).label("count"),
            )
            .where(EmailLog.campaign_id == campaign_id)
            .group_by(EmailLog.status)
        )
        stats = {row.status: row.count for row in stats_result}

        campaign.sent_count = stats.get(EmailStatus.SENT, 0)
        campaign.delivered_count = stats.get(EmailStatus.DELIVERED, 0)
        campaign.bounced_count = stats.get(EmailStatus.BOUNCED, 0)
        campaign.opened_count = stats.get(EmailStatus.OPENED, 0) + stats.get(
            EmailStatus.CLICKED, 0
        )
        campaign.clicked_count = stats.get(EmailStatus.CLICKED, 0)
        campaign.spam_count = stats.get(EmailStatus.SPAM, 0)
        campaign.failed_count = stats.get(EmailStatus.FAILED, 0)

        db.add(campaign)
        await db.commit()


email_service = EmailService()
