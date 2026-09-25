"""
@file r2_monitor.py
@module orchestration/workflows/r2_monitor

Workflow to monitor Cloudflare R2 storage usage and send alerts when threshold exceeded.
Uses Cloudflare REST API with Bearer token (no boto3/S3 credentials).
"""

import logging
import os
from typing import Any

import httpx

from orchestration.utils.config import get_config
from orchestration.utils.email_client import EmailClient
from orchestration.workflows.base import BaseWorkflow, Event, WorkflowResult

logger = logging.getLogger(__name__)


class R2MonitorWorkflow(BaseWorkflow):
    """Monitors R2 bucket size and sends alerts if threshold exceeded."""

    event_type = "r2.monitor"

    async def execute(self, event: Event) -> WorkflowResult:
        threshold_gb = float(get_config("integrations.r2_threshold_gb", 7.0))
        notify_email = get_config("integrations.r2_notify_email", "admin@demo.com")

        try:
            size_bytes = await self._get_r2_size()
            size_gb = size_bytes / (1024 * 1024 * 1024)

            logger.info("R2 bucket size: %.2f GB (threshold: %.2f GB)", size_gb, threshold_gb)

            if size_gb > threshold_gb:
                await self._send_alert(notify_email, size_gb, threshold_gb)
                return WorkflowResult(
                    success=True,
                    message=f"Alert sent: R2 usage {size_gb:.2f} GB exceeds threshold {threshold_gb:.2f} GB",
                    data={"alert_sent": True, "size_gb": size_gb, "threshold_gb": threshold_gb},
                )

            return WorkflowResult(
                success=True,
                message=f"R2 usage {size_gb:.2f} GB is within threshold {threshold_gb:.2f} GB",
                data={"alert_sent": False, "size_gb": size_gb, "threshold_gb": threshold_gb},
            )
        except Exception as e:
            logger.exception("R2 monitor workflow failed")
            return WorkflowResult(success=False, message=f"R2 monitor failed: {e}")

    async def _get_r2_size(self) -> int:
        """Get total size of R2 bucket in bytes using Cloudflare REST API."""
        # 1. tabla Config del backend
        account_id = get_config("cloudflare_account_id")
        bucket_name = get_config("cloudflare_r2_bucket")
        api_token = get_config("cloudflare_api_token")

        # 2. variables de entorno (fallback)
        account_id = account_id or os.getenv("CLOUDFLARE_ACCOUNT_ID")
        bucket_name = bucket_name or os.getenv("CLOUDFLARE_R2_BUCKET")
        api_token = api_token or os.getenv("CLOUDFLARE_API_TOKEN")

        if not all([account_id, bucket_name, api_token]):
            missing = []
            if not account_id:
                missing.append("cloudflare_account_id / CLOUDFLARE_ACCOUNT_ID")
            if not bucket_name:
                missing.append("cloudflare_r2_bucket / CLOUDFLARE_R2_BUCKET")
            if not api_token:
                missing.append("cloudflare_api_token / CLOUDFLARE_API_TOKEN")
            raise ValueError(f"R2 configuration incomplete — missing: {', '.join(missing)}")

        logger.info("R2 Account ID: %s", account_id)
        logger.info("R2 Bucket: %s", bucket_name)

        url = f"https://api.cloudflare.com/client/v4/accounts/{account_id}/r2/buckets/{bucket_name}/objects"

        total_size = 0
        cursor = None
        page_count = 0

        async with httpx.AsyncClient() as client:
            while True:
                params: dict[str, str] = {}
                if cursor:
                    params["cursor"] = cursor

                response = await client.get(
                    url,
                    params=params,
                    headers={"Authorization": f"Bearer {api_token}"},
                )
                response.raise_for_status()
                data = response.json()

                if not data.get("success"):
                    errors = data.get("errors", [])
                    raise Exception(f"Cloudflare API error: {errors}")

                page_count += 1
                objects = data.get("result", [])
                page_size = sum(obj.get("size", 0) for obj in objects)
                total_size += page_size

                logger.debug(
                    "R2 page %d: %d objects, %d bytes",
                    page_count, len(objects), page_size,
                )

                cursor = data.get("result_info", {}).get("cursor")
                if not cursor:
                    break

        logger.info(
            "R2 total size: %d bytes (%.2f GB) across %d pages",
            total_size, total_size / (1024 * 1024 * 1024), page_count,
        )
        return total_size

    async def _send_alert(self, email: str, size_gb: float, threshold_gb: float) -> None:
        """Send alert email about R2 threshold exceeded."""
        subject = f"R2 Storage Alert: {size_gb:.2f} GB used"
        body = (
            f"Alert: Cloudflare R2 bucket has exceeded the configured threshold.\n\n"
            f"Current usage: {size_gb:.2f} GB\n"
            f"Threshold: {threshold_gb:.2f} GB\n\n"
            f"Please review and clean up old files if necessary.\n\n"
            f"— Events Starter Orchestrator"
        )

        email_client = EmailClient()
        sent = await email_client.send_email(to=email, subject=subject, body=body)
        if not sent:
            logger.warning("R2 alert email failed to send to %s", email)
