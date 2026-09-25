"""
@file test_integration.py
@module orchestration/tests

Integration tests verifying the event queue flow with mocked backend.
"""

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from orchestration.event_poller import EventPoller
from orchestration.workflows.base import Event, WorkflowResult


class RecordingWorkflow:
    def __init__(self):
        self.events: list[Event] = []

    async def safe_execute(self, event: Event) -> WorkflowResult:
        self.events.append(event)
        return WorkflowResult(success=True, message=f"processed {event.event_id}")


class TestEventQueueIntegration:
    @pytest.mark.asyncio
    async def test_full_flow_pending_to_complete(self, monkeypatch):
        wf = RecordingWorkflow()
        p = EventPoller({"cleanup.daily": wf})

        events_db = [
            {"id": "evt-1", "eventType": "cleanup.daily", "payload": {"max_age_days": 7}, "status": "pending"},
        ]

        fake_client = AsyncMock()
        fake_client.get = AsyncMock(return_value=MagicMock(
            status_code=200,
            json=lambda: {"events": events_db},
        ))
        fake_client.raise_for_status = MagicMock()

        completed_ids = []
        failed_ids = []

        async def mock_complete(eid):
            completed_ids.append(eid)

        async def mock_failed(eid, err):
            failed_ids.append(eid)

        monkeypatch.setattr("orchestration.event_poller.get_client", AsyncMock(return_value=fake_client))
        monkeypatch.setattr("orchestration.event_poller.mark_event_complete", mock_complete)
        monkeypatch.setattr("orchestration.event_poller.mark_event_failed", mock_failed)

        await p._poll_once()

        assert len(wf.events) == 1
        assert wf.events[0].type == "cleanup.daily"
        assert wf.events[0].event_id == "evt-1"
        assert completed_ids == ["evt-1"]
        assert failed_ids == []

    @pytest.mark.asyncio
    async def test_full_flow_pending_to_fail(self, monkeypatch):
        fail_wf = MagicMock()
        fail_wf.safe_execute = AsyncMock(return_value=WorkflowResult(success=False, message="video not found"))

        p = EventPoller({"item.created": fail_wf})

        events_db = [
            {"id": "evt-2", "eventType": "item.created", "payload": {"item_id": "item-1"}, "status": "pending"},
        ]

        fake_client = AsyncMock()
        fake_client.get = AsyncMock(return_value=MagicMock(
            status_code=200,
            json=lambda: {"events": events_db},
        ))
        fake_client.raise_for_status = MagicMock()

        completed_ids = []
        failed_ids = []

        async def mock_complete(eid):
            completed_ids.append(eid)

        async def mock_failed(eid, err):
            failed_ids.append((eid, err))

        monkeypatch.setattr("orchestration.event_poller.get_client", AsyncMock(return_value=fake_client))
        monkeypatch.setattr("orchestration.event_poller.mark_event_complete", mock_complete)
        monkeypatch.setattr("orchestration.event_poller.mark_event_failed", mock_failed)

        await p._poll_once()

        assert completed_ids == []
        assert len(failed_ids) == 1
        assert failed_ids[0][0] == "evt-2"
        assert "video not found" in failed_ids[0][1]

    @pytest.mark.asyncio
    async def test_retry_flow(self, monkeypatch):
        retry_wf = MagicMock()
        call_count = 0

        async def flaky_execute(event):
            nonlocal call_count
            call_count += 1
            if call_count < 3:
                return WorkflowResult(success=False, message=f"attempt {call_count} failed")
            return WorkflowResult(success=True, message="ok on attempt 3")

        retry_wf.safe_execute = flaky_execute
        p = EventPoller({"cleanup.daily": retry_wf})

        completed_ids = []
        failed_ids = []

        async def mock_complete(eid):
            completed_ids.append(eid)

        async def mock_failed(eid, err):
            failed_ids.append(eid)

        monkeypatch.setattr("orchestration.event_poller.mark_event_complete", mock_complete)
        monkeypatch.setattr("orchestration.event_poller.mark_event_failed", mock_failed)

        for attempt in range(3):
            events_db = [{"id": "evt-retry", "eventType": "cleanup.daily", "payload": {}, "status": "pending"}]
            fake_client = AsyncMock()
            fake_client.get = AsyncMock(return_value=MagicMock(
                status_code=200,
                json=lambda e=events_db: {"events": e},
            ))
            fake_client.raise_for_status = MagicMock()
            monkeypatch.setattr("orchestration.event_poller.get_client", AsyncMock(return_value=fake_client))
            await p._poll_once()

        assert len(completed_ids) == 1
        assert len(failed_ids) == 2
        assert completed_ids[0] == "evt-retry"

    @pytest.mark.asyncio
    async def test_batch_processing(self, monkeypatch):
        wf = RecordingWorkflow()
        p = EventPoller({"cleanup.daily": wf})

        events_batch = [
            {"id": f"evt-{i}", "eventType": "cleanup.daily", "payload": {"max_age_days": 7}, "status": "pending"}
            for i in range(5)
        ]

        fake_client = AsyncMock()
        fake_client.get = AsyncMock(return_value=MagicMock(
            status_code=200,
            json=lambda: {"events": events_batch},
        ))
        fake_client.raise_for_status = MagicMock()

        monkeypatch.setattr("orchestration.event_poller.get_client", AsyncMock(return_value=fake_client))
        monkeypatch.setattr("orchestration.event_poller.mark_event_complete", AsyncMock())

        await p._poll_once()

        assert len(wf.events) == 5
        ids = [e.event_id for e in wf.events]
        assert "evt-0" in ids
        assert "evt-4" in ids

    @pytest.mark.asyncio
    async def test_unknown_event_type_auto_completes(self, monkeypatch):
        p = EventPoller({"cleanup.daily": RecordingWorkflow()})

        events_db = [
            {"id": "evt-weird", "eventType": "unknown.type", "payload": {}, "status": "pending"},
        ]

        fake_client = AsyncMock()
        fake_client.get = AsyncMock(return_value=MagicMock(
            status_code=200,
            json=lambda: {"events": events_db},
        ))
        fake_client.raise_for_status = MagicMock()

        completed_ids = []
        monkeypatch.setattr("orchestration.event_poller.get_client", AsyncMock(return_value=fake_client))
        monkeypatch.setattr("orchestration.event_poller.mark_event_complete", AsyncMock(side_effect=lambda eid: completed_ids.append(eid)))

        await p._poll_once()

        assert completed_ids == ["evt-weird"]
