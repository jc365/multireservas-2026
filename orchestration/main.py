"""
@file main.py
@module orchestration
Entry point for the Events Starter orchestration server.

Usage:
    python -m orchestration.main
    # or
    python main.py (from orchestration/)
"""

import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from orchestration.config import ORCHESTRATOR_HOST, ORCHESTRATOR_PORT, LOG_LEVEL, ORCH_RELOAD


def main():
    logging.basicConfig(
        level=getattr(logging, LOG_LEVEL, logging.INFO),
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    logging.getLogger("httpx").setLevel(logging.WARNING)

    import uvicorn
    uvicorn.run(
        "orchestration.webhooks.server:app",
        host=ORCHESTRATOR_HOST,
        port=ORCHESTRATOR_PORT,
        reload=ORCH_RELOAD,
        log_level=LOG_LEVEL.lower(),
    )


if __name__ == "__main__":
    main()
