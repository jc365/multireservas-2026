"""
@file test_email.py
@module orchestration/workflows/test_email

Workflow to send a test email via the configured provider.
"""

import logging

from orchestration.utils.email_client import EmailClient
from orchestration.workflows.base import BaseWorkflow, Event, WorkflowResult

logger = logging.getLogger(__name__)


class TestEmailWorkflow(BaseWorkflow):
    """Sends a test email using the configured provider."""

    event_type = "test.email"

    async def execute(self, event: Event) -> WorkflowResult:
        payload = event.payload or {}
        to = payload.get("to", "")

        email_client = EmailClient()
        target = to or email_client.email_from

        sent = await email_client.send_email(
            to=target,
            subject="Events Starter — Test Email",
            body=(
                "This is a test email from Events Starter Orchestrator.\n\n"
                f"Provider: {email_client.provider}\n"
                f"From: {email_client.from_name} <{email_client.email_from}>\n\n"
                "— Events Starter Orchestrator"
            ),
        )

        if sent:
            return WorkflowResult(
                success=True,
                message=f"Test email sent to {target}",
                data={"provider": email_client.provider, "to": target},
            )
        return WorkflowResult(
            success=False,
            message=f"Failed to send email to {target}",
            data={"provider": email_client.provider, "to": target},
        )
