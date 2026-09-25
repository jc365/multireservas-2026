"""
@file cleanup.py
@module orchestration/workflows/cleanup
"""

import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path

from orchestration.config import CLEANUP_MAX_AGE_DAYS, UPLOADS_DIR
from orchestration.workflows.base import BaseWorkflow, Event, WorkflowResult

logger = logging.getLogger(__name__)

VIDEO_EXTENSIONS = {".mp4", ".webm", ".ogg", ".mov", ".avi", ".mkv"}


class CleanupWorkflow(BaseWorkflow):
    event_type = "cleanup.daily"

    async def execute(self, event: Event) -> WorkflowResult:
        max_age = timedelta(days=event.payload.get("max_age_days", CLEANUP_MAX_AGE_DAYS))
        cutoff = datetime.now(timezone.utc) - max_age
        deleted: list[str] = []
        errors: list[str] = []

        if not UPLOADS_DIR.exists():
            return WorkflowResult(success=True, message="Uploads directory does not exist")

        for entry in UPLOADS_DIR.iterdir():
            if not entry.is_file():
                continue
            if entry.name.startswith("."):
                continue
            if entry.suffix.lower() not in VIDEO_EXTENSIONS:
                continue

            mtime = datetime.fromtimestamp(entry.stat().st_mtime, tz=timezone.utc)
            if mtime < cutoff:
                try:
                    entry.unlink()
                    deleted.append(entry.name)
                    logger.info("Deleted old video: %s (mtime: %s)", entry.name, mtime.isoformat())
                except OSError as e:
                    errors.append(f"{entry.name}: {e}")
                    logger.error("Failed to delete %s: %s", entry.name, e)

        thumb_dir = UPLOADS_DIR.parent / "thumbnails"
        if thumb_dir.exists():
            for entry in thumb_dir.iterdir():
                if not entry.is_file():
                    continue
                if entry.name.startswith("."):
                    continue
                if entry.suffix.lower() not in {".jpg", ".jpeg", ".png"}:
                    continue
                mtime = datetime.fromtimestamp(entry.stat().st_mtime, tz=timezone.utc)
                if mtime < cutoff:
                    try:
                        entry.unlink()
                        deleted.append(entry.name)
                        logger.info("Deleted old thumb: %s (mtime: %s)", entry.name, mtime.isoformat())
                    except OSError as e:
                        errors.append(f"{entry.name}: {e}")
                        logger.error("Failed to delete %s: %s", entry.name, e)

        msg = f"Deleted {len(deleted)} files, {len(errors)} errors"
        logger.info(msg)
        return WorkflowResult(
            success=len(errors) == 0,
            message=msg,
            data={"deleted": deleted, "errors": errors},
        )
