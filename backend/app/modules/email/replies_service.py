"""
Email replies processing service.

Reads incoming emails via IMAP, parses reply-to addresses, 
saves to database, and forwards to user's personal email.
"""

import email
import imaplib
import logging
import re
from datetime import datetime
from email.header import decode_header
from typing import Optional, Tuple

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.modules.email.config_sync import get_email_config_sync
from app.models.email_reply import EmailReply
from app.models.user import User

logger = logging.getLogger(__name__)


class EmailRepliesService:
    """Service for processing incoming email replies."""
    
    def __init__(self, db: AsyncSession):
        self.db = db
        self.imap = None
    
    def connect_imap(self) -> bool:
        """Connect to IMAP server (DB ``email_config`` overrides env)."""
        try:
            row = get_email_config_sync()
            host = (row.imap_host if row and row.imap_host else None) or settings.IMAP_HOST
            port = int(row.imap_port if row and row.imap_port is not None else settings.IMAP_PORT)
            user = (row.imap_user if row and row.imap_user else None) or settings.IMAP_USER
            password = (row.imap_password if row and row.imap_password else None) or settings.IMAP_PASSWORD
            use_ssl = row.imap_use_ssl if row else settings.IMAP_USE_SSL
            if not host or not user:
                logger.warning("IMAP not configured (host/user empty)")
                return False
            if use_ssl:
                self.imap = imaplib.IMAP4_SSL(host, port)
            else:
                self.imap = imaplib.IMAP4(host, port)
            self.imap.login(user, password)
            logger.info(f"Connected to IMAP server: {host}")
            return True
        except Exception as e:
            logger.error(f"Failed to connect to IMAP: {e}")
            return False
    
    def disconnect_imap(self):
        """Disconnect from IMAP server."""
        if self.imap:
            try:
                self.imap.close()
                self.imap.logout()
            except Exception:
                pass
            self.imap = None
    
    def parse_user_id_from_email(self, email_address: str, prefix: Optional[str] = None) -> Optional[int]:
        """
        Extract user_id from reply email address.
        
        Example: reply-123@domain.com -> 123
        """
        # Extract local part before @
        local_part = email_address.split('@')[0]
        pfx = prefix
        if pfx is None:
            row = get_email_config_sync()
            pfx = row.reply_prefix if row and row.reply_prefix else settings.REPLY_PREFIX
        # Match pattern: prefix-{user_id}
        pattern = rf"^{re.escape(pfx)}(\d+)$"
        match = re.match(pattern, local_part)
        
        if match:
            return int(match.group(1))
        return None
    
    def decode_mime_header(self, header_value: str) -> str:
        """Decode MIME header (handles encoded subjects, names, etc.)."""
        if not header_value:
            return ""
        
        decoded_parts = decode_header(header_value)
        result = []
        
        for part, charset in decoded_parts:
            if isinstance(part, bytes):
                try:
                    if charset:
                        result.append(part.decode(charset))
                    else:
                        result.append(part.decode('utf-8', errors='ignore'))
                except Exception:
                    result.append(part.decode('utf-8', errors='ignore'))
            else:
                result.append(str(part))
        
        return ''.join(result)
    
    def extract_email_body(self, msg: email.message.Message) -> Tuple[Optional[str], Optional[str]]:
        """Extract text and HTML body from email message."""
        text_body = None
        html_body = None
        
        if msg.is_multipart():
            for part in msg.walk():
                content_type = part.get_content_type()
                content_disposition = str(part.get("Content-Disposition", ""))
                
                # Skip attachments
                if "attachment" in content_disposition:
                    continue
                
                try:
                    payload = part.get_payload(decode=True)
                    if not payload:
                        continue
                    
                    charset = part.get_content_charset() or 'utf-8'
                    body = payload.decode(charset, errors='ignore')
                    
                    if content_type == "text/plain" and not text_body:
                        text_body = body
                    elif content_type == "text/html" and not html_body:
                        html_body = body
                except Exception as e:
                    logger.warning(f"Failed to extract body part: {e}")
        else:
            # Single part message
            content_type = msg.get_content_type()
            try:
                payload = msg.get_payload(decode=True)
                if payload:
                    charset = msg.get_content_charset() or 'utf-8'
                    body = payload.decode(charset, errors='ignore')
                    
                    if content_type == "text/plain":
                        text_body = body
                    elif content_type == "text/html":
                        html_body = body
            except Exception as e:
                logger.warning(f"Failed to extract body: {e}")
        
        return text_body, html_body
    
    async def process_email(self, msg: email.message.Message, message_id: str) -> Optional[EmailReply]:
        """
        Process a single email message.
        
        Returns EmailReply if successfully processed, None otherwise.
        """
        # Get recipient (To header) - this is our reply-{user_id}@domain.com
        to_header = msg.get('To', '')
        to_emails = [addr.strip() for addr in to_header.split(',')]
        
        user_id = None
        for to_email in to_emails:
            # Extract email from format: "Name" <email@domain.com>
            match = re.search(r'<([^>]+)>', to_email)
            clean_email = match.group(1) if match else to_email
            
            user_id = self.parse_user_id_from_email(clean_email)
            if user_id:
                break
        
        if not user_id:
            logger.debug(f"No user_id found in To header: {to_header}")
            return None
        
        # Verify user exists
        user_result = await self.db.execute(select(User).where(User.id == user_id))
        user = user_result.scalar_one_or_none()
        
        if not user:
            logger.warning(f"User not found for user_id: {user_id}")
            return None
        
        # Extract sender info
        from_header = msg.get('From', '')
        from_match = re.search(r'"?([^"<]+)"?\s*<([^>]+)>', from_header)
        if from_match:
            from_name = self.decode_mime_header(from_match.group(1).strip())
            from_email = from_match.group(2)
        else:
            from_name = None
            from_email = from_header.strip()
        
        # Extract subject
        subject = self.decode_mime_header(msg.get('Subject', '(No Subject)'))
        
        # Extract body
        text_body, html_body = self.extract_email_body(msg)
        
        # Extract references
        in_reply_to = msg.get('In-Reply-To', '')
        references = msg.get('References', '')
        
        # Create EmailReply record
        reply = EmailReply(
            user_id=user_id,
            from_email=from_email,
            from_name=from_name,
            subject=subject,
            body_text=text_body,
            body_html=html_body,
            in_reply_to=in_reply_to,
            references=references,
            received_at=datetime.utcnow(),
        )
        
        self.db.add(reply)
        await self.db.commit()
        await self.db.refresh(reply)
        
        logger.info(f"Saved reply #{reply.id} from {from_email} for user #{user_id}")
        
        # Forward to user's personal email
        await self.forward_reply(reply, user.email)
        
        return reply
    
    async def forward_reply(self, reply: EmailReply, user_email: str):
        """
        Forward reply to user's personal email address.
        
        Uses the existing EmailService to send the forwarded message.
        """
        from app.modules.email.service import email_service
        
        # Prepare forwarded message
        forward_subject = f"Fwd: {reply.subject}"
        
        # Build forward body
        forward_body = f"""---------- Forwarded message ----------
From: {reply.from_name or reply.from_email} <{reply.from_email}>
Date: {reply.received_at.strftime('%Y-%m-%d %H:%M:%S')}
Subject: {reply.subject}

"""
        
        if reply.body_text:
            forward_body += reply.body_text
        elif reply.body_html:
            # Use HTML if no text available
            forward_body += "(HTML content - see attachment)"
        
        try:
            await email_service.send_email(
                to=user_email,
                subject=forward_subject,
                body=forward_body,
                from_email=None,
                from_name="Colaba — пересланный ответ",
                db=self.db,
            )
            
            # Mark as forwarded
            reply.forwarded_at = datetime.utcnow()
            reply.forwarded_to = user_email
            reply.is_processed = True
            await self.db.commit()
            
            logger.info(f"Forwarded reply #{reply.id} to {user_email}")
        except Exception as e:
            logger.error(f"Failed to forward reply #{reply.id}: {e}")
    
    async def process_inbox(self) -> int:
        """
        Process all unread emails in the inbox.
        
        Returns count of processed replies.
        """
        if not self.connect_imap():
            return 0
        
        try:
            row = get_email_config_sync()
            mbox = (
                (row.imap_mailbox if row and row.imap_mailbox else None)
                or settings.IMAP_MAILBOX
            )
            status, messages = self.imap.select(mbox)
            if status != 'OK':
                logger.error(f"Failed to select mailbox: {mbox}")
                return 0
            
            # Search for unread messages
            status, message_ids = self.imap.search(None, 'UNSEEN')
            if status != 'OK':
                logger.error("Failed to search for messages")
                return 0
            
            message_id_list = message_ids[0].split()
            processed_count = 0
            
            for msg_id in message_id_list:
                try:
                    # Fetch message
                    status, msg_data = self.imap.fetch(msg_id, '(RFC822)')
                    if status != 'OK':
                        continue
                    
                    # Parse email
                    raw_email = msg_data[0][1]
                    msg = email.message_from_bytes(raw_email)
                    message_id = msg.get('Message-ID', '')
                    
                    # Process email
                    reply = await self.process_email(msg, message_id)
                    if reply:
                        processed_count += 1
                    
                    # Mark as read
                    self.imap.store(msg_id, '+FLAGS', '\\Seen')
                    
                except Exception as e:
                    logger.error(f"Failed to process message {msg_id}: {e}")
            
            logger.info(f"Processed {processed_count} replies from {len(message_id_list)} messages")
            return processed_count
            
        finally:
            self.disconnect_imap()


async def process_email_replies(db: AsyncSession) -> int:
    """
    Background task entry point for processing email replies.
    
    Returns count of processed replies.
    """
    service = EmailRepliesService(db)
    return await service.process_inbox()
