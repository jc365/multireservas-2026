"""
@file test_notifications.py
@module orchestration/tests
"""

import pytest
from orchestration.workflows.base import Event, WorkflowResult
from orchestration.workflows.notifications import NotificationWorkflow


@pytest.fixture
def workflow():
    return NotificationWorkflow()


class TestNotificationWorkflow:
    @pytest.mark.asyncio
    async def test_event_type(self, workflow):
        assert workflow.event_type == "item.reviewed"

    @pytest.mark.asyncio
    async def test_missing_user_id(self, workflow):
        event = Event(type="item.reviewed", payload={})
        result = await workflow.execute(event)
        assert not result.success
        assert "user_id is required" in result.message

    @pytest.mark.asyncio
    async def test_user_fetch_failure(self, workflow, monkeypatch):
        async def fail_get_user(uid):
            raise ConnectionError("backend down")

        monkeypatch.setattr("orchestration.workflows.notifications.get_user", fail_get_user)

        event = Event(
            type="item.reviewed",
            payload={"user_id": "usr-001", "score": 5},
        )
        result = await workflow.execute(event)
        assert not result.success
        assert "Failed to fetch user" in result.message

    @pytest.mark.asyncio
    async def test_no_email(self, workflow, monkeypatch):
        async def fake_get_user(uid):
            return {"name": "User", "email": ""}

        monkeypatch.setattr("orchestration.workflows.notifications.get_user", fake_get_user)

        event = Event(
            type="item.reviewed",
            payload={"user_id": "usr-001", "score": 5},
        )
        result = await workflow.execute(event)
        assert not result.success
        assert "no email" in result.message.lower()

    @pytest.mark.asyncio
    async def test_successful_notification(self, workflow, monkeypatch):
        async def fake_get_user(uid):
            return {"name": "Juan Perez", "email": "juan@test.com"}

        monkeypatch.setattr("orchestration.workflows.notifications.get_user", fake_get_user)

        event = Event(
            type="item.reviewed",
            payload={
                "item_id": "item-001",
                "user_id": "usr-001",
                "score": 8,
                "feedback": "Great work!",
            },
        )

        result = await workflow.execute(event)
        assert result.success
        assert result.data["email"] == "juan@test.com"
        assert result.data["user_name"] == "Juan Perez"

    @pytest.mark.asyncio
    async def test_email_content(self, workflow, monkeypatch):
        captured = {}

        async def fake_get_user(uid):
            return {"name": "Maria", "email": "maria@test.com"}

        async def fake_send_email(self_email, to, subject, body):
            captured["to"] = to
            captured["subject"] = subject
            captured["body"] = body
            return True

        monkeypatch.setattr("orchestration.workflows.notifications.get_user", fake_get_user)
        monkeypatch.setattr("orchestration.utils.email_client.EmailClient.send_email", fake_send_email)

        event = Event(
            type="item.reviewed",
            payload={
                "item_id": "item-42",
                "user_id": "usr-001",
                "score": 5,
                "feedback": "Good job",
            },
        )

        result = await workflow.execute(event)
        assert result.success

        assert captured["to"] == "maria@test.com"
        assert "item-42" in captured["subject"]
        assert "Maria" in captured["body"]
        assert "★" in captured["body"]
        assert "Good job" in captured["body"]

    @pytest.mark.asyncio
    async def test_no_feedback(self, workflow, monkeypatch):
        captured = {}

        async def fake_get_user(uid):
            return {"name": "Test", "email": "test@test.com"}

        async def fake_send_email(self_email, to, subject, body):
            captured["body"] = body
            return True

        monkeypatch.setattr("orchestration.workflows.notifications.get_user", fake_get_user)
        monkeypatch.setattr("orchestration.utils.email_client.EmailClient.send_email", fake_send_email)

        event = Event(
            type="item.reviewed",
            payload={
                "item_id": "item-99",
                "user_id": "usr-001",
                "score": 3,
                "feedback": "",
            },
        )

        result = await workflow.execute(event)
        assert result.success
        assert "Feedback:" not in captured["body"]
