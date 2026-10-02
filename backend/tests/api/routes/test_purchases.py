import uuid
from fastapi.testclient import TestClient
from sqlmodel import Session

from app.core.config import settings
from app.models import Purchase


def test_create_purchase_without_invoice_no(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    data = {
        "date": "2026-07-27T00:00:00Z",
        "supplier_name": "Test Supplier",
        "category": "Office Supplies",
        "amount": 100.0,
        "tax": 10.0,
        "final_amount": 110.0,
        "status": "Paid",
        "notes": "Test without invoice number",
    }
    response = client.post(
        f"{settings.API_V1_STR}/purchases/",
        headers=superuser_token_headers,
        json=data,
    )
    assert response.status_code == 200
    content = response.json()
    assert content["supplier_name"] == "Test Supplier"
    assert content["invoice_no"] is None

    # Clean up
    purchase_id = uuid.UUID(content["id"])
    purchase = db.get(Purchase, purchase_id)
    if purchase:
        db.delete(purchase)
        db.commit()
