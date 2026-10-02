"""HTTP integration tests — product creation entitlement enforcement.

Tests that POST /products/ correctly:
- Allows creation when the user is below their plan limit.
- Returns 403 + LIMIT_REACHED when the user is at their plan limit.
- Does not create a product when the limit is reached.
- Superusers bypass the plan limit entirely.
- Max plan users always have unlimited products.

Product count is controlled by inserting real Product rows directly into the
database, scoped to the user's company_id.
"""

from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, col, func, select

from app import crud
from app.core.config import settings
from app.models import Company, Product, User, UserCreate
from app.services.subscription_service import activate_subscription
from tests.utils.user import user_authentication_headers
from tests.utils.utils import random_email, random_lower_string

API = settings.API_V1_STR

# Minimal valid product payload
PRODUCT_PAYLOAD = {
    "product_name": "Test Product",
    "description": "A test product",
    "sku": "TST-001",
    "category": "Test",
    "cost_price": 10.0,
    "sell_price": 20.0,
    "stock_quantity": 100.0,
    "unit_type": "pcs",
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _create_verified_user(db: Session) -> tuple[User, str, str]:
    email = random_email()
    password = random_lower_string()
    user_in = UserCreate(email=email, password=password)
    user = crud.create_user(session=db, user_create=user_in)
    user.email_verified = True
    db.add(user)
    db.commit()
    db.refresh(user)
    return user, email, password


def _create_company_for_user(db: Session, user: User) -> Company:
    """Create a Company and set it as the user's active company_id."""
    company = Company(
        company_name=f"Prod Co {uuid.uuid4().hex[:6]}",
        currency="MYR",
        company_email=f"{uuid.uuid4().hex}@testco.com",
        phone_number="+60123456789",
        user_id=user.id,
    )
    db.add(company)
    db.commit()
    db.refresh(company)
    user.company_id = company.id
    db.add(user)
    db.commit()
    db.refresh(user)
    return company


def _insert_products(db: Session, company: Company, user: User, count: int) -> None:
    """Directly insert `count` Product rows into the database."""
    for i in range(count):
        product = Product(
            product_name=f"Product {i}",
            category="Test",
            cost_price=1.0,
            sell_price=2.0,
            stock_quantity=0.0,
            unit_type="pcs",
            company_id=company.id,
            user_id=user.id,
        )
        db.add(product)
    db.commit()


def _set_plan(db: Session, user: User, plan: str) -> None:
    billing_period = None if plan == "personal" else "monthly"
    activate_subscription(db, user_id=user.id, plan=plan, billing_period=billing_period)
    db.commit()


def _auth_headers(client: TestClient, email: str, password: str) -> dict[str, str]:
    return user_authentication_headers(client=client, email=email, password=password)


def _count_products(db: Session, company_id: uuid.UUID) -> int:
    return db.exec(
        select(func.count()).select_from(Product).where(col(Product.company_id) == company_id)
    ).one()


# ---------------------------------------------------------------------------
# Personal plan (limit = 50)
# ---------------------------------------------------------------------------

class TestPersonalProductLimit:
    def test_personal_below_limit_allows_creation(
        self, client: TestClient, db: Session
    ) -> None:
        """Personal user with 49 products can create one more (49 < 50)."""
        user, email, password = _create_verified_user(db)
        company = _create_company_for_user(db, user)
        _insert_products(db, company, user, 49)

        headers = _auth_headers(client, email, password)
        r = client.post(f"{API}/products/", headers=headers, json=PRODUCT_PAYLOAD)
        assert r.status_code == 200, r.text

    def test_personal_at_limit_returns_403(
        self, client: TestClient, db: Session
    ) -> None:
        """Personal user with 50 products cannot create a 51st."""
        user, email, password = _create_verified_user(db)
        company = _create_company_for_user(db, user)
        _insert_products(db, company, user, 50)

        headers = _auth_headers(client, email, password)
        r = client.post(f"{API}/products/", headers=headers, json=PRODUCT_PAYLOAD)
        assert r.status_code == 403, r.text

    def test_personal_limit_reached_error_body(
        self, client: TestClient, db: Session
    ) -> None:
        """LIMIT_REACHED response body is correctly structured for products."""
        user, email, password = _create_verified_user(db)
        company = _create_company_for_user(db, user)
        _insert_products(db, company, user, 50)

        headers = _auth_headers(client, email, password)
        r = client.post(f"{API}/products/", headers=headers, json=PRODUCT_PAYLOAD)
        detail = r.json()["detail"]

        assert detail["error"] == "LIMIT_REACHED"
        assert detail["feature"] == "products"
        assert detail["plan"] == "personal"
        assert detail["limit"] == 50
        assert detail["current_usage"] == 50
        assert detail["upgrade_required"] is True
        assert detail["next_plan"] == "pro"

    def test_personal_no_product_created_when_limit_reached(
        self, client: TestClient, db: Session
    ) -> None:
        """When limit is reached, no Product row is inserted."""
        user, email, password = _create_verified_user(db)
        company = _create_company_for_user(db, user)
        _insert_products(db, company, user, 50)
        before = _count_products(db, company.id)

        headers = _auth_headers(client, email, password)
        r = client.post(f"{API}/products/", headers=headers, json={
            **PRODUCT_PAYLOAD, "product_name": "Should Not Be Created",
        })
        assert r.status_code == 403

        after = _count_products(db, company.id)
        assert after == before  # no new product inserted


# ---------------------------------------------------------------------------
# Pro plan (limit = 500)
# ---------------------------------------------------------------------------

class TestProProductLimit:
    def test_pro_below_limit_allows_creation(
        self, client: TestClient, db: Session
    ) -> None:
        """Pro user with 499 products can create one more."""
        user, email, password = _create_verified_user(db)
        _set_plan(db, user, "pro")
        company = _create_company_for_user(db, user)
        _insert_products(db, company, user, 499)

        headers = _auth_headers(client, email, password)
        r = client.post(f"{API}/products/", headers=headers, json=PRODUCT_PAYLOAD)
        assert r.status_code == 200, r.text

    def test_pro_at_limit_returns_403(
        self, client: TestClient, db: Session
    ) -> None:
        """Pro user with 500 products cannot create a 501st."""
        user, email, password = _create_verified_user(db)
        _set_plan(db, user, "pro")
        company = _create_company_for_user(db, user)
        _insert_products(db, company, user, 500)

        headers = _auth_headers(client, email, password)
        r = client.post(f"{API}/products/", headers=headers, json=PRODUCT_PAYLOAD)
        assert r.status_code == 403, r.text
        detail = r.json()["detail"]
        assert detail["error"] == "LIMIT_REACHED"
        assert detail["plan"] == "pro"
        assert detail["limit"] == 500
        assert detail["current_usage"] == 500
        assert detail["next_plan"] == "max"


# ---------------------------------------------------------------------------
# Max plan (unlimited)
# ---------------------------------------------------------------------------

class TestMaxProductUnlimited:
    def test_max_user_can_always_create_products(
        self, client: TestClient, db: Session
    ) -> None:
        """Max plan user with many products can still create more."""
        user, email, password = _create_verified_user(db)
        _set_plan(db, user, "max")
        company = _create_company_for_user(db, user)
        # Simulate having many products — no limit applies
        _insert_products(db, company, user, 5)

        headers = _auth_headers(client, email, password)
        r = client.post(f"{API}/products/", headers=headers, json=PRODUCT_PAYLOAD)
        assert r.status_code == 200, r.text


# ---------------------------------------------------------------------------
# Superuser bypasses limits
# ---------------------------------------------------------------------------

class TestSuperuserProductBypass:
    def test_superuser_can_create_beyond_any_limit(
        self, client: TestClient, db: Session, superuser_token_headers: dict[str, str]
    ) -> None:
        """Superusers are not subject to plan limits."""
        r = client.post(
            f"{API}/products/",
            headers=superuser_token_headers,
            json={**PRODUCT_PAYLOAD, "product_name": "Superuser Product"},
        )
        assert r.status_code == 200, r.text
