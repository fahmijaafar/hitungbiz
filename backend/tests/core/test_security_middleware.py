from fastapi.testclient import TestClient

from app.core.config import settings
from app.core.security_middleware import build_csp_header, build_hsts_header


def test_security_headers_presence(client: TestClient) -> None:
    response = client.get(f"{settings.API_V1_STR}/utils/health-check/")
    assert response.status_code == 200

    headers = response.headers
    assert headers.get("x-content-type-options") == settings.X_CONTENT_TYPE_OPTIONS
    assert headers.get("x-frame-options") == settings.X_FRAME_OPTIONS
    assert headers.get("referrer-policy") == settings.REFERRER_POLICY
    assert headers.get("permissions-policy") == settings.PERMISSIONS_POLICY
    assert headers.get("cross-origin-opener-policy") == settings.CROSS_ORIGIN_OPENER_POLICY
    assert headers.get("cross-origin-resource-policy") == settings.CROSS_ORIGIN_RESOURCE_POLICY
    assert "content-security-policy" in headers
    assert "server" not in headers


def test_hsts_header_on_https_request(client: TestClient) -> None:
    # Standard HTTP request (local dev default) should not add HSTS
    response_http = client.get(f"{settings.API_V1_STR}/utils/health-check/")
    assert "strict-transport-security" not in response_http.headers

    # HTTPS proxy request (X-Forwarded-Proto: https) must add HSTS
    response_https = client.get(
        f"{settings.API_V1_STR}/utils/health-check/",
        headers={"X-Forwarded-Proto": "https"},
    )
    assert "strict-transport-security" in response_https.headers
    assert response_https.headers["strict-transport-security"] == build_hsts_header()


def test_request_body_size_limit(client: TestClient) -> None:
    # Normal size request
    res_ok = client.get(f"{settings.API_V1_STR}/utils/health-check/")
    assert res_ok.status_code == 200

    # Request with Content-Length exceeding MAX_REQUEST_BODY_SIZE
    oversized_length = settings.MAX_REQUEST_BODY_SIZE + 1000
    res_large = client.post(
        f"{settings.API_V1_STR}/utils/health-check/",
        headers={"Content-Length": str(oversized_length), "Content-Type": "application/json"},
    )
    assert res_large.status_code == 413
    assert res_large.json()["detail"] == "Payload too large. Request body exceeds limit."


def test_csp_header_building(monkeypatch: None) -> None:
    csp_dev = build_csp_header()
    assert "ws:" in csp_dev
    assert "wss:" in csp_dev
