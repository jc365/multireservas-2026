# Orchestration — Event-Driven Workflows

Python/FastAPI service for event-driven workflows. Runs on port `8080`.

## Stack

- Python 3.10+, FastAPI, uvicorn, httpx, ffmpeg (system)
- No additional dependencies beyond `requirements.txt`

## Start

```bash
cd orchestration && source venv/bin/activate
python -m orchestration.main
```

## Supported Event Types

| Event Type | Workflow | Payload | Description |
|-----------|----------|---------|-------------|
| `item.created` | `FileProcessorWorkflow` | `{ item_id, file_url, mime_type }` | Processes uploaded files. For video files: extracts metadata (ffprobe) and generates thumbnail (ffmpeg). Non-video files skipped. |
| `file_uploaded` | `FileUploadedWorkflow` | `{ item_id, file_key, uploaded_at, size, mimetype }` | Acknowledges a file upload from the backend (`UploadItemFileUseCase`). Minimal workflow — logs and returns OK. |
| `item.reviewed` | `NotificationWorkflow` | `{ item_id, user_id, score, feedback }` | Sends notification email to user when their item is reviewed. |
| `cleanup.daily` | `CleanupWorkflow` | `{ max_age_days? }` | Deletes files older than N days from uploads and thumbnails directories. |
| `r2.monitor` | `R2MonitorWorkflow` | `{}` | Monitors Cloudflare R2 bucket size, sends alert email if threshold exceeded. |
| `test.email` | `TestEmailWorkflow` | `{ to? }` | Sends test email via configured provider. |

## Webhooks (POST)

```
POST /webhook/{event_type}
```

Queues the workflow as a background task. Returns `{ status, event_id, workflow }`.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check + workflow names |
| `GET` | `/workflows` | List registered workflows with event types |
| `GET` | `/webhook/r2.monitor` | Manual trigger for R2 monitor |

## Service Token Auth

Orchestrator sends `SEND_TOKEN` in `Authorization: Bearer` header. Backend validates against `ADMIT_TOKENS` env var. No JWT required for service-to-service calls.

## Config

`.env` in `orchestration/` (see `.env.example`). Key variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `BACKEND_URL` | `http://localhost:3000` | Backend base URL |
| `SEND_TOKEN` | — | Service token for backend auth |
| `UPLOADS_DIR` | `../backend/uploads/files` | Local uploads directory |
| `WEBHOOK_PORT` | `8080` | Orchestration server port |
| `EMAIL_PROVIDER` | `console` | Email provider (console/resend/smtp) |
| `CLEANUP_MAX_AGE_DAYS` | `7` | Default max age for cleanup |

## How to Add a New Workflow

1. Create file in `orchestration/workflows/your_workflow.py`
2. Extend `BaseWorkflow` with `event_type` property and `execute()` method
3. Register in `orchestration/webhooks/server.py` WORKFLOWS dict
4. Add webhook endpoint if manual trigger needed

Example:

```python
from orchestration.workflows.base import BaseWorkflow, Event, WorkflowResult

class MyWorkflow(BaseWorkflow):
    event_type = "my.event.type"

    async def execute(self, event: Event) -> WorkflowResult:
        # Your logic here
        return WorkflowResult(success=True, message="Done")
```

## Testing

```bash
cd orchestration && source venv/bin/activate
PYTHONPATH=.. pytest tests/ -v          # Run all orchestration tests
PYTHONPATH=.. pytest tests/test_cleanup.py -v  # Run specific file
```

- Framework: pytest + pytest-asyncio
- Unit tests: `tests/test_notifications.py`, `tests/test_cleanup.py`, `tests/test_event_poller.py`
- Integration tests: `tests/test_integration.py`
- All mocked (no backend required)
