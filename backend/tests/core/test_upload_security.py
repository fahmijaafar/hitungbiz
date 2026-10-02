from io import BytesIO

import pytest
from fastapi import HTTPException
from PIL import Image

from app.core.upload_security import (
    validate_csv_upload,
    validate_logo_upload,
    validate_ocr_upload,
)


def create_test_image_bytes(format_name: str = "PNG", width: int = 100, height: int = 100) -> bytes:
    img = Image.new("RGB", (width, height), color="red")
    buf = BytesIO()
    img.save(buf, format=format_name)
    return buf.getvalue()


def test_validate_logo_upload_valid() -> None:
    img_bytes = create_test_image_bytes("PNG")
    processed_bytes, filename, mime = validate_logo_upload(img_bytes, "image/png")
    assert len(processed_bytes) > 0
    assert filename.endswith(".png")
    assert mime == "image/png"


def test_validate_logo_upload_empty() -> None:
    with pytest.raises(HTTPException) as exc_info:
        validate_logo_upload(b"", "image/png")
    assert exc_info.value.status_code == 400
    assert "empty" in exc_info.value.detail.lower()


def test_validate_logo_upload_invalid_mime() -> None:
    with pytest.raises(HTTPException) as exc_info:
        validate_logo_upload(b"some random text bytes", "text/plain")
    assert exc_info.value.status_code == 400


def test_validate_logo_upload_svg_sanitization() -> None:
    malicious_svg = b'<svg><script>alert("xss")</script></svg>'
    with pytest.raises(HTTPException) as exc_info:
        validate_logo_upload(malicious_svg, "image/svg+xml")
    assert exc_info.value.status_code == 400
    assert "unsafe" in exc_info.value.detail.lower()


def test_validate_ocr_upload_pdf() -> None:
    valid_pdf_bytes = b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF"
    processed_bytes, filename, mime = validate_ocr_upload(valid_pdf_bytes, "application/pdf")
    assert processed_bytes == valid_pdf_bytes
    assert filename.endswith(".pdf")
    assert mime == "application/pdf"


def test_validate_ocr_upload_encrypted_pdf() -> None:
    encrypted_pdf_bytes = b"%PDF-1.4\n<< /Encrypt 1 0 R >>\n%%EOF"
    with pytest.raises(HTTPException) as exc_info:
        validate_ocr_upload(encrypted_pdf_bytes, "application/pdf")
    assert exc_info.value.status_code == 400
    assert "encrypted" in exc_info.value.detail.lower() or "password" in exc_info.value.detail.lower()


def test_validate_csv_upload_valid() -> None:
    csv_bytes = b"header1,header2\nval1,val2\n=1+2,normal"
    sanitized_text, rows, filename = validate_csv_upload(csv_bytes, "text/csv")
    assert len(rows) == 3
    assert filename.endswith(".csv")
    # CSV injection vector `=1+2` must be escaped to `'=1+2`
    assert rows[2][0] == "'=1+2"


def test_validate_csv_upload_non_utf8() -> None:
    bad_bytes = b"\x80\x81\x82\xff"
    with pytest.raises(HTTPException) as exc_info:
        validate_csv_upload(bad_bytes, "text/csv")
    assert exc_info.value.status_code == 400
