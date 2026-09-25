"""
@file file_uploaded.py
@module orchestration.workflows.file_uploaded

Minimal workflow for file upload events. Logs the upload and
acknowledges it so the event-driven path is verifiable end-to-end.
Event type: file_uploaded
Payload: { item_id, file_key, uploaded_at, size, mimetype }
"""

import logging

from orchestration.workflows.base import BaseWorkflow, Event, WorkflowResult

logger = logging.getLogger(__name__)


class FileUploadedWorkflow(BaseWorkflow):
    event_type = "file_uploaded"

    async def execute(self, event: Event) -> WorkflowResult:
        payload = event.payload
        item_id = payload.get("item_id", "")
        file_key = payload.get("file_key", "")
        mimetype = payload.get("mimetype", "")

        logger.info(
            "File uploaded for item %s: key=%s mime=%s",
            item_id,
            file_key,
            mimetype,
        )

        return WorkflowResult(
            success=True,
            message=f"File upload acknowledged: {file_key}",
            data={
                "item_id": item_id,
                "file_key": file_key,
                "mimetype": mimetype,
            },
        )
