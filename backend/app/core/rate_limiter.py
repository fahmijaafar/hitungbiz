import sys
import time
from collections import defaultdict
from dataclasses import dataclass, field
from threading import Lock

from fastapi import HTTPException, Request, status

from app.core.config import settings


@dataclass
class RateLimitWindow:
    timestamps: list[float] = field(default_factory=list)


class InMemoryRateLimiter:
    """Thread-safe sliding window rate limiter supporting IP, User, Company, and Concurrency bounds."""

    def __init__(self) -> None:
        self._lock = Lock()
        self._windows: dict[str, list[float]] = defaultdict(list)
        self._concurrent_ai: dict[str, int] = defaultdict(int)
        self._login_failures: dict[str, list[float]] = defaultdict(list)

    def _cleanup_old(self, key: str, window_seconds: float, now: float) -> None:
        cutoff = now - window_seconds
        self._windows[key] = [ts for ts in self._windows[key] if ts > cutoff]

    def check_rate_limit(
        self,
        key: str,
        max_requests: int,
        window_seconds: float,
        error_msg: str | None = None,
        bypass_test_check: bool = False,
    ) -> None:
        if not settings.RATE_LIMIT_ENABLED:
            return
        if not bypass_test_check and "pytest" in sys.modules:
            return

        now = time.time()
        with self._lock:
            self._cleanup_old(key, window_seconds, now)
            if len(self._windows[key]) >= max_requests:
                msg = error_msg or f"Too many requests. Limit is {max_requests} per {int(window_seconds)} seconds."
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail=msg,
                )
            self._windows[key].append(now)

    def record_login_failure(self, ip_address: str, bypass_test_check: bool = False) -> None:
        if not settings.RATE_LIMIT_ENABLED:
            return
        if not bypass_test_check and "pytest" in sys.modules:
            return

        now = time.time()
        with self._lock:
            cutoff = now - 300  # 5 minutes window
            self._login_failures[ip_address] = [ts for ts in self._login_failures[ip_address] if ts > cutoff]
            self._login_failures[ip_address].append(now)

            if len(self._login_failures[ip_address]) >= 5:
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="Too many failed login attempts. Please wait 5 minutes before trying again.",
                )

    def acquire_ai_concurrency(self, user_id: str, bypass_test_check: bool = False) -> None:
        if not settings.RATE_LIMIT_ENABLED:
            return
        if not bypass_test_check and "pytest" in sys.modules:
            return

        with self._lock:
            if self._concurrent_ai[user_id] >= settings.MAX_CONCURRENT_AI_REQUESTS:
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail=f"Maximum concurrent AI requests limit reached ({settings.MAX_CONCURRENT_AI_REQUESTS}).",
                )
            self._concurrent_ai[user_id] += 1

    def release_ai_concurrency(self, user_id: str, bypass_test_check: bool = False) -> None:
        if not settings.RATE_LIMIT_ENABLED:
            return
        if not bypass_test_check and "pytest" in sys.modules:
            return

        with self._lock:
            if self._concurrent_ai[user_id] > 0:
                self._concurrent_ai[user_id] -= 1


limiter = InMemoryRateLimiter()


def get_client_ip(request: Request) -> str:
    """Extract client IP address, respecting X-Forwarded-For if available."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "127.0.0.1"


# Rate Limit Dependency Helpers
def check_tier1_public_limit(request: Request) -> None:
    """Tier 1: Public endpoints (Login, Register, Password Reset) - 10 req/min/IP."""
    ip = get_client_ip(request)
    limiter.check_rate_limit(
        key=f"tier1:ip:{ip}",
        max_requests=settings.RATE_LIMIT_TIER1_IP_PER_MIN,
        window_seconds=60,
    )


def check_tier2_auth_limit(user_id: str, request: Request) -> None:
    """Tier 2: Authenticated endpoints - 120 req/min/user, burst 30 req/10s."""
    limiter.check_rate_limit(
        key=f"tier2:user:{user_id}",
        max_requests=settings.RATE_LIMIT_TIER2_USER_PER_MIN,
        window_seconds=60,
    )
    limiter.check_rate_limit(
        key=f"tier2:burst:{user_id}",
        max_requests=30,
        window_seconds=10,
        error_msg="Burst request limit exceeded. Please slow down.",
    )


def check_tier3_upload_limit(user_id: str, company_id: str | None = None, profile_type: str = "general") -> None:
    """Tier 3: File Upload endpoints - 20 uploads/hour/user + daily per-company limits."""
    limiter.check_rate_limit(
        key=f"tier3:user:{user_id}",
        max_requests=settings.RATE_LIMIT_TIER3_UPLOAD_PER_HR,
        window_seconds=3600,
        error_msg="Upload rate limit exceeded. Maximum 20 uploads per hour.",
    )

    if company_id:
        if profile_type == "logo":
            limiter.check_rate_limit(
                key=f"tier3:company_logo:{company_id}",
                max_requests=settings.DAILY_LOGO_UPLOADS_PER_COMPANY,
                window_seconds=86400,
                error_msg="Daily logo upload limit for this company reached.",
            )
        elif profile_type == "csv":
            limiter.check_rate_limit(
                key=f"tier3:company_csv:{company_id}",
                max_requests=settings.DAILY_CSV_IMPORTS_PER_COMPANY,
                window_seconds=86400,
                error_msg="Daily CSV import limit for this company reached.",
            )
        elif profile_type == "ocr":
            limiter.check_rate_limit(
                key=f"tier3:company_ocr:{company_id}",
                max_requests=settings.DAILY_OCR_UPLOADS_PER_COMPANY,
                window_seconds=86400,
                error_msg="Daily OCR receipt limit for this company reached.",
            )


def check_tier4_ai_limit(user_id: str, company_id: str | None = None) -> None:
    """Tier 4: AI endpoints - 30 req/hr/user, 300 req/day/company."""
    limiter.check_rate_limit(
        key=f"tier4:user:{user_id}",
        max_requests=settings.RATE_LIMIT_TIER4_AI_PER_HR,
        window_seconds=3600,
        error_msg="AI hourly rate limit reached. Maximum 30 AI requests per hour.",
    )
    if company_id:
        limiter.check_rate_limit(
            key=f"tier4:company:{company_id}",
            max_requests=settings.DAILY_AI_REQUESTS_PER_COMPANY,
            window_seconds=86400,
            error_msg="Daily company AI limit reached (300 requests/day).",
        )
