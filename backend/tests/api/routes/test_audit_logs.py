import uuid
from fastapi.testclient import TestClient
from sqlmodel import Session

from app.core.config import settings
from app.services.audit_logger import AuditAction, AuditLogger, AuditModule


def test_read_audit_logs_superuser(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    r = client.get(
        f"{settings.API_V1_STR}/admin/audit-logs",
        headers=superuser_token_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert "data" in data
    assert "count" in data


def test_read_audit_logs_normal_user_forbidden(
    client: TestClient, normal_user_token_headers: dict[str, str]
) -> None:
    r = client.get(
        f"{settings.API_V1_STR}/admin/audit-logs",
        headers=normal_user_token_headers,
    )
    assert r.status_code == 403


def test_audit_logger_service_and_change_detection(db: Session) -> None:
    # Test creation log
    test_id = uuid.uuid4()
    log_entry = AuditLogger.log(
        db,
        module=AuditModule.PRODUCTS,
        table_name="products",
        record_id=test_id,
        action=AuditAction.CREATE,
        entity_name="Test Product",
        description="Created Product Test Product",
        new_data={"name": "Test Product", "price": 100},
    )
    assert log_entry is not None
    assert log_entry.module == "Products"
    assert log_entry.action == "CREATE"

    # Test change detection for UPDATE (no change -> no log inserted)
    no_log = AuditLogger.log(
        db,
        module=AuditModule.PRODUCTS,
        table_name="products",
        record_id=test_id,
        action=AuditAction.UPDATE,
        entity_name="Test Product",
        description="Updated Product Test Product",
        old_data={"name": "Test Product", "price": 100},
        new_data={"name": "Test Product", "price": 100},
    )
    assert no_log is None

    # Test change detection for UPDATE (actual change -> log inserted)
    update_log = AuditLogger.log(
        db,
        module=AuditModule.PRODUCTS,
        table_name="products",
        record_id=test_id,
        action=AuditAction.UPDATE,
        entity_name="Test Product",
        description="Updated Product Test Product",
        old_data={"name": "Test Product", "price": 100},
        new_data={"name": "Test Product", "price": 150},
    )
    assert update_log is not None
    assert update_log.action == "UPDATE"


def test_audit_logs_filters(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    # Insert test logs
    unique_keyword = f"UniqueKeyword-{uuid.uuid4()}"
    AuditLogger.log(
        db,
        module=AuditModule.COMPANIES,
        table_name="company",
        action=AuditAction.CREATE,
        entity_name="Unique Company",
        description=f"Created Company {unique_keyword}",
    )

    r = client.get(
        f"{settings.API_V1_STR}/admin/audit-logs",
        headers=superuser_token_headers,
        params={"keyword": unique_keyword, "module": "Companies", "action": "CREATE"},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["count"] >= 1
    assert any(unique_keyword in item["description"] for item in data["data"])
