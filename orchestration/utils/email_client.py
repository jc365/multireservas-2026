"""
@file email_client.py
@module orchestration/utils/email_client

Multi-provider email client. Supports 'console', 'resend', and 'smtp'.
Configuration via environment variables only.
"""

import logging
import os
import smtplib
from email.mime.text import MIMEText
from typing import Optional

import httpx

logger = logging.getLogger(__name__)


def _sanitize_key(key: Optional[str]) -> str:
    """Sanitize API key for logging: show first 4 and last 4 chars."""
    if not key or len(key) <= 12:
        return "***"
    return f"{key[:4]}...{key[-4:]}"


class EmailClient:
    """Email client with interchangeable providers."""

    def __init__(self) -> None:
        self.provider = os.getenv("EMAIL_PROVIDER", "console")
        self.email_from = os.getenv("EMAIL_FROM", "noreply@events-starter.local")
        self.from_name = os.getenv("EMAIL_FROM_NAME", "Events Starter")

        # Resend config
        self.api_key = os.getenv("RESEND_API_KEY", "")

        # SMTP config
        self.smtp_host = os.getenv("SMTP_HOST", "")
        self.smtp_port = int(os.getenv("SMTP_PORT", "587"))
        self.smtp_user = os.getenv("SMTP_USER", "")
        self.smtp_pass = os.getenv("SMTP_PASS", "")

        logger.info(
            "EmailClient initialized: provider=%s, from=%s, api_key=%s",
            self.provider, self.email_from, _sanitize_key(self.api_key),
        )

    async def send_email(self, to: str, subject: str, body: str) -> bool:
        """Send email using the configured provider. Returns True on success."""

        full_body = self._add_unsubscribe_footer(body)

        if self.provider == "console":
            return await self._send_console(to, subject, full_body)
        elif self.provider == "resend":
            return await self._send_resend(to, subject, full_body)
        elif self.provider == "smtp":
            return await self._send_smtp(to, subject, full_body)
        else:
            logger.error("Unknown email provider: %s", self.provider)
            return False

    def _add_unsubscribe_footer(self, body: str) -> str:
        """Append standard unsubscribe footer to email body."""
        footer = """
\n\n\n(*) This is an automated message from Events Starter.
To unsubscribe, reply to this email with subject "unsubscribe".
"""
        return body + footer


    async def _send_console(self, to: str, subject: str, body: str) -> bool:
        """Log email to console (development)."""
        logger.info(
            "[CONSOLE EMAIL]\n  To: %s\n  From: %s <%s>\n  Subject: %s\n  Body:\n%s",
            to, self.from_name, self.email_from, subject, body,
        )
        return True

    async def _send_resend(self, to: str, subject: str, body: str) -> bool:
        """Send email via Resend API."""
        if not self.api_key:
            logger.error("Resend API key not configured (RESEND_API_KEY)")
            return False

        url = "https://api.resend.com/emails"
        payload = {
            "from": f"{self.from_name} <{self.email_from}>",
            "to": [to],
            "subject": subject,
            "text": body,
            "headers": {
                "List-Unsubscribe": f"<mailto:{self.email_from}?subject=unsubscribe>",
                "List-Unsubscribe-Post": "List-Unsubscribe=One-Click"
            }
        }

        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    url,
                    json=payload,
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json",
                    },
                    timeout=30,
                )
                response.raise_for_status()
                data = response.json()
                email_id = data.get("id", "unknown")
                logger.info("Resend email sent to %s (id: %s): %s", to, email_id, subject)
                return True
        except httpx.HTTPStatusError as e:
            logger.error("Resend HTTP error %d: %s", e.response.status_code, e.response.text[:200])
            return False
        except Exception as e:
            logger.error("Resend error: %s", e)
            return False

    async def _send_smtp(self, to: str, subject: str, body: str) -> bool:
        """Send email via SMTP."""
        if not self.smtp_host:
            logger.error("SMTP host not configured (SMTP_HOST)")
            return False

        msg = MIMEText(body, "plain", "utf-8")
        msg["Subject"] = subject
        msg["From"] = f"{self.from_name} <{self.email_from}>"
        msg["To"] = to

        unsubscribe_email = self.email_from
        msg["List-Unsubscribe"] = f"<mailto:{unsubscribe_email}?subject=unsubscribe>"
        msg["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click"

        try:
            loop = __import__("asyncio").get_running_loop()
            await loop.run_in_executor(None, self._smtp_send, msg)
            logger.info("SMTP email sent to %s: %s", to, subject)
            return True
        except Exception as e:
            logger.error("SMTP error: %s", e)
            return False

    def _smtp_send(self, msg: MIMEText) -> None:
        """Synchronous SMTP send (runs in executor)."""
        with smtplib.SMTP(self.smtp_host, self.smtp_port) as server:
            if self.smtp_port != 25:
                server.starttls()
            if self.smtp_user:
                server.login(self.smtp_user, self.smtp_pass)
            server.send_message(msg)
