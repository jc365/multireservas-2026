"""
@file event_poller.py
@module orchestration/event_poller

Polls the backend for pending events and dispatches them to workflows.
Runs as a background task in the FastAPI server.
"""

import asyncio
import logging
from typing import Any

from orchestration.utils.backend_client import (
    get_client,
    mark_event_complete,
    mark_event_failed,
)
from orchestration.workflows.base import Event, WorkflowResult

logger = logging.getLogger(__name__)

POLL_INTERVAL = 30
MAX_EVENTS = 10
MAX_BACKOFF = 300  # 5 minutes


class EventPoller:
    def __init__(self, workflows: dict[str, Any]):
        self.workflows = workflows
        self._running = False
        self._task: asyncio.Task | None = None
        self._backoff = POLL_INTERVAL

    async def start(self):
        if self._running:
            return
        self._running = True
        self._task = asyncio.create_task(self._poll_loop())
        logger.info("Event poller started (interval=%ds)", POLL_INTERVAL)

    async def stop(self):
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        logger.info("Event poller stopped")

    async def _poll_loop(self):
        while self._running:
            try:
                await self._poll_once()
                self._backoff = POLL_INTERVAL
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.warning("Poll cycle failed: %s", e)
                self._backoff = min(self._backoff * 2, MAX_BACKOFF)
                logger.debug("Backoff increased to %ds", self._backoff)
            await asyncio.sleep(self._backoff)

    async def _poll_once(self):
        client = await get_client()
        resp = await client.get("/events/pending", params={"limit": MAX_EVENTS})
        resp.raise_for_status()

        events = resp.json().get("events", [])
        if not events:
            return

        logger.debug("Found %d pending events", len(events))

        for ev in events:
            await self._process_event(ev)

    async def _process_event(self, raw: dict):
        event_type = raw.get("eventType", "")
        event_id = raw.get("id", "")
        payload = raw.get("payload", {})

        workflow = self.workflows.get(event_type)
        if not workflow:
            logger.warning("No workflow for event type: %s (event %s)", event_type, event_id)
            await mark_event_complete(event_id)
            return

        event = Event(type=event_type, payload=payload, event_id=event_id)

        try:
            result = await workflow.safe_execute(event)
            if result.success:
                await mark_event_complete(event_id)
                logger.debug("Event %s processed successfully", event_id)
            else:
                await mark_event_failed(event_id, result.message)
                logger.warning("Event %s failed: %s", event_id, result.message)
        except Exception as e:
            await mark_event_failed(event_id, str(e))
            logger.exception("Event %s raised exception", event_id)
