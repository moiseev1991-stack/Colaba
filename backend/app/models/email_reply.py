"""Email reply models for tracking incoming replies."""

from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Boolean
from sqlalchemy.orm import relationship

from app.core.database import Base


class EmailReply(Base):
    """Incoming email reply tracking."""
    __tablename__ = "email_replies"

    id = Column(Integer, primary_key=True, index=True)
    
    # Links
    email_log_id = Column(Integer, ForeignKey("email_logs.id"), nullable=True, index=True)
    campaign_id = Column(Integer, ForeignKey("email_campaigns.id"), nullable=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    
    # Sender info (the person who replied)
    from_email = Column(String(255), nullable=False)
    from_name = Column(String(255), nullable=True)
    
    # Reply content
    subject = Column(String(500), nullable=False)
    body_text = Column(Text, nullable=True)
    body_html = Column(Text, nullable=True)
    
    # Original message reference
    in_reply_to = Column(String(255), nullable=True)  # Message-ID of original email
    references = Column(Text, nullable=True)  # Thread references
    
    # Processing status
    is_processed = Column(Boolean, default=False, nullable=False)
    forwarded_at = Column(DateTime, nullable=True)
    forwarded_to = Column(String(255), nullable=True)  # User's email where we forwarded
    
    # Timestamps
    received_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    email_log = relationship("EmailLog")
    campaign = relationship("EmailCampaign")
    user = relationship("User", back_populates="email_replies")

    def __str__(self):
        return f"#{self.id} - Reply from {self.from_email}"

    def __repr__(self):
        return self.__str__()
