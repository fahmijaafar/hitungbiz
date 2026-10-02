import uuid
from fastapi.testclient import TestClient
from sqlmodel import Session

from app.core.config import settings
from app.models import Company, Purchase, Sale


def test_sales_channels_autocomplete(
    client: TestClient,
    superuser_token_headers: dict[str, str],
    db: Session,
) -> None:
    company = Company(
        company_name="Test Sale Co",
        company_email="sale-co@example.com",
        currency="MYR",
        registration_number="REG-001",
        phone_number="+60123456789",
        company_url="https://example.com",
        company_address="123 Sale St",
    )
    db.add(company)
    db.commit()
    db.refresh(company)
    company_id = company.id

    # Create sales with different channels and capitalizations
    sale1 = Sale(
        date="2026-07-01",
        channel="  Shopee  ",
        notes="Test sale 1",
        company_id=company_id,
        gross_amount=100.0,
        discount=0.0,
        net_sales=100.0,
        cancel_amount=0.0,
        short_over=0.0,
        refund=0.0,
        final_amount=100.0,
        status="Completed",
    )
    sale2 = Sale(
        date="2026-07-02",
        channel="shopee",
        notes="Test sale 2",
        company_id=company_id,
        gross_amount=50.0,
        discount=0.0,
        net_sales=50.0,
        cancel_amount=0.0,
        short_over=0.0,
        refund=0.0,
        final_amount=50.0,
        status="Completed",
    )
    sale3 = Sale(
        date="2026-07-03",
        channel="Lazada",
        notes="Test sale 3",
        company_id=company_id,
        gross_amount=200.0,
        discount=0.0,
        net_sales=200.0,
        cancel_amount=0.0,
        short_over=0.0,
        refund=0.0,
        final_amount=200.0,
        status="Completed",
    )
    db.add(sale1)
    db.add(sale2)
    db.add(sale3)
    db.commit()

    response = client.get(
        f"{settings.API_V1_STR}/sales/channels?company_id={company_id}",
        headers=superuser_token_headers,
    )
    assert response.status_code == 200
    data = response.json()["data"]

    # Verify deduplication and trimming
    assert data == ["Lazada", "Shopee"]


def test_purchase_suppliers_autocomplete(
    client: TestClient,
    superuser_token_headers: dict[str, str],
    db: Session,
) -> None:
    company = Company(
        company_name="Test Purchase Co",
        company_email="purchase-co@example.com",
        currency="MYR",
        registration_number="REG-002",
        phone_number="+60123456789",
        company_url="https://example.com",
        company_address="456 Purchase St",
    )
    db.add(company)
    db.commit()
    db.refresh(company)
    company_id = company.id

    # Create purchases with different suppliers and capitalizations
    p1 = Purchase(
        date="2026-07-01T00:00:00Z",
        supplier_name="  TNB ",
        category="Utilities",
        invoice_no="INV-001",
        company_id=company_id,
        amount=100.0,
        tax=0.0,
        final_amount=100.0,
        status="Paid",
    )
    p2 = Purchase(
        date="2026-07-02T00:00:00Z",
        supplier_name="tnb",
        category="Utilities",
        invoice_no="INV-002",
        company_id=company_id,
        amount=150.0,
        tax=0.0,
        final_amount=150.0,
        status="Paid",
    )
    p3 = Purchase(
        date="2026-07-03T00:00:00Z",
        supplier_name="Telekom Malaysia",
        category="Internet",
        invoice_no="INV-003",
        company_id=company_id,
        amount=200.0,
        tax=0.0,
        final_amount=200.0,
        status="Paid",
    )
    db.add(p1)
    db.add(p2)
    db.add(p3)
    db.commit()

    response = client.get(
        f"{settings.API_V1_STR}/purchases/suppliers?company_id={company_id}",
        headers=superuser_token_headers,
    )
    assert response.status_code == 200
    data = response.json()["data"]

    # Verify deduplication and trimming
    assert data == ["Telekom Malaysia", "TNB"]
