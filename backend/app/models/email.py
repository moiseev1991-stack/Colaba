"""
Email models for outreach campaigns and delivery tracking.
"""

from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, JSON, ForeignKey, DateTime, Boolean
from sqlalchemy.orm import relationship
import enum

from app.core.database import Base


class DnsStatus(str, enum.Enum):
    """DNS verification status for email domains."""
    PENDING = "pending"
    VERIFIED = "verified"
    FAILED = "failed"


class EmailStatus(str, enum.Enum):
    """Email delivery status."""
    PENDING = "pending"
    SENT = "sent"
    DELIVERED = "delivered"
    BOUNCED = "bounced"
    OPENED = "opened"
    CLICKED = "clicked"
    SPAM = "spam"
    FAILED = "failed"


class CampaignStatus(str, enum.Enum):
    """Email campaign status."""
    DRAFT = "draft"
    SENDING = "sending"
    COMPLETED = "completed"
    FAILED = "failed"


class EmailDomain(Base):
    """Email domain for sending (DKIM/SPF/DMARC configuration)."""
    __tablename__ = "email_domains"

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=True, index=True)
    domain = Column(String(255), nullable=False, unique=True)
    
    # DNS verification status (using String instead of Enum for compatibility)
    dkim_status = Column(String(20), default=DnsStatus.PENDING.value, nullable=False)
    spf_status = Column(String(20), default=DnsStatus.PENDING.value, nullable=False)
    dmarc_status = Column(String(20), default=DnsStatus.PENDING.value, nullable=False)
    
    # DNS records for reference
    dkim_record = Column(Text, nullable=True)
    spf_record = Column(Text, nullable=True)
    dmarc_record = Column(Text, nullable=True)
    
    # Default sender info
    default_from_email = Column(String(255), nullable=True)
    default_from_name = Column(String(255), nullable=True)
    reply_to_email = Column(String(255), nullable=True)  # Where replies will be sent
    
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, onupdate=datetime.utcnow)
    verified_at = Column(DateTime, nullable=True)

    # Relationships
    organization = relationship("Organization", back_populates="email_domains")

    def __str__(self):
        return f"#{self.id} - {self.domain}"

    def __repr__(self):
        return self.__str__()


class EmailTemplate(Base):
    """Email template for outreach campaigns."""
    __tablename__ = "email_templates"

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    
    name = Column(String(200), nullable=False)
    subject = Column(String(500), nullable=False)
    body = Column(Text, nullable=False)
    
    # Module association (seo, leads, etc.)
    module = Column(String(50), default="seo", nullable=False)
    
    # Template metadata
    is_default = Column(Boolean, default=False, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    
    # Variables/placeholders available in this template
    variables = Column(JSON, default=[])
    
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, onupdate=datetime.utcnow)

    # Relationships
    organization = relationship("Organization", back_populates="email_templates")
    user = relationship("User", back_populates="email_templates")
    campaigns = relationship("EmailCampaign", back_populates="template")

    def __str__(self):
        return f"#{self.id} - {self.name}"

    def __repr__(self):
        return self.__str__()


class EmailCampaign(Base):
    """Email campaign for mass outreach."""
    __tablename__ = "email_campaigns"

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    template_id = Column(Integer, ForeignKey("email_templates.id"), nullable=True, index=True)
    domain_id = Column(Integer, ForeignKey("email_domains.id"), nullable=True, index=True)
    
    name = Column(String(200), nullable=False)
    subject = Column(String(500), nullable=False)
    body = Column(Text, nullable=False)
    
    status = Column(String(20), default=CampaignStatus.DRAFT.value, nullable=False)
    
    # Statistics
    total_recipients = Column(Integer, default=0, nullable=False)
    sent_count = Column(Integer, default=0, nullable=False)
    delivered_count = Column(Integer, default=0, nullable=False)
    bounced_count = Column(Integer, default=0, nullable=False)
    opened_count = Column(Integer, default=0, nullable=False)
    clicked_count = Column(Integer, default=0, nullable=False)
    spam_count = Column(Integer, default=0, nullable=False)
    failed_count = Column(Integer, default=0, nullable=False)
    
    # Search result IDs that were included in this campaign
    search_result_ids = Column(JSON, default=[])
    
    # Sender info override
    from_email = Column(String(255), nullable=True)
    from_name = Column(String(255), nullable=True)
    reply_to_email = Column(String(255), nullable=True)  # Where replies will be sent
    
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, onupdate=datetime.utcnow)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)

    # Relationships
    organization = relationship("Organization", back_populates="email_campaigns")
    user = relationship("User", back_populates="email_campaigns")
    template = relationship("EmailTemplate", back_populates="campaigns")
    domain = relationship("EmailDomain")
    logs = relationship("EmailLog", back_populates="campaign", cascade="all, delete-orphan")

    def __str__(self):
        return f"#{self.id} - {self.name} [{self.status}]"

    def __repr__(self):
        return self.__str__()


class EmailLog(Base):
    """Individual email log for tracking delivery status."""
    __tablename__ = "email_logs"

    id = Column(Integer, primary_key=True, index=True)
    campaign_id = Column(Integer, ForeignKey("email_campaigns.id"), nullable=True, index=True)
    search_result_id = Column(Integer, ForeignKey("search_results.id"), nullable=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    
    # Recipient info
    to_email = Column(String(255), nullable=False, index=True)
    to_name = Column(String(255), nullable=True)
    
    # Email content
    subject = Column(String(500), nullable=False)
    body_preview = Column(Text, nullable=True)  # First 500 chars of body
    
    # Status tracking (using String instead of Enum for compatibility)
    status = Column(String(20), default=EmailStatus.PENDING.value, nullable=False, index=True)
    
    # External IDs from Hyvor Relay
    external_message_id = Column(String(255), nullable=True, index=True)
    
    # Error information
    error_message = Column(Text, nullable=True)
    error_code = Column(String(50), nullable=True)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    sent_at = Column(DateTime, nullable=True)
    delivered_at = Column(DateTime, nullable=True)
    opened_at = Column(DateTime, nullable=True)
    clicked_at = Column(DateTime, nullable=True)
    bounced_at = Column(DateTime, nullable=True)
    
    # Additional metadata
    extra_data = Column(JSON, default={})

    # Relationships
    campaign = relationship("EmailCampaign", back_populates="logs")
    search_result = relationship("SearchResult")
    organization = relationship("Organization")
    user = relationship("User", back_populates="email_logs")

    def __str__(self):
        return f"#{self.id} - {self.to_email} [{self.status.value}]"

    def __repr__(self):
        return self.__str__()
