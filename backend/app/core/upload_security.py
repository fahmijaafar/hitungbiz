import csv
import io
import logging
import re
import uuid
from io import BytesIO, StringIO

from fastapi import HTTPException, status
from PIL import Image, ImageOps

from app.core.config import settings

logger = logging.getLogger(__name__)

ALLOWED_LOGO_MIME = {"image/png", "image/jpeg", "image/webp", "image/svg+xml"}
ALLOWED_OCR_MIME = {"image/jpeg", "image/png", "image/webp", "application/pdf"}
ALLOWED_CSV_MIME = {"text/csv", "application/vnd.ms-excel", "text/plain", "application/csv"}

# Dangerous formula characters for CSV Injection
CSV_INJECTION_PREFIXES = ("=", "+", "-", "@", "\t", "\r")


def _sanitize_csv_value(val: str) -> str:
    """Escape CSV injection prefixes by prepending a single quote."""
    if val and val.startswith(CSV_INJECTION_PREFIXES):
        return f"'{val}"
    return val


def run_antivirus_scan(contents: bytes) -> bool:
    """Architecture hook for future antivirus integration (e.g., ClamAV).

    Returns True if clean, False if infected.
    """
    # Currently a pass-through architecture stub ready for Phase 3 AV scanners
    return True


def validate_logo_upload(file_contents: bytes, content_type: str | None = None) -> tuple[bytes, str, str]:
    """Validates company logo upload profile (max 5MB, MIME, dimensions, EXIF stripping, UUID filename)."""
    if not file_contents or len(file_contents) == 0:
        logger.warning("Rejected empty logo upload")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Uploaded file is empty.")

    if len(file_contents) > settings.MAX_LOGO_SIZE:
        logger.warning("Rejected logo upload exceeding size limit: %d bytes", len(file_contents))
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File size exceeds maximum allowed limit of {settings.MAX_LOGO_SIZE // (1024 * 1024)} MB.",
        )

    mime = (content_type or "").lower().split(";")[0].strip()
    if mime not in ALLOWED_LOGO_MIME:
        # Fallback MIME detection from file header
        if file_contents.startswith(b"\x89PNG"):
            mime = "image/png"
        elif file_contents.startswith(b"\xff\xd8\xff"):
            mime = "image/jpeg"
        elif file_contents.startswith(b"RIFF") and b"WEBP" in file_contents[:16]:
            mime = "image/webp"
        elif b"<svg" in file_contents[:500].lower():
            mime = "image/svg+xml"
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid file format. Allowed types: {', '.join(sorted(ALLOWED_LOGO_MIME))}",
            )

    ext = "png"
    if mime == "image/jpeg":
        ext = "jpg"
    elif mime == "image/webp":
        ext = "webp"
    elif mime == "image/svg+xml":
        ext = "svg"

    processed_bytes = file_contents

    if mime == "image/svg+xml":
        try:
            svg_text = file_contents.decode("utf-8", errors="ignore")
            # Sanitize script tags or inline JS event handlers in SVG
            if re.search(r"<script|javascript:|on\w+\s*=", svg_text, re.IGNORECASE):
                logger.warning("Rejected SVG logo containing potential embedded scripts")
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or unsafe SVG file.")
        except HTTPException:
            raise
        except Exception:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid SVG file structure.")
    else:
        try:
            with Image.open(BytesIO(file_contents)) as img:
                img.verify()

            # Re-open for stripping EXIF & saving clean image
            with Image.open(BytesIO(file_contents)) as img:
                if img.width <= 0 or img.height <= 0:
                    raise ValueError("Invalid image dimensions")

                # Strip EXIF info by re-creating clean image buffer
                data = list(img.getdata())
                clean_img = Image.new(img.mode, img.size)
                clean_img.putdata(data)
                clean_img = ImageOps.exif_transpose(clean_img)

                output = BytesIO()
                format_name = "PNG" if mime == "image/png" else ("JPEG" if mime == "image/jpeg" else "WEBP")
                clean_img.save(output, format=format_name)
                processed_bytes = output.getvalue()
        except Exception as e:
            logger.warning("Corrupted image upload rejected: %s", str(e))
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Corrupted or invalid image file.")

    unique_filename = f"{uuid.uuid4().hex}.{ext}"
    return processed_bytes, unique_filename, mime


