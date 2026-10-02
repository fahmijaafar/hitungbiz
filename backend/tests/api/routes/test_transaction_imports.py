import uuid

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.core.config import settings
from app.models import Client, Product


def test_read_import_fields_for_clients_and_products(client: TestClient, superuser_token_headers: dict[str, str]) -> None:
    r_clients = client.get(
        f"{settings.API_V1_STR}/transaction-imports/fields/clients",
        headers=superuser_token_headers,
    )
    assert r_clients.status_code == 200
    content_clients = r_clients.json()
    assert content_clients["import_type"] == "clients"
    field_keys_clients = [f["key"] for f in content_clients["fields"]]
    assert "name" in field_keys_clients
    assert "email" in field_keys_clients
    assert "company_name" in field_keys_clients

    r_products = client.get(
        f"{settings.API_V1_STR}/transaction-imports/fields/products",
        headers=superuser_token_headers,
    )
    assert r_products.status_code == 200
    content_products = r_products.json()
    assert content_products["import_type"] == "products"
    field_keys_products = [f["key"] for f in content_products["fields"]]
    assert "product_name" in field_keys_products
    assert "sku" in field_keys_products
    assert "sell_price" in field_keys_products


def test_validate_and_bulk_insert_clients(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    records = [
        {
            "row_number": 2,
            "selected": True,
            "data": {
                "name": "Acme Corp Client",
                "email": "acme@example.com",
                "phone_number": "+60123456789",
                "company_name": "Acme Corp",
                "customer_type": "business",
            },
        }
    ]

    r_val = client.post(
        f"{settings.API_V1_STR}/transaction-imports/validate",
        headers=superuser_token_headers,
        json={"import_type": "clients", "records": records},
    )
    assert r_val.status_code == 200
    res_val = r_val.json()
    assert res_val["valid_rows"] == 1
    assert res_val["invalid_rows"] == 0

    r_bulk = client.post(
        f"{settings.API_V1_STR}/transaction-imports/bulk-insert",
        headers=superuser_token_headers,
        json={"import_type": "clients", "records": records},
    )
    assert r_bulk.status_code == 200
    res_bulk = r_bulk.json()
    assert res_bulk["imported"] == 1

    created_client = db.exec(
        select(Client).where(Client.name == "Acme Corp Client")
    ).first()
    assert created_client is not None
    assert created_client.email == "acme@example.com"
    assert created_client.company_name == "Acme Corp"


def test_validate_and_bulk_insert_products(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    unique_name = f"Super Widget Pro {uuid.uuid4().hex[:6]}"
    unique_sku = f"SW-{uuid.uuid4().hex[:4]}"
    records = [
        {
            "row_number": 2,
            "selected": True,
            "data": {
                "product_name": unique_name,
                "sku": unique_sku,
                "category": "Electronics",
                "cost_price": "50.00",
                "sell_price": "100.00",
                "stock_quantity": "25",
                "unit_type": "pcs",
            },
        }
    ]

    r_val = client.post(
        f"{settings.API_V1_STR}/transaction-imports/validate",
        headers=superuser_token_headers,
        json={"import_type": "products", "records": records},
    )
    assert r_val.status_code == 200
    res_val = r_val.json()
    assert res_val["valid_rows"] == 1
    assert res_val["invalid_rows"] == 0

    r_bulk = client.post(
        f"{settings.API_V1_STR}/transaction-imports/bulk-insert",
        headers=superuser_token_headers,
        json={"import_type": "products", "records": records},
    )
    assert r_bulk.status_code == 200
    res_bulk = r_bulk.json()
    assert res_bulk["imported"] == 1

    created_product = db.exec(
        select(Product).where(Product.product_name == unique_name)
    ).first()
    assert created_product is not None
    assert created_product.sku == unique_sku
    assert created_product.sell_price == 100.0
    assert created_product.stock_quantity == 25.0


def test_read_import_fields_for_expenses(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    r_expenses = client.get(
        f"{settings.API_V1_STR}/transaction-imports/fields/expenses",
        headers=superuser_token_headers,
    )
    assert r_expenses.status_code == 200
    content_expenses = r_expenses.json()
    assert content_expenses["import_type"] == "expenses"
    inv_field = next(f for f in content_expenses["fields"] if f["key"] == "invoice_no")
    assert inv_field["required"] is False
    assert inv_field["unique"] is False


def test_validate_and_bulk_insert_expenses_without_invoice_no(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    from app.models import Purchase

    records = [
        {
            "row_number": 2,
            "selected": True,
            "data": {
                "date": "2026-08-01",
                "supplier_name": "Office Supplies Co",
                "category": "Office Equipment",
                "amount": "150.00",
                "tax": "0.00",
            },
        }
    ]

    r_val = client.post(
        f"{settings.API_V1_STR}/transaction-imports/validate",
        headers=superuser_token_headers,
        json={"import_type": "expenses", "records": records},
    )
    assert r_val.status_code == 200
    res_val = r_val.json()
    assert res_val["valid_rows"] == 1
    assert res_val["invalid_rows"] == 0

    r_bulk = client.post(
        f"{settings.API_V1_STR}/transaction-imports/bulk-insert",
        headers=superuser_token_headers,
        json={"import_type": "expenses", "records": records},
    )
    assert r_bulk.status_code == 200
    res_bulk = r_bulk.json()
    assert res_bulk["imported"] == 1

    created_purchase = db.exec(
        select(Purchase).where(Purchase.supplier_name == "Office Supplies Co")
    ).first()
    assert created_purchase is not None
    assert created_purchase.invoice_no is None
    assert created_purchase.amount == 150.0

