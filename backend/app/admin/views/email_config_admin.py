"""SQLAdmin view for global EmailConfig singleton."""

from sqladmin import ModelView

from app.models.email_config import EmailConfig


class EmailConfigAdmin(ModelView, model=EmailConfig):
    """Singleton email configuration (Hyvor / SMTP / IMAP)."""

    name = "Email config"
    name_plural = "Email configuration"
    icon = "fa-solid fa-gears"

    can_create = False
    can_delete = False

    column_list = [
        EmailConfig.id,
        EmailConfig.provider_type,
        EmailConfig.is_configured,
        EmailConfig.last_test_at,
        EmailConfig.last_test_result,
        EmailConfig.updated_at,
    ]

    column_searchable_list = [EmailConfig.provider_type]
    form_columns = [
        EmailConfig.provider_type,
        EmailConfig.hyvor_api_url,
        EmailConfig.hyvor_api_key,
        EmailConfig.hyvor_webhook_secret,
        EmailConfig.smtp_host,
        EmailConfig.smtp_port,
        EmailConfig.smtp_user,
        EmailConfig.smtp_password,
        EmailConfig.smtp_use_ssl,
        EmailConfig.smtp_from_email,
        EmailConfig.smtp_from_name,
        EmailConfig.reply_to_email,
        EmailConfig.imap_host,
        EmailConfig.imap_port,
        EmailConfig.imap_user,
        EmailConfig.imap_password,
        EmailConfig.imap_use_ssl,
        EmailConfig.imap_mailbox,
        EmailConfig.reply_prefix,
        EmailConfig.is_configured,
    ]
