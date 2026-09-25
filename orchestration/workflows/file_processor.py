"""
@file file_processor.py
@module orchestration/workflows.file_processor

Processes uploaded files. For video files, extracts metadata (ffprobe)
and generates a thumbnail (ffmpeg). Non-video files are skipped.
"""

import asyncio
import json
import logging
import subprocess
from pathlib import Path

from orchestration.config import UPLOADS_DIR, THUMBNAILS_DIR
from orchestration.utils.backend_client import patch_item_metadata
from orchestration.workflows.base import BaseWorkflow, Event, WorkflowResult

logger = logging.getLogger(__name__)

VIDEO_MIME_PREFIXES = ("video/",)


def _video_metadata(video_path: str) -> dict:
    cmd = [
        "ffprobe", "-v", "quiet", "-print_format", "json",
        "-show_format", "-show_streams", video_path,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
    if result.returncode != 0:
        raise RuntimeError(f"ffprobe failed: {result.stderr}")
    return json.loads(result.stdout)


def _generate_thumbnail(video_path: str, thumbnail_path: str, time_sec: int = 5) -> None:
    cmd = [
        "ffmpeg", "-y", "-ss", str(time_sec), "-i", video_path,
        "-vframes", "1", "-q:v", "2", thumbnail_path,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg thumbnail failed: {result.stderr}")


class FileProcessorWorkflow(BaseWorkflow):
    event_type = "item.created"

    async def execute(self, event: Event) -> WorkflowResult:
        payload = event.payload
        item_id = payload.get("item_id", "")
        file_url = payload.get("file_url", "")
        mime_type = payload.get("mime_type", "")

        if not file_url.startswith("/uploads/"):
            return WorkflowResult(
                success=True,
                message="External URL — skipped local processing",
            )

        if not any(mime_type.startswith(p) for p in VIDEO_MIME_PREFIXES):
            logger.info("Skipping non-video file (mime=%s) for item %s", mime_type, item_id)
            return WorkflowResult(
                success=True,
                message=f"Non-video file ({mime_type}) — skipped",
            )

        file_path = UPLOADS_DIR / file_url.removeprefix("/uploads/files/")

        if not file_path.exists():
            return WorkflowResult(success=False, message=f"File not found: {file_path}")

        loop = asyncio.get_running_loop()
        metadata = await loop.run_in_executor(None, _video_metadata, str(file_path))

        format_info = metadata.get("format", {})
        duration = float(format_info.get("duration", 0))
        size = int(format_info.get("size", 0))

        video_stream = next(
            (s for s in metadata.get("streams", []) if s.get("codec_type") == "video"), {}
        )
        width = int(video_stream.get("width", 0))
        height = int(video_stream.get("height", 0))

        thumbnail_name = f"{file_path.stem}.jpg"
        thumbnail_path = THUMBNAILS_DIR / thumbnail_name
        await loop.run_in_executor(
            None, _generate_thumbnail, str(file_path), str(thumbnail_path), 5
        )

        logger.info(
            "Processed video %s: %dx%d, %.1fs, %d bytes",
            item_id, width, height, duration, size,
        )

        await patch_item_metadata(item_id, {
            "duration": round(duration, 2),
            "width": width,
            "height": height,
            "size": size,
            "thumbnail": f"/uploads/thumbnails/{thumbnail_name}",
        })

        return WorkflowResult(
            success=True,
            message=f"Video processed: {width}x{height}, {duration:.1f}s",
            data={"duration": duration, "width": width, "height": height, "size": size},
        )
