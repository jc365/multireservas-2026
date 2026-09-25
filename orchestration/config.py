"""
@file config.py
@module orchestration/config
"""

import os
from pathlib import Path
from dotenv import load_dotenv

# Cargar variables desde .env
env_path = Path(__file__).parent / '.env'
load_dotenv(dotenv_path=env_path)

BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:3000")
BACKEND_API = f"{BACKEND_URL}/api/v1"
SEND_TOKEN = os.getenv("SEND_TOKEN", "")

UPLOADS_DIR = Path(os.getenv(
    "UPLOADS_DIR",
    str(Path(__file__).resolve().parent.parent / "backend" / "uploads" / "files"),
))

THUMBNAILS_DIR = UPLOADS_DIR.parent / "thumbnails"
THUMBNAILS_DIR.mkdir(parents=True, exist_ok=True)

WEBHOOK_HOST = os.getenv("ORCHESTRATION_HOST", "0.0.0.0")
WEBHOOK_PORT = int(os.getenv("ORCHESTRATOR_PORT", "8080"))
ORCH_RELOAD = os.getenv("ORCH_RELOAD", "true").lower() in ("1", "true", "yes")

CLEANUP_MAX_AGE_DAYS = int(os.getenv("CLEANUP_MAX_AGE_DAYS", "7"))

SMTP_HOST = os.getenv("SMTP_HOST", "")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASS = os.getenv("SMTP_PASS", "")
EMAIL_FROM = os.getenv("EMAIL_FROM", "noreply@example.com")

LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")
