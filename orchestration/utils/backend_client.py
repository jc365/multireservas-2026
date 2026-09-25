"""
@file backend_client.py
@module orchestration/utils/backend_client
"""

import logging
from typing import Any

import httpx

from orchestration.config import BACKEND_API, SEND_TOKEN

logger = logging.getLogger(__name__)

_client: httpx.AsyncClient | None = None


def _default_headers() -> dict[str, str]:
    headers: dict[str, str] = {}
    if SEND_TOKEN:
        headers["Authorization"] = f"Bearer {SEND_TOKEN}"
    return headers


async def get_client() -> httpx.AsyncClient:
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(
            base_url=BACKEND_API,
            timeout=30.0,
            headers=_default_headers(),
        )
    return _client


async def close_client():
    global _client
    if _client and not _client.is_closed:
        await _client.aclose()
        _client = None


async def patch_item_metadata(item_id: str, data: dict[str, Any]) -> dict:
    client = await get_client()
    resp = await client.patch(f"/items/{item_id}", json=data)
    resp.raise_for_status()
    logger.info("Updated metadata for item %s", item_id)
    return resp.json()


async def get_item(item_id: str) -> dict:
    client = await get_client()
    resp = await client.get(f"/items/{item_id}")
    resp.raise_for_status()
    return resp.json()


async def get_user(user_id: str) -> dict:
    client = await get_client()
    resp = await client.get(f"/users/{user_id}")
    resp.raise_for_status()
    return resp.json()


async def mark_event_complete(event_id: str) -> None:
    client = await get_client()
    resp = await client.patch(f"/events/{event_id}/complete")
    resp.raise_for_status()
    logger.info("Event %s marked complete", event_id)


async def mark_event_failed(event_id: str, error: str) -> None:
    client = await get_client()
    resp = await client.patch(f"/events/{event_id}/fail", json={"error": error})
    resp.raise_for_status()
    logger.info("Event %s marked failed: %s", event_id, error)
