"""
@file conftest.py
@module orchestration/tests
"""

import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))


@pytest.fixture
def mock_backend_client(monkeypatch):
    mock = AsyncMock()
    monkeypatch.setattr("orchestration.utils.backend_client.get_user", mock.get_user)
    monkeypatch.setattr("orchestration.utils.backend_client.mark_event_complete", mock.mark_event_complete)
    monkeypatch.setattr("orchestration.utils.backend_client.mark_event_failed", mock.mark_event_failed)
    return mock


@pytest.fixture
def sample_review_event():
    from orchestration.workflows.base import Event

    return Event(
        type="item.reviewed",
        payload={
            "item_id": "item-test-001",
            "user_id": "usr-user-001",
            "score": 8,
            "feedback": "Great work!",
        },
        event_id="evt-review-001",
    )


@pytest.fixture
def sample_cleanup_event():
    from orchestration.workflows.base import Event

    return Event(
        type="cleanup.daily",
        payload={"max_age_days": 7},
        event_id="evt-cleanup-001",
    )


@pytest.fixture
def tmp_uploads(tmp_path):
    uploads = tmp_path / "uploads" / "files"
    uploads.mkdir(parents=True)
    thumbnails = tmp_path / "uploads" / "thumbnails"
    thumbnails.mkdir(parents=True)
    return uploads, thumbnails
