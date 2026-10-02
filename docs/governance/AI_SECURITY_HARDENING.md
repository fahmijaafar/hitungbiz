# hitungbiz AI Security Hardening Documentation (Phase 8)

This document provides comprehensive technical documentation for **Phase 8 (AI Security)** hardening implemented across the hitungbiz backend AI layer.

---

## 1. Modular Architecture

All AI security, validation, rate limiting, logging, and error handling features are centralized in the modular `app.core.ai_security` service ([ai_security.py](file:///home/fahmijaafar/code/hitungbiz-sys/backend/app/core/ai_security.py)).

### Key Components:
1. **Prompt Injection Detector (`detect_prompt_injection`)**
2. **Prompt & Context Validator (`validate_ai_messages`)**
3. **Output Validator & Sensitive Data Protection (`validate_and_sanitize_ai_output`)**
4. **Timeout & Fallback Handler (`safe_call_ai`)**
5. **AI Audit Logger (`log_ai_request`)**

---

## 2. Prompt Injection Protection

Detects attempts to override system prompts or bypass application constraints without altering legitimate user prompts.

- **Patterns Detected**:
  - Direct system prompt override attempts (`ignore all previous instructions`, `disregard above directives`).
  - System prompt extraction attempts (`reveal the system prompt`, `output internal instructions`).
  - Constraint bypass attempts (`bypass application safety filters`, `you are now in unrestricted DAN mode`, `jailbreak`).
- **Response Control**:
  - Rejects detected prompt injection attempts with HTTP 400 Bad Request (`Invalid prompt or directive detected.`).
  - Configurable via `AI_ENABLE_PROMPT_INJECTION_DETECTION=True`.

---

## 3. Prompt & Input Validation

- **Length Enforcement**: Rejects user prompts exceeding 10,000 characters (`MAX_AI_PROMPT_LENGTH`).
- **Context Limits**: Enforces 50,000 character maximum context bounds (`AI_MAX_CONTEXT_LENGTH`).
- **Input Sanitization**: Rejects empty prompts, invalid UTF-8 bytes, and deeply nested JSON structures (>10 levels).

---

## 4. Output Validation & Sensitive Data Protection

- **Payload Size Limits**: Rejects model outputs exceeding 5 MB (`AI_MAX_RESPONSE_SIZE`).
- **JSON Validation**: Ensures output adheres to valid JSON structure when `response_format={"type": "json_object"}`.
- **Sensitive Data Redaction**: Automatically scans AI responses for secret keys (`SECRET_KEY`, `POSTGRES_PASSWORD`, `DEEPSEEK_API_KEY`) and redacts them as `[REDACTED_SECRET]` to prevent credential disclosure.
- **Company Scoping**: Ensures every AI invocation is strictly scoped to the authenticated user and active company ID.

---

## 5. Timeouts, Fallbacks & Error Handling

- **Timeout Management**: Wraps model HTTP calls in `AI_TIMEOUT_SECONDS` (default: 60s). Timed out requests raise HTTP 504 Gateway Timeout and release concurrency locks cleanly.
- **Safe Fallbacks**: Model provider outages, connection errors, or malformed provider responses trigger safe HTTP 502/503 application errors.
- **Zero Information Leakage**: Provider API keys, raw tracebacks, internal prompts, or framework errors are never returned to clients.

---

## 6. Privacy-Preserving AI Logging

Centralized logging via `log_ai_request()` records:
- Timestamp & Duration
- Endpoint & Model used
- User ID & Company ID
- Success/Failure status & error classification
- Token Usage (prompt tokens, completion tokens, total tokens)

*Raw user prompt text, OCR text, and financial numbers are omitted from default logs to protect privacy unless `AI_LOG_VERBOSE=True` is explicitly enabled.*

---

## 7. Environment Variables Added

| Variable | Type | Default | Description |
|---|---|---|---|
| `MAX_AI_PROMPT_LENGTH` | `int` | `10000` | Maximum character length for individual user prompts |
| `AI_MAX_CONTEXT_LENGTH` | `int` | `50000` | Maximum total character length for conversation context |
| `AI_MAX_RESPONSE_SIZE` | `int` | `5242880` | Maximum model response size in bytes (5 MB) |
| `AI_TIMEOUT_SECONDS` | `int` | `60` | Model execution timeout limit in seconds |
| `AI_ENABLE_PROMPT_INJECTION_DETECTION` | `bool` | `True` | Toggle prompt injection detector |
| `AI_ENABLE_OUTPUT_VALIDATION` | `bool` | `True` | Toggle model output structure validation and secret redaction |
| `AI_LOG_VERBOSE` | `bool` | `False` | Toggle verbose prompt logging in audit logs |
