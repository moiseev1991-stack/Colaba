"""SQLAdmin view для входящих заявок (модуль inbound_leads).

Регистрируется в backend/app/admin/main.py — см. setup_admin().
Раздел «Заявки»: список с фильтром по статусу, привязка к компании, дата.
"""

from sqladmin import ModelView

from app.models.inbound_lead import InboundLead


class InboundLeadAdmin(ModelView, model=InboundLead):
    name = "Заявка"
    name_plural = "Заявки"
    icon = "fa-solid fa-inbox"

    column_list = [
        InboundLead.id,
        InboundLead.source,
        InboundLead.company_text,
        InboundLead.contact_text,
        InboundLead.matched_company_id,
        InboundLead.status,
        InboundLead.created_at,
    ]
    column_searchable_list = [
        InboundLead.company_text,
        InboundLead.contact_text,
        InboundLead.tg_username,
        InboundLead.name,
    ]
    column_sortable_list = [InboundLead.status, InboundLead.created_at, InboundLead.source]
    column_default_sort = ("created_at", True)
    page_size = 50

    # Статус редактируется прямо в админке; остальное — только чтение.
    can_edit = True
    form_columns = [InboundLead.status]

    column_labels = {
        InboundLead.source: "Источник",
        InboundLead.source_tag: "Метка",
        InboundLead.company_text: "Компания (текст)",
        InboundLead.contact_text: "Контакт",
        InboundLead.tg_username: "TG username",
        InboundLead.matched_company_id: "Компания в базе",
        InboundLead.status: "Статус",
        InboundLead.name: "Имя",
        InboundLead.created_at: "Создано",
        InboundLead.updated_at: "Обновлено",
    }
