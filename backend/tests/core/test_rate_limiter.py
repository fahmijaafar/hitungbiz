import pytest
from fastapi import HTTPException

from app.core.rate_limiter import InMemoryRateLimiter


def test_in_memory_rate_limiter_basic() -> None:
    limiter = InMemoryRateLimiter()

    # Allowed within limit
    for _ in range(5):
        limiter.check_rate_limit(key="test:user1", max_requests=5, window_seconds=60, bypass_test_check=True)

    # 6th request triggers HTTPException 429
    with pytest.raises(HTTPException) as exc_info:
        limiter.check_rate_limit(key="test:user1", max_requests=5, window_seconds=60, bypass_test_check=True)

    assert exc_info.value.status_code == 429
    assert "Too many requests" in exc_info.value.detail


def test_login_failure_throttling() -> None:
    limiter = InMemoryRateLimiter()

    for _ in range(4):
        limiter.record_login_failure("192.168.1.100", bypass_test_check=True)

    with pytest.raises(HTTPException) as exc_info:
        limiter.record_login_failure("192.168.1.100", bypass_test_check=True)

    assert exc_info.value.status_code == 429
    assert "failed login" in exc_info.value.detail.lower()


def test_ai_concurrency_limiter() -> None:
    limiter = InMemoryRateLimiter()

    limiter.acquire_ai_concurrency("user123", bypass_test_check=True)
    limiter.acquire_ai_concurrency("user123", bypass_test_check=True)

    with pytest.raises(HTTPException) as exc_info:
        limiter.acquire_ai_concurrency("user123", bypass_test_check=True)

    assert exc_info.value.status_code == 429
    assert "concurrent" in exc_info.value.detail.lower()

    limiter.release_ai_concurrency("user123", bypass_test_check=True)
    # Now acquiring should succeed
    limiter.acquire_ai_concurrency("user123", bypass_test_check=True)
