"""
@file notifications.py
@module orchestration/workflows.notifications

Sends notification email when an item is reviewed.
Event type: item.reviewed
Payload: { item_id, user_id, score, feedback }
"""

import logging

from orchestration.utils.backend_client import get_user
from orchestration.utils.email_client import EmailClient
from orchestration.workflows.base import BaseWorkflow, Event, WorkflowResult

logger = logging.getLogger(__name__)


class NotificationWorkflow(BaseWorkflow):
    event_type = "item.reviewed"

    async def execute(self, event: Event) -> WorkflowResult:
        payload = event.payload
        item_id = payload.get("item_id", "")
        user_id = payload.get("user_id", "")
        score = payload.get("score", 0)
        feedback = payload.get("feedback", "")

        if not user_id:
            return WorkflowResult(success=False, message="user_id is required")

        try:
            user = await get_user(user_id)
        except Exception as e:
            return WorkflowResult(success=False, message=f"Failed to fetch user: {e}")

        user_name = user.get("name", "User")
        user_email = user.get("email", "")

        if not user_email:
            return WorkflowResult(success=False, message="User has no email")

        stars = "★" * score + "☆" * (5 - score) if score else "No rating"
        body = (
            f"Hello {user_name},\n\n"
            f"Your item {item_id} has been reviewed.\n\n"
            f"Rating: {stars} ({score}/10)\n"
        )
        if feedback:
            body += f"\nFeedback:\n{feedback}\n"
        body += "\n— Events Starter"

        subject = f"Item {item_id} reviewed"

        email_client = EmailClient()
        sent = await email_client.send_email(to=user_email, subject=subject, body=body)
        if not sent:
            return WorkflowResult(success=False, message=f"Failed to send email to {user_email}")

        return WorkflowResult(
            success=True,
            message=f"Notification sent to {user_email}",
            data={"email": user_email, "user_name": user_name},
        )
