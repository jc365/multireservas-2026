"""
@file test_event_poller.py
@module orchestration/tests
"""

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from orchestration.event_poller import EventPoller, POLL_INTERVAL, MAX_EVENTS
from orchestration.workflows.base import Event, WorkflowResult


class FakeWorkflow:
    def __init__(self, result=None):
        self._result = result or WorkflowResult(success=True, message="ok")
        self.call_count = 0

    async def safe_execute(self, event):
        self.call_count += 1
        return self._result


class FailThenOkWorkflow:
    def __init__(self):
        self.call_count = 0

    async def safe_execute(self, event):
        self.call_count += 1
        if self.call_count < 3:
            return WorkflowResult(success=False, message="transient error")
        return WorkflowResult(success=True, message="ok")


@pytest.fixture
def poller():
    return EventPoller({"cleanup.daily": FakeWorkflow()})


class TestEventPoller:
    @pytest.mark.asyncio
    async def test_start_stop(self):
        p = EventPoller({})
        assert not p._running
        await p.start()
        assert p._running
        await p.stop()
        assert not p._running

    @pytest.mark.asyncio
    async def test_start_idempotent(self):
        p = EventPoller({})
        await p.start()
        task1 = p._task
        await p.start()
        assert p._task is task1
        await p.stop()

    @pytest.mark.asyncio
    async def test_poll_once_processes_events(self, monkeypatch):
        wf = FakeWorkflow()
        p = EventPoller({"cleanup.daily": wf})

        fake_client = AsyncMock()
        fake_client.get = AsyncMock(return_value=MagicMock(
            status_code=200,
            json=lambda: {"events": [
                {"id": "evt-1", "eventType": "cleanup.daily", "payload": {"max_age_days": 7}},
            ]},
        ))
        fake_client.raise_for_status = MagicMock()

        monkeypatch.setattr("orchestration.event_poller.get_client", AsyncMock(return_value=fake_client))
        monkeypatch.setattr("orchestration.event_poller.mark_event_complete", AsyncMock())
        monkeypatch.setattr("orchestration.event_poller.mark_event_failed", AsyncMock())

        await p._poll_once()
        assert wf.call_count == 1

    @pytest.mark.asyncio
    async def test_poll_once_empty(self, monkeypatch):
        wf = FakeWorkflow()
        p = EventPoller({"cleanup.daily": wf})

        fake_client = AsyncMock()
        fake_client.get = AsyncMock(return_value=MagicMock(
            status_code=200,
            json=lambda: {"events": []},
        ))
        fake_client.raise_for_status = MagicMock()

        monkeypatch.setattr("orchestration.event_poller.get_client", AsyncMock(return_value=fake_client))

        await p._poll_once()
        assert wf.call_count == 0

    @pytest.mark.asyncio
    async def test_success_marks_complete(self, monkeypatch):
        p = EventPoller({"cleanup.daily": FakeWorkflow()})

        fake_client = AsyncMock()
        fake_client.get = AsyncMock(return_value=MagicMock(
            status_code=200,
            json=lambda: {"events": [
                {"id": "evt-ok", "eventType": "cleanup.daily", "payload": {}},
            ]},
        ))
        fake_client.raise_for_status = MagicMock()

        mark_complete = AsyncMock()
        mark_fail = AsyncMock()

        monkeypatch.setattr("orchestration.event_poller.get_client", AsyncMock(return_value=fake_client))
        monkeypatch.setattr("orchestration.event_poller.mark_event_complete", mark_complete)
        monkeypatch.setattr("orchestration.event_poller.mark_event_failed", mark_fail)

        await p._poll_once()
        mark_complete.assert_called_once_with("evt-ok")
        mark_fail.assert_not_called()

    @pytest.mark.asyncio
    async def test_failure_marks_failed(self, monkeypatch):
        fail_wf = FakeWorkflow(result=WorkflowResult(success=False, message="boom"))
        p = EventPoller({"cleanup.daily": fail_wf})

        fake_client = AsyncMock()
        fake_client.get = AsyncMock(return_value=MagicMock(
            status_code=200,
            json=lambda: {"events": [
                {"id": "evt-fail", "eventType": "cleanup.daily", "payload": {}},
            ]},
        ))
        fake_client.raise_for_status = MagicMock()

        mark_complete = AsyncMock()
        mark_fail = AsyncMock()

        monkeypatch.setattr("orchestration.event_poller.get_client", AsyncMock(return_value=fake_client))
        monkeypatch.setattr("orchestration.event_poller.mark_event_complete", mark_complete)
        monkeypatch.setattr("orchestration.event_poller.mark_event_failed", mark_fail)

        await p._poll_once()
        mark_fail.assert_called_once_with("evt-fail", "boom")
        mark_complete.assert_not_called()

    @pytest.mark.asyncio
    async def test_unknown_event_type_marks_complete(self, monkeypatch):
        p = EventPoller({"cleanup.daily": FakeWorkflow()})

        fake_client = AsyncMock()
        fake_client.get = AsyncMock(return_value=MagicMock(
            status_code=200,
            json=lambda: {"events": [
                {"id": "evt-unknown", "eventType": "unknown.event", "payload": {}},
            ]},
        ))
        fake_client.raise_for_status = MagicMock()

        mark_complete = AsyncMock()
        monkeypatch.setattr("orchestration.event_poller.get_client", AsyncMock(return_value=fake_client))
        monkeypatch.setattr("orchestration.event_poller.mark_event_complete", mark_complete)

        await p._poll_once()
        mark_complete.assert_called_once_with("evt-unknown")

    @pytest.mark.asyncio
    async def test_exception_marks_failed(self, monkeypatch):
        class BoomWorkflow:
            async def safe_execute(self, event):
                raise RuntimeError("crash")

        p = EventPoller({"cleanup.daily": BoomWorkflow()})

        fake_client = AsyncMock()
        fake_client.get = AsyncMock(return_value=MagicMock(
            status_code=200,
            json=lambda: {"events": [
                {"id": "evt-crash", "eventType": "cleanup.daily", "payload": {}},
            ]},
        ))
        fake_client.raise_for_status = MagicMock()

        mark_fail = AsyncMock()
        monkeypatch.setattr("orchestration.event_poller.get_client", AsyncMock(return_value=fake_client))
        monkeypatch.setattr("orchestration.event_poller.mark_event_complete", AsyncMock())
        monkeypatch.setattr("orchestration.event_poller.mark_event_failed", mark_fail)

        await p._poll_once()
        mark_fail.assert_called_once()
        assert "crash" in mark_fail.call_args[0][1]

    @pytest.mark.asyncio
    async def test_multiple_events(self, monkeypatch):
        wf = FakeWorkflow()
        p = EventPoller({"cleanup.daily": wf})

        fake_client = AsyncMock()
        fake_client.get = AsyncMock(return_value=MagicMock(
            status_code=200,
            json=lambda: {"events": [
                {"id": "evt-1", "eventType": "cleanup.daily", "payload": {}},
                {"id": "evt-2", "eventType": "cleanup.daily", "payload": {}},
                {"id": "evt-3", "eventType": "cleanup.daily", "payload": {}},
            ]},
        ))
        fake_client.raise_for_status = MagicMock()

        monkeypatch.setattr("orchestration.event_poller.get_client", AsyncMock(return_value=fake_client))
        monkeypatch.setattr("orchestration.event_poller.mark_event_complete", AsyncMock())

        await p._poll_once()
        assert wf.call_count == 3
