from fastapi.testclient import TestClient
from sqlmodel import Session

from app.core.config import settings


def test_create_document(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    data = {
        "docno": "DOC-001",
        "doctype": "Invoice",
        "title": "Test Document Title",
        "status": "Draft",
        "item": [],
        "price_calculation": {},
        "remark": "Test remark",
    }
    response = client.post(
        f"{settings.API_V1_STR}/documents/",
        headers=superuser_token_headers,
        json=data,
    )
    assert response.status_code == 200, response.text
    content = response.json()
    assert content["docno"] == "DOC-001"
    assert content["doctype"] == "Invoice"
    assert "id" in content


def test_update_document(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    # First create a document
    data = {
        "docno": "DOC-002",
        "doctype": "Quotation",
        "title": "Initial Title",
        "status": "Draft",
        "item": [],
        "price_calculation": {},
        "remark": "Initial remark",
    }
    create_res = client.post(
        f"{settings.API_V1_STR}/documents/",
        headers=superuser_token_headers,
        json=data,
    )
    assert create_res.status_code == 200, create_res.text
    doc_id = create_res.json()["id"]

    # Update document
    update_data = {
        "title": "Updated Title",
        "status": "Sent",
    }
    update_res = client.put(
        f"{settings.API_V1_STR}/documents/{doc_id}",
        headers=superuser_token_headers,
        json=update_data,
    )
    assert update_res.status_code == 200, update_res.text
    content = update_res.json()
    assert content["title"] == "Updated Title"
    assert content["status"] == "Sent"


def test_delete_document(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    # First create a document
    data = {
        "docno": "DOC-003",
        "doctype": "Quotation",
        "title": "To be deleted",
        "status": "Draft",
        "item": [],
        "price_calculation": {},
        "remark": "",
    }
    create_res = client.post(
        f"{settings.API_V1_STR}/documents/",
        headers=superuser_token_headers,
        json=data,
    )
    assert create_res.status_code == 200, create_res.text
    doc_id = create_res.json()["id"]

    # Delete document
    delete_res = client.delete(
        f"{settings.API_V1_STR}/documents/{doc_id}",
        headers=superuser_token_headers,
    )
    assert delete_res.status_code == 200, delete_res.text


def test_delivery_order_creation_and_inventory_deduction(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    # 1. Create a product first
    product_data = {
        "product_name": "Test Product DO",
        "description": "Test product description",
        "sku": "DO-SKU-001",
        "category": "General",
        "cost_price": 50.0,
        "sell_price": 100.0,
        "stock_quantity": 50.0,
        "unit_type": "pcs",
    }
    prod_res = client.post(
        f"{settings.API_V1_STR}/products/",
        headers=superuser_token_headers,
        json=product_data,
    )
    assert prod_res.status_code == 200, prod_res.text
    prod_id = prod_res.json()["id"]

    # 2. Create a Delivery Order referencing the product and a custom item
    do_data = {
        "docno": "DO-0001",
        "doctype": "deliveryorder",
        "title": "Delivery Order Test",
        "status": "Processed",
        "item": [
            {
                "product_id": prod_id,
                "title": "Test Product DO",
                "quantity": 5.0,
                "unit_price": 100.0,
                "total": 500.0,
            },
            {
                "product_id": None,
                "title": "Custom non-existent service",
                "quantity": 2.0,
                "unit_price": 50.0,
                "total": 100.0,
            },
            {
                "product_id": "00000000-0000-0000-0000-000000000000",
                "title": "Unknown Product ID",
                "quantity": 10.0,
                "unit_price": 20.0,
                "total": 200.0,
            },
        ],
        "price_calculation": {},
        "remark": "Delivery order remark",
    }
    do_res = client.post(
        f"{settings.API_V1_STR}/documents/",
        headers=superuser_token_headers,
        json=do_data,
    )
    assert do_res.status_code == 200, do_res.text
    doc_id = do_res.json()["id"]
    assert do_res.json()["stock_deducted"] is False

    # 3. Trigger inventory deduction
    deduct_res = client.post(
        f"{settings.API_V1_STR}/documents/{doc_id}/deduct-inventory",
        headers=superuser_token_headers,
    )
    assert deduct_res.status_code == 200, deduct_res.text
    assert deduct_res.json()["stock_deducted"] is True

    # 4. Check that product stock was deducted from 50.0 to 45.0
    get_prod_res = client.get(
        f"{settings.API_V1_STR}/products/{prod_id}",
        headers=superuser_token_headers,
    )
    assert get_prod_res.status_code == 200
    assert get_prod_res.json()["stock_quantity"] == 45.0

    # 5. Check inventory transaction log
    txns_res = client.get(
        f"{settings.API_V1_STR}/products/{prod_id}/inventory-transactions",
        headers=superuser_token_headers,
    )
    assert txns_res.status_code == 200, txns_res.text
    txns = txns_res.json()["data"]
    assert len(txns) == 1
    assert txns[0]["quantity_deducted"] == 5.0
    assert txns[0]["previous_stock"] == 50.0
    assert txns[0]["new_stock"] == 45.0
    assert txns[0]["document_number"] == "DO-0001"

    # 6. Verify idempotency: call deduct-inventory AGAIN
    deduct_again_res = client.post(
        f"{settings.API_V1_STR}/documents/{doc_id}/deduct-inventory",
        headers=superuser_token_headers,
    )
    assert deduct_again_res.status_code == 200, deduct_again_res.text
    assert deduct_again_res.json()["stock_deducted"] is True

    # Check stock remains 45.0 (no double deduction)
    get_prod_again = client.get(
        f"{settings.API_V1_STR}/products/{prod_id}",
        headers=superuser_token_headers,
    )
    assert get_prod_again.json()["stock_quantity"] == 45.0

