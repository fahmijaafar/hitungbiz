import logging
from collections.abc import Callable

from fastapi import Request, Response, status
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.config import settings

logger = logging.getLogger(__name__)


def build_hsts_header() -> str:
    """Build HSTS header value based on settings."""
    header = f"max-age={settings.SECURE_HSTS_SECONDS}"
    if settings.SECURE_HSTS_INCLUDE_SUBDOMAINS:
        header += "; includeSubDomains"
    if settings.SECURE_HSTS_PRELOAD:
        header += "; preload"
    return header


def build_csp_header() -> str:
    """Build Content-Security-Policy header based on environment and settings."""
    if settings.CSP_HEADER_OVERRIDE:
        return settings.CSP_HEADER_OVERRIDE

    if settings.ENVIRONMENT == "local":
        # Relaxed policy for local development supporting Vite HMR, WebSockets, and inline scripts
        return (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://unpkg.com https://static.cloudflareinsights.com blob:; "
            "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://unpkg.com; "
            "img-src 'self' data: blob: http: https:; "
            "font-src 'self' data: https://cdn.jsdelivr.net https://unpkg.com; "
            "connect-src 'self' http: https: ws: wss: https://cloudflareinsights.com; "
            "worker-src 'self' blob: https://cdn.jsdelivr.net https://unpkg.com; "
            "object-src 'none'; "
            "frame-ancestors 'none';"
        )
    else:
        # Strict policy for staging/production environments
        return (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://unpkg.com https://static.cloudflareinsights.com blob:; "
            "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://unpkg.com; "
            "img-src 'self' data: blob: https:; "
            "font-src 'self' data: https://cdn.jsdelivr.net https://unpkg.com; "
            "connect-src 'self' http: https: ws: wss: https://cdn.jsdelivr.net https://tessdata.projectnaptha.com https://cloudflareinsights.com; "
            "worker-src 'self' blob: https://cdn.jsdelivr.net https://unpkg.com; "
            "object-src 'none'; "
            "frame-ancestors 'none'; "
            "base-uri 'self'; "
            "form-action 'self';"
        )


class SecurityMiddleware(BaseHTTPMiddleware):
    """Centralized security middleware responsible for security headers, payload size limiting,

    and server information removal.
    """

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # 1. Enforce Request Body Size Limit
        content_length_str = request.headers.get("content-length")
        if content_length_str:
            try:
                content_length = int(content_length_str)
                if content_length > settings.MAX_REQUEST_BODY_SIZE:
                    logger.warning(
                        "Payload size %d exceeds limit of %d bytes",
                        content_length,
                        settings.MAX_REQUEST_BODY_SIZE,
                    )
                    return JSONResponse(
                        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        content={"detail": "Payload too large. Request body exceeds limit."},
                    )
            except ValueError:
                pass

        # 2. Process Request
        response = await call_next(request)

        # 3. Add Security Headers
        if settings.SECURITY_HEADERS_ENABLED:
            headers = response.headers

            # HSTS: Only apply over HTTPS or when explicitly forced
            is_https = (
                request.url.scheme == "https"
                or request.headers.get("x-forwarded-proto", "").lower() == "https"
            )
            if (settings.SECURE_HSTS_ENABLED or is_https) and "strict-transport-security" not in headers:
                headers["strict-transport-security"] = build_hsts_header()

            # Security Headers
            if "x-content-type-options" not in headers:
                headers["x-content-type-options"] = settings.X_CONTENT_TYPE_OPTIONS

            if "x-frame-options" not in headers:
                headers["x-frame-options"] = settings.X_FRAME_OPTIONS

            if "referrer-policy" not in headers:
                headers["referrer-policy"] = settings.REFERRER_POLICY

            if "permissions-policy" not in headers:
                headers["permissions-policy"] = settings.PERMISSIONS_POLICY

            if "cross-origin-opener-policy" not in headers:
                headers["cross-origin-opener-policy"] = settings.CROSS_ORIGIN_OPENER_POLICY

            if "cross-origin-resource-policy" not in headers:
                headers["cross-origin-resource-policy"] = settings.CROSS_ORIGIN_RESOURCE_POLICY

            # Content Security Policy (CSP)
            if "content-security-policy" not in headers:
                headers["content-security-policy"] = build_csp_header()

        # 4. Server Information Removal
        if settings.REMOVE_SERVER_HEADER and "server" in response.headers:
            del response.headers["server"]

        return response
