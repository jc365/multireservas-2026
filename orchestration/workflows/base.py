"""
@file base.py
@module orchestration/workflows/base
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any
import logging

logger = logging.getLogger(__name__)


@dataclass
class Event:
    type: str
    payload: dict[str, Any]
    timestamp: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    event_id: str = ""


@dataclass
class WorkflowResult:
    success: bool
    message: str
    data: dict[str, Any] = field(default_factory=dict)


class BaseWorkflow(ABC):
    @property
    @abstractmethod
    def event_type(self) -> str:
        ...

    @abstractmethod
    async def execute(self, event: Event) -> WorkflowResult:
        ...

    async def safe_execute(self, event: Event) -> WorkflowResult:
        try:
            logger.info("Starting workflow %s for event %s", self.event_type, event.event_id)
            result = await self.execute(event)
            logger.info("Workflow %s completed: %s", self.event_type, result.message)
            return result
        except Exception as e:
            logger.exception("Workflow %s failed", self.event_type)
            return WorkflowResult(success=False, message=str(e))
