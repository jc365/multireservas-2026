"""
@file logger.py
@module orchestration/utils/logger

Syncs the Python logging level with the backend Config table.
"""

import logging

from orchestration.utils.config import get_config

logger = logging.getLogger(__name__)

_last_level: str | None = None

LOG_LEVEL_MAP: dict[str, str] = {
    'debug': 'DEBUG',
    'info': 'INFO',
    'warn': 'WARNING',
    'warning': 'WARNING',
    'error': 'ERROR',
    'fatal': 'CRITICAL',
    'critical': 'CRITICAL',
    'trace': 'DEBUG',
}


def sync_log_level() -> None:
    """Read logging.level from Config cache and update the root logger."""
    global _last_level
    raw = get_config("logging.level", "INFO")
    level_name = LOG_LEVEL_MAP.get(str(raw).lower(), str(raw).upper())
    if level_name not in ("DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"):
        level_name = "INFO"

    if _last_level is not None and _last_level != level_name:
        print(f"🔄 [Config] Log level changed: {_last_level} → {level_name}")

    _last_level = level_name
    logging.getLogger().setLevel(getattr(logging, level_name, logging.INFO))
