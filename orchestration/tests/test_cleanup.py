"""
@file test_cleanup.py
@module orchestration/tests
"""

import os
import time
from datetime import datetime, timedelta, timezone

import pytest

from orchestration.workflows.base import Event
from orchestration.workflows.cleanup import CleanupWorkflow


@pytest.fixture
def workflow():
    return CleanupWorkflow()


def _make_file(path, name, days_old=0):
    path.mkdir(parents=True, exist_ok=True)
    f = path / name
    f.write_text("x")
    if days_old > 0:
        old_time = time.time() - (days_old * 86400)
        os.utime(f, (old_time, old_time))
    return f


class TestCleanupWorkflow:
    @pytest.mark.asyncio
    async def test_event_type(self, workflow):
        assert workflow.event_type == "cleanup.daily"

    @pytest.mark.asyncio
    async def test_missing_uploads_dir(self, workflow, monkeypatch, tmp_path):
        monkeypatch.setattr(
            "orchestration.workflows.cleanup.UPLOADS_DIR",
            tmp_path / "nonexistent",
        )
        event = Event(type="cleanup.daily", payload={})
        result = await workflow.execute(event)
        assert result.success
        assert "does not exist" in result.message

    @pytest.mark.asyncio
    async def test_deletes_old_videos(self, workflow, monkeypatch, tmp_path):
        uploads, thumbs = tmp_path / "videos", tmp_path / "thumbs"
        uploads.mkdir()
        thumbs.mkdir(parents=True)

        _make_file(uploads, "old.mp4", days_old=10)
        _make_file(uploads, "new.mp4", days_old=1)

        monkeypatch.setattr("orchestration.workflows.cleanup.UPLOADS_DIR", uploads)

        event = Event(type="cleanup.daily", payload={"max_age_days": 7})
        result = await workflow.execute(event)

        assert result.success
        assert "old.mp4" in result.data["deleted"]
        assert (uploads / "old.mp4").exists() is False
        assert (uploads / "new.mp4").exists() is True

    @pytest.mark.asyncio
    async def test_keeps_recent_videos(self, workflow, monkeypatch, tmp_path):
        uploads = tmp_path / "videos"
        uploads.mkdir()

        _make_file(uploads, "recent.mp4", days_old=2)
        _make_file(uploads, "today.mp4", days_old=0)

        monkeypatch.setattr("orchestration.workflows.cleanup.UPLOADS_DIR", uploads)

        event = Event(type="cleanup.daily", payload={"max_age_days": 7})
        result = await workflow.execute(event)

        assert result.success
        assert len(result.data["deleted"]) == 0
        assert (uploads / "recent.mp4").exists() is True
        assert (uploads / "today.mp4").exists() is True

    @pytest.mark.asyncio
    async def test_skips_hidden_files(self, workflow, monkeypatch, tmp_path):
        uploads = tmp_path / "videos"
        uploads.mkdir()

        _make_file(uploads, ".gitignore", days_old=30)
        _make_file(uploads, "video.mp4", days_old=10)

        monkeypatch.setattr("orchestration.workflows.cleanup.UPLOADS_DIR", uploads)

        event = Event(type="cleanup.daily", payload={"max_age_days": 7})
        result = await workflow.execute(event)

        assert result.success
        assert ".gitignore" not in result.data["deleted"]
        assert "video.mp4" in result.data["deleted"]
        assert (uploads / ".gitignore").exists() is True

    @pytest.mark.asyncio
    async def test_skips_non_video_files(self, workflow, monkeypatch, tmp_path):
        uploads = tmp_path / "videos"
        uploads.mkdir()

        _make_file(uploads, "notes.txt", days_old=30)
        _make_file(uploads, "video.mp4", days_old=10)

        monkeypatch.setattr("orchestration.workflows.cleanup.UPLOADS_DIR", uploads)

        event = Event(type="cleanup.daily", payload={"max_age_days": 7})
        result = await workflow.execute(event)

        assert result.success
        assert "notes.txt" not in result.data["deleted"]
        assert "video.mp4" in result.data["deleted"]

    @pytest.mark.asyncio
    async def test_deletes_old_thumbnails(self, workflow, monkeypatch, tmp_path):
        uploads = tmp_path / "videos"
        uploads.mkdir()
        thumbs = uploads.parent / "thumbnails"
        thumbs.mkdir()

        _make_file(thumbs, "old_thumb.jpg", days_old=10)
        _make_file(thumbs, "new_thumb.jpg", days_old=1)

        monkeypatch.setattr("orchestration.workflows.cleanup.UPLOADS_DIR", uploads)

        event = Event(type="cleanup.daily", payload={"max_age_days": 7})
        result = await workflow.execute(event)

        assert result.success
        assert "old_thumb.jpg" in result.data["deleted"]
        assert (thumbs / "old_thumb.jpg").exists() is False
        assert (thumbs / "new_thumb.jpg").exists() is True

    @pytest.mark.asyncio
    async def test_skips_directories(self, workflow, monkeypatch, tmp_path):
        uploads = tmp_path / "videos"
        uploads.mkdir()

        sub = uploads / "subdir"
        sub.mkdir()
        _make_file(uploads, "video.mp4", days_old=10)

        monkeypatch.setattr("orchestration.workflows.cleanup.UPLOADS_DIR", uploads)

        event = Event(type="cleanup.daily", payload={"max_age_days": 7})
        result = await workflow.execute(event)

        assert result.success
        assert sub.exists()

    @pytest.mark.asyncio
    async def test_default_max_age(self, workflow, monkeypatch, tmp_path):
        uploads = tmp_path / "videos"
        uploads.mkdir()

        _make_file(uploads, "video.mp4", days_old=10)

        monkeypatch.setattr("orchestration.workflows.cleanup.UPLOADS_DIR", uploads)
        monkeypatch.setattr("orchestration.workflows.cleanup.CLEANUP_MAX_AGE_DAYS", 7)

        event = Event(type="cleanup.daily", payload={})
        result = await workflow.execute(event)

        assert result.success
        assert "video.mp4" in result.data["deleted"]
