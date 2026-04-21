"""Email configuration model (singleton)."""

from datetime import datetime

from sqlalchemy import Column, Integer, String, DateTime, Boolean

from app.core.database import Base


class EmailConfig(Base):
    """Global email configuration -- provider settings, SMTP, IMAP."""
    __tablename__ = "email_config"

    id = Column(Integer, primary_key=True, index=True)

    # Which provider to use: 'hyvor' or 'smtp'
    provider_type = Column(String(20), nullable=False, default="smtp", server_default="smtp")

    # --- Hyvor Relay ---
    hyvor_api_url = Column(String(255), nullable=True, default="http://hyvor-relay:8000")
    hyvor_api_key = Column(String(255), nullable=True, default="")
    hyvor_webhook_secret = Column(String(255), nullable=True, default="")

    # --- SMTP ---
    smtp_host = Column(String(255), nullable=True, default="")
    smtp_port = Column(Integer, nullable=True, default=465)
    smtp_user = Column(String(255), nullable=True, default="")
    smtp_password = Column(String(255), nullable=True, default="")
    smtp_use_ssl = Column(Boolean, nullable=False, default=True, server_default="true")
    smtp_from_email = Column(String(255), nullable=True, default="")
    smtp_from_name = Column(String(255), nullable=True, default="")

    # --- Reply-to ---
    reply_to_email = Column(String(255), nullable=True, default="")

    # --- IMAP (receiving replies) ---
    imap_host = Column(String(255), nullable=True, default="")
    imap_port = Column(Integer, nullable=True, default=993)
    imap_user = Column(String(255), nullable=True, default="")
    imap_password = Column(String(255), nullable=True, default="")
    imap_use_ssl = Column(Boolean, nullable=False, default=True, server_default="true")
    imap_mailbox = Column(String(255), nullable=False, default="INBOX", server_default="INBOX")
    reply_prefix = Column(String(50), nullable=False, default="reply-", server_default="reply-")

    # --- Status ---
    is_configured = Column(Boolean, nullable=False, default=False, server_default="false")
    last_test_at = Column(DateTime, nullable=True)
    last_test_result = Column(String(50), nullable=True)

    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, server_default="now()")

    def __str__(self):
        return f"EmailConfig [{self.provider_type}]"

    def __repr__(self):
        return self.__str__()
