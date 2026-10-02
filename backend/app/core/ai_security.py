import json
import logging
import re
import time
from typing import Any

import httpx
from fastapi import HTTPException, status

from app.core.ai_logger import check_json_nesting_depth, log_ai_request
from app.core.config import settings
from app.core.rate_limiter import check_tier4_ai_limit, limiter

logger = logging.getLogger("app.ai_security")

PROMPT_INJECTION_PATTERNS = [
    re.compile(r"ignore\s+(all\s+)?(previous|above)\s+(instructions|directives|rules|prompts)", re.IGNORECASE),
    re.compile(r"disregard\s+(all\s+)?(previous|above)", re.IGNORECASE),
    re.compile(r"reveal\s+(the\s+)?(system|hidden|internal)\s+(prompt|instructions)", re.IGNORECASE),
    re.compile(r"show\s+(me\s+)?(the\s+)?(system|hidden|internal)\s+(prompt|instructions)", re.IGNORECASE),
    re.compile(r"output\s+(the\s+)?(system|hidden|internal)\s+(prompt|instructions)", re.IGNORECASE),
    re.compile(r"print\s+(the\s+)?(system|hidden|internal)\s+(prompt|instructions)", re.IGNORECASE),
    re.compile(r"bypass\s+([a-z\s]+)?(restrictions|rules|filters|safety|guardrails)", re.IGNORECASE),
    re.compile(r"you\s+are\s+now\s+(in|operating\s+as|unrestricted|god\s+mode|dan\b)", re.IGNORECASE),
    re.compile(r"\bjailbreak\b", re.IGNORECASE),
]


def detect_prompt_injection(text: str) -> tuple[bool, str | None]:
    """Lightweight prompt injection detector.

    Returns (is_injection_detected, matched_pattern).
    """
    if not settings.AI_ENABLE_PROMPT_INJECTION_DETECTION or not text:
        return False, None

    for pattern in PROMPT_INJECTION_PATTERNS:
        match = pattern.search(text)
        if match:
            return True, match.group(0)

    return False, None


def validate_ai_messages(messages: list[dict[str, str]]) -> list[dict[str, str]]:
    """Validates prompt text, prompt injection, and total context length for AI request messages."""
    if not messages:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="AI request messages payload cannot be empty.",
        )

    total_context_len = 0
    validated_messages: list[dict[str, str]] = []

    for msg in messages:
        content = (msg.get("content") or "").strip()
        role = msg.get("role", "user")

        if not content:
            continue

        if len(content) > settings.MAX_AI_PROMPT_LENGTH:
            logger.warning("Prompt content exceeded max length limit: %d", len(content))
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Prompt content exceeds maximum allowed length of {settings.MAX_AI_PROMPT_LENGTH} characters.",
            )

        # Check prompt injection only on user role inputs
        if role == "user":
            is_injection, matched = detect_prompt_injection(content)
            if is_injection:
                logger.warning("Rejected prompt injection attempt matching pattern '%s'", matched)
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid prompt or directive detected.",
                )

        total_context_len += len(content)
        validated_messages.append({"role": role, "content": content})

    if total_context_len > settings.AI_MAX_CONTEXT_LENGTH:
        logger.warning("Total AI context length %d exceeds max limit %d", total_context_len, settings.AI_MAX_CONTEXT_LENGTH)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Total conversation context exceeds allowable limit of {settings.AI_MAX_CONTEXT_LENGTH} characters.",
        )

    return validated_messages


def validate_and_sanitize_ai_output(response_text: str, expected_json: bool = True) -> Any:
    """Validates AI model response for UTF-8 integrity, size limits, JSON structure, and redacts secret keys."""
    if not settings.AI_ENABLE_OUTPUT_VALIDATION:
        if expected_json:
            return json.loads(response_text)
        return response_text

    if len(response_text) > settings.AI_MAX_RESPONSE_SIZE:
        logger.error("AI response size %d exceeded max allowed size of %d", len(response_text), settings.AI_MAX_RESPONSE_SIZE)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="AI response exceeded allowable payload size limit.",
        )

    # Redact any accidental secret/key leakage
    sanitized_text = response_text
    secrets_to_redact = [
        settings.SECRET_KEY,
        settings.POSTGRES_PASSWORD,
        settings.DEEPSEEK_API_KEY,
    ]
    for secret in secrets_to_redact:
        if secret and len(secret) > 4 and secret in sanitized_text:
            logger.critical("ALERT: Redacted secret key from AI response output")
            sanitized_text = sanitized_text.replace(secret, "[REDACTED_SECRET]")

    if expected_json:
        try:
            parsed = json.loads(sanitized_text)
            check_json_nesting_depth(parsed, max_depth=10)
            return parsed
        except json.JSONDecodeError:
            logger.error("AI returned malformed non-JSON payload: %s", sanitized_text[:200])
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="AI service returned malformed JSON response.",
            )

    return sanitized_text


