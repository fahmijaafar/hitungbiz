import unicodedata
from collections.abc import Callable

from fastapi import Request, Response, status
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware


def sanitize_input_text(val: str, max_length: int | None = None) -> str:
    """Trim whitespace and normalize Unicode to NFKC standard form."""
    if not val:
        return ""
    normalized = unicodedata.normalize("NFKC", val).strip()
    if max_length and len(normalized) > max_length:
        return normalized[:max_length]
    return normalized


class ContentTypeValidationMiddleware(BaseHTTPMiddleware):
    """Rejects POST/PUT/PATCH requests with unsupported Content-Type headers when non-standard media is sent."""

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        if request.method in ("POST", "PUT", "PATCH"):
            content_type = request.headers.get("content-type", "").lower()
            content_length = request.headers.get("content-length")

            # Check if Content-Type is provided and unsupported (e.g. text/html, application/xml, application/x-msdownload)
            if content_length and int(content_length) > 0 and content_type:
                allowed_types = (
                    "application/json",
                    "multipart/form-data",
                    "application/x-www-form-urlencoded",
                    "text/csv",
                    "text/plain",
                    "application/csv",
                    "application/pdf",
                )
                if not any(t in content_type for t in allowed_types):
                    return JSONResponse(
                        status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                        content={"detail": "Unsupported Media Type."},
                    )

        return await call_next(request)
