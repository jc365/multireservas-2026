"""
@file config.py
@module orchestration/utils/config

Client-side config cache that polls the backend /config endpoint.
Reloads every 60 seconds automatically.
"""

import asyncio
import logging
from typing import Any

from orchestration.utils.backend_client import get_client

logger = logging.getLogger(__name__)

RELOAD_INTERVAL = 60

_cache: dict[str, Any] = {}
_loaded = False
_task: asyncio.Task | None = None


async def load_config() -> None:
    """Fetch all config entries from the backend and populate the cache."""
    global _cache, _loaded
    try:
        client = await get_client()
        resp = await client.get("/config")
        resp.raise_for_status()
        rows = resp.json()
        _cache = {row["key"]: row["value"] for row in rows}
        _loaded = True
        logger.debug("Config reloaded from backend: %d entries", len(_cache))
    except Exception as e:
        if _loaded:
            logger.warning("Failed to reload config from backend: %s", e)
        else:
            logger.warning("Config not loaded yet (backend may be starting): %s", e)


def get_config(key: str, default: Any = None) -> Any:
    """Return the cached value for *key*, or *default* if not found."""
    return _cache.get(key, default)


async def _reload_loop() -> None:
    """Background loop that reloads config every RELOAD_INTERVAL seconds."""
    from orchestration.utils.logger import sync_log_level
    while True:
        await asyncio.sleep(RELOAD_INTERVAL)
        await load_config()
        sync_log_level()


def start_auto_reload() -> None:
    """Start the background reload task (call once at startup)."""
    global _task
    if _task is not None:
        return

    async def _init() -> None:
        await load_config()
        loop = asyncio.get_event_loop()
        loop.create_task(_reload_loop())

    # Schedule initial load + loop start via a task
    loop = asyncio.get_event_loop()
    loop.create_task(_init())


def stop_auto_reload() -> None:
    """Cancel the background reload task."""
    global _task
    if _task is not None:
        _task.cancel()
        _task = None
