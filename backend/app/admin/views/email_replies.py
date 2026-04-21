"""Admin view for EmailReply model."""

from sqladmin import ModelView

from app.admin.views.base import BaseAdminView
from app.models.email_reply import EmailReply


class EmailReplyAdmin(BaseAdminView, model=EmailReply):
    """Admin view for email replies management."""
    
    name = "Email Reply"
    name_plural = "Email Replies"
    icon = "fa-solid fa-reply"
    
    # List view columns
    column_list = [
        EmailReply.id,
        EmailReply.user_id,
        EmailReply.from_email,
        EmailReply.subject,
        EmailReply.campaign_id,
        EmailReply.is_processed,
        EmailReply.forwarded_to,
        EmailReply.received_at,
    ]
    
    # Searchable columns
    column_searchable_list = [
        EmailReply.from_email,
        EmailReply.from_name,
        EmailReply.subject,
        EmailReply.body_text,
    ]
    
    # Default sort
    column_default_sort = [(EmailReply.received_at, True)]  # Descending
    
    # Read-only fields
    form_readonly_columns = [
        EmailReply.id,
        EmailReply.email_log_id,
        EmailReply.campaign_id,
        EmailReply.user_id,
        EmailReply.from_email,
        EmailReply.from_name,
        EmailReply.subject,
        EmailReply.body_text,
        EmailReply.body_html,
        EmailReply.in_reply_to,
        EmailReply.references,
        EmailReply.received_at,
        EmailReply.created_at,
    ]
    
    # Column labels
    column_labels = {
        EmailReply.id: "ID",
        EmailReply.user_id: "ID Пользователя",
        EmailReply.from_email: "Email отправителя",
        EmailReply.from_name: "Имя отправителя",
        EmailReply.subject: "Тема",
        EmailReply.body_text: "Текст ответа",
        EmailReply.body_html: "HTML ответа",
        EmailReply.campaign_id: "ID Кампании",
        EmailReply.email_log_id: "ID Email Log",
        EmailReply.is_processed: "Обработан",
        EmailReply.forwarded_at: "Переслан",
        EmailReply.forwarded_to: "Переслан на",
        EmailReply.in_reply_to: "In-Reply-To",
        EmailReply.references: "References",
        EmailReply.received_at: "Получен",
        EmailReply.created_at: "Создан",
    }
    
    # Column formatters
    column_formatters = {
        EmailReply.is_processed: lambda v: "Да" if v else "Нет",
        EmailReply.forwarded_at: lambda v: v.strftime("%Y-%m-%d %H:%M:%S") if v else "-",
        EmailReply.forwarded_to: lambda v: v or "-",
        EmailReply.received_at: lambda v: v.strftime("%Y-%m-%d %H:%M:%S") if v else "-",
        EmailReply.created_at: lambda v: v.strftime("%Y-%m-%d %H:%M:%S") if v else "-",
    }
