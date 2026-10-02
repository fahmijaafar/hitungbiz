import logging
import time
from typing import Any

from fastapi import HTTPException, status

from app.core.config import settings

logger = logging.getLogger("app.ai_audit")


def check_json_nesting_depth(data: Any, max_depth: int = 10, current_depth: int = 1) -> None:
    """Ensure JSON payloads do not exceed maximum nesting depth limits."""
    if current_depth > max_depth:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="JSON payload nesting depth exceeds allowable limit.",
        )
    if isinstance(data, dict):
        for val in data.values():
            check_json_nesting_depth(val, max_depth, current_depth + 1)
    elif isinstance(data, list):
        for item in data:
            check_json_nesting_depth(item, max_depth, current_depth + 1)


def validate_ai_prompt(prompt: str | None) -> str:
    """Validates prompt size, non-emptiness, and structure for AI endpoints."""
    if not prompt or not prompt.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Prompt text cannot be empty.",
        )

    cleaned = prompt.strip()
    if len(cleaned) > settings.MAX_AI_PROMPT_LENGTH:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Prompt length exceeds maximum limit of {settings.MAX_AI_PROMPT_LENGTH} characters.",
        )

    return cleaned


def log_ai_request(
    user_id: str,
    endpoint: str,
    company_id: str | None,
    duration_seconds: float,
    success: bool,
    model_name: str | None = None,
    token_usage: dict[str, int] | None = None,
    error_message: str | None = None,
) -> None:
    """Structured, privacy-preserving AI request logger.

    Omits full prompts and response text to protect sensitive financial data.
    """
    model_used = model_name or settings.DEEPSEEK_MODEL
    tokens = token_usage or {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}

    log_entry = {
        "event": "ai_request_completed" if success else "ai_request_failed",
        "user_id": user_id,
        "company_id": company_id or "N/A",
        "endpoint": endpoint,
        "duration_seconds": round(duration_seconds, 3),
        "model": model_used,
        "success": success,
        "tokens": tokens,
    }

    if error_message:
        log_entry["error"] = error_message

    if success:
        logger.info(
            "AI Request: user=%s company=%s endpoint=%s duration=%.3fs model=%s success=%s tokens=%s",
            user_id,
            company_id or "N/A",
            endpoint,
            duration_seconds,
            model_used,
            success,
            tokens,
        )
    else:
        logger.warning(
            "AI Request Failed: user=%s company=%s endpoint=%s duration=%.3fs model=%s error=%s",
            user_id,
            company_id or "N/A",
            endpoint,
            duration_seconds,
            model_used,
            error_message,
        )