def validate_ocr_upload(file_contents: bytes, content_type: str | None = None) -> tuple[bytes, str, str]:
    """Validates OCR receipt upload profile (max 15MB, image/PDF validation, password/encryption checks)."""
    if not file_contents or len(file_contents) == 0:
        logger.warning("Rejected empty OCR upload")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Uploaded file is empty.")

    if len(file_contents) > settings.MAX_OCR_SIZE:
        logger.warning("Rejected OCR upload exceeding size limit: %d bytes", len(file_contents))
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File size exceeds maximum allowed limit of {settings.MAX_OCR_SIZE // (1024 * 1024)} MB.",
        )

    if not run_antivirus_scan(file_contents):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File failed security scan.")

    mime = (content_type or "").lower().split(";")[0].strip()
    if mime not in ALLOWED_OCR_MIME:
        if file_contents.startswith(b"%PDF"):
            mime = "application/pdf"
        elif file_contents.startswith(b"\x89PNG"):
            mime = "image/png"
        elif file_contents.startswith(b"\xff\xd8\xff"):
            mime = "image/jpeg"
        elif file_contents.startswith(b"RIFF") and b"WEBP" in file_contents[:16]:
            mime = "image/webp"
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid file format. Allowed types: {', '.join(sorted(ALLOWED_OCR_MIME))}",
            )

    ext = "jpg"
    if mime == "image/png":
        ext = "png"
    elif mime == "image/webp":
        ext = "webp"
    elif mime == "application/pdf":
        ext = "pdf"

    if mime == "application/pdf":
        if not file_contents.startswith(b"%PDF"):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid PDF file signature.")

        # Check for encrypted PDF
        if b"/Encrypt" in file_contents:
            logger.warning("Rejected encrypted/password-protected PDF receipt")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Password-protected or encrypted PDF files are not allowed.",
            )

        # Count PDF pages via structural regex
        page_matches = len(re.findall(rb"/Type\s*/Page\b", file_contents))
        if page_matches > settings.MAX_PDF_PAGES:
            logger.warning("PDF page count %d exceeds limit of %d", page_matches, settings.MAX_PDF_PAGES)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"PDF exceeds maximum page limit of {settings.MAX_PDF_PAGES} pages.",
            )
    else:
        try:
            with Image.open(BytesIO(file_contents)) as img:
                img.verify()
                if img.width <= 0 or img.height <= 0:
                    raise ValueError("Invalid dimensions")
        except Exception as e:
            logger.warning("Corrupted receipt image rejected: %s", str(e))
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Corrupted or invalid receipt image.")

    unique_filename = f"{uuid.uuid4().hex}.{ext}"
    return file_contents, unique_filename, mime


def validate_csv_upload(file_contents: bytes, content_type: str | None = None) -> tuple[str, list[list[str]], str]:
    """Validates CSV import profile (max 10MB, UTF-8, row/col limits, CSV injection escaping)."""
    if not file_contents or len(file_contents) == 0:
        logger.warning("Rejected empty CSV upload")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Uploaded CSV file is empty.")

    if len(file_contents) > settings.MAX_CSV_SIZE:
        logger.warning("Rejected CSV upload exceeding size limit: %d bytes", len(file_contents))
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File size exceeds maximum allowed limit of {settings.MAX_CSV_SIZE // (1024 * 1024)} MB.",
        )

    # UTF-8 decoding & BOM stripping
    try:
        decoded_text = file_contents.decode("utf-8-sig")
    except UnicodeDecodeError:
        logger.warning("Non UTF-8 binary CSV upload rejected")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="CSV file must be valid UTF-8 text.",
        )

    # Sniff delimiter
    sample = decoded_text[:2048]
    delimiter = ","
    if ";" in sample and sample.count(";") > sample.count(","):
        delimiter = ";"
    elif "\t" in sample and sample.count("\t") > sample.count(","):
        delimiter = "\t"

    reader = csv.reader(StringIO(decoded_text), delimiter=delimiter)
    parsed_rows: list[list[str]] = []

    for row_idx, raw_row in enumerate(reader, start=1):
        if row_idx > settings.MAX_CSV_ROWS:
            logger.warning("CSV exceeds row limit of %d", settings.MAX_CSV_ROWS)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"CSV file exceeds maximum limit of {settings.MAX_CSV_ROWS} rows.",
            )

        if len(raw_row) > settings.MAX_CSV_COLS:
            logger.warning("CSV row %d column count %d exceeds limit of %d", row_idx, len(raw_row), settings.MAX_CSV_COLS)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"CSV file exceeds maximum limit of {settings.MAX_CSV_COLS} columns.",
            )

        # Sanitize CSV injection vectors for cell values
        sanitized_row = [_sanitize_csv_value(cell) for cell in raw_row]
        parsed_rows.append(sanitized_row)

    if not parsed_rows:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="CSV file contains no valid data rows.")

    # Reconstruct sanitized CSV text
    out_buf = StringIO()
    writer = csv.writer(out_buf, delimiter=delimiter)
    writer.writerows(parsed_rows)
    sanitized_csv_text = out_buf.getvalue()

    unique_filename = f"{uuid.uuid4().hex}.csv"
    return sanitized_csv_text, parsed_rows, unique_filename