async def safe_call_ai(
    messages: list[dict[str, str]],
    user_id: str,
    company_id: str | None,
    endpoint: str,
    temperature: float = 0.2,
    response_format: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Centralized, secure entrypoint for all AI model invocations.

    Includes rate limiting, concurrency locks, prompt injection detection,
    timeout handling, output validation, sensitive data redaction, and audit logging.
    """
    if not settings.ai_summary_enabled:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI service is not configured. Set DEEPSEEK_API_KEY.",
        )

    # 1. Rate Limit & Concurrency Locks
    check_tier4_ai_limit(user_id=user_id, company_id=company_id)
    limiter.acquire_ai_concurrency(user_id)
    start_time = time.time()

    try:
        # 2. Input Validation & Prompt Injection Detection
        validated_messages = validate_ai_messages(messages)

        payload: dict[str, Any] = {
            "model": settings.DEEPSEEK_MODEL,
            "messages": validated_messages,
            "temperature": temperature,
            "stream": False,
        }
        if response_format:
            payload["response_format"] = response_format

        headers = {
            "Authorization": f"Bearer {settings.DEEPSEEK_API_KEY}",
            "Content-Type": "application/json",
        }
        url = f"{settings.DEEPSEEK_BASE_URL.rstrip('/')}/chat/completions"

        # 3. Model Invocation with Timeout Safeguards
        async with httpx.AsyncClient(timeout=float(settings.AI_TIMEOUT_SECONDS), trust_env=False) as client:
            resp = await client.post(url, headers=headers, json=payload)

        if resp.status_code != 200:
            logger.warning("AI provider error HTTP %d: %s", resp.status_code, resp.text[:200])
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="AI provider service returned an error. Please try again later.",
            )

        data = resp.json()
        try:
            raw_content = data["choices"][0]["message"]["content"]
        except (KeyError, IndexError):
            logger.error("Unexpected AI provider schema: %s", str(data)[:200])
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Unexpected response structure from AI provider.",
            )

        # Extract token usage metadata if provided
        token_usage = data.get("usage")

        # 4. Output Validation & Sensitive Data Redaction
        expected_json = bool(response_format and response_format.get("type") == "json_object")
        parsed_result = validate_and_sanitize_ai_output(raw_content, expected_json=expected_json)

        # 5. Audit Logging
        log_ai_request(
            user_id=user_id,
            company_id=company_id,
            endpoint=endpoint,
            duration_seconds=time.time() - start_time,
            success=True,
            model_name=settings.DEEPSEEK_MODEL,
            token_usage=token_usage,
        )

        return parsed_result if isinstance(parsed_result, dict) else {"content": parsed_result}

    except httpx.TimeoutException:
        logger.error("AI request timed out after %d seconds for user %s", settings.AI_TIMEOUT_SECONDS, user_id)
        log_ai_request(
            user_id=user_id,
            company_id=company_id,
            endpoint=endpoint,
            duration_seconds=time.time() - start_time,
            success=False,
            error_message="Request timeout",
        )
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="AI service request timed out. Please try again later.",
        )
    except HTTPException as http_exc:
        log_ai_request(
            user_id=user_id,
            company_id=company_id,
            endpoint=endpoint,
            duration_seconds=time.time() - start_time,
            success=False,
            error_message=http_exc.detail,
        )
        raise http_exc
    except Exception as exc:
        logger.error("Unhandled error during AI execution: %s", str(exc), exc_info=True)
        log_ai_request(
            user_id=user_id,
            company_id=company_id,
            endpoint=endpoint,
            duration_seconds=time.time() - start_time,
            success=False,
            error_message="Internal error",
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An error occurred while processing the AI request.",
        )
    finally:
        limiter.release_ai_concurrency(user_id)
