import os

from fastapi import APIRouter, Depends, File, UploadFile

from app.api.deps import get_current_user
from app.core.config import settings
from app.core.rate_limiter import check_tier3_upload_limit
from app.core.upload_security import validate_logo_upload
from app.models import User

router = APIRouter(prefix="/uploads", tags=["uploads"])


def _ensure_upload_dir() -> str:
    """Ensure the upload directory exists and return its path."""
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    return settings.UPLOAD_DIR


@router.post("/company-logo")
async def upload_company_logo(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Upload a company logo image.

    Enforces LOGO_UPLOAD security profile & Tier 3 upload rate limits.
    """
    # 1. Rate Limiting Check
    check_tier3_upload_limit(user_id=str(current_user.id), profile_type="logo")

    # 2. Read and Validate via Centralized LOGO_UPLOAD Profile
    contents = await file.read()
    processed_bytes, filename, mime = validate_logo_upload(
        file_contents=contents,
        content_type=file.content_type,
    )

    # 3. Save Processed Clean Image File
    upload_dir = _ensure_upload_dir()
    filepath = os.path.join(upload_dir, filename)

    with open(filepath, "wb") as f:
        f.write(processed_bytes)

    relative_url = f"/uploads/{filename}"
    return {"url": relative_url, "filename": filename}
