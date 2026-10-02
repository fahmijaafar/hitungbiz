"""HTTP integration tests — Over-Limit Resource Access & Operations.

Tests the fundamental subscription requirement:
- Subscription limits must NEVER automatically delete, hide, disable, or invalidate
  resources created when the user had a higher plan.
- Over-limit state (current_usage > limit) is valid and allows:
  - GET (viewing/listing)
  - PUT (editing)
  - DELETE (removing)
- Only POST (creating additional resources) is blocked when current_usage >= limit.
- Deleting resources until usage < limit allows creation again (at limit=2, 2/2 denied, 1/2 allowed).
- Upgrading resets over_limit and can_create based on the new plan limit.
"""

from __future__ import annotations

import json
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, col, func, select

from app import crud
from app.core.config import settings
from app.models import Client, Company, Product, User, UserCreate
from app.services.subscription_service import activate_subscription
from tests.utils.user import user_authentication_headers
from tests.utils.utils import random_email, random_lower_string

API = settings.API_V1_STR


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


def _auth_headers(client: TestClient, email: str, password: str) -> dict[str, str]:
    return user_authentication_headers(client=client, email=email, password=password)


def _set_plan(db: Session, user: User, plan: str) -> None:
    billing_period = None if plan == "personal" else "monthly"
    activate_subscription(db, user_id=user.id, plan=plan, billing_period=billing_period)
    db.commit()


def _create_companies_for_user(db: Session, user: User, count: int) -> list[Company]:
    companies = []
    company_ids = []
    for i in range(count):
        company = Company(
            company_name=f"OverLimit Co {i} {uuid.uuid4().hex[:4]}",
            currency="MYR",
            company_email=f"co{i}_{uuid.uuid4().hex[:4]}@testco.com",
            phone_number="+60123456789",
            user_id=user.id,
            is_active=True,
        )
        db.add(company)
        db.commit()
        db.refresh(company)
        companies.append(company)
        company_ids.append(str(company.id))

    user.companies = json.dumps(company_ids)
    if companies:
        user.company_id = companies[0].id
    db.add(user)
    db.commit()
    db.refresh(user)
    return companies


# ---------------------------------------------------------------------------
# Companies Over-Limit Tests
# ---------------------------------------------------------------------------

class TestCompaniesOverLimit:
    def test_over_limit_companies_access_and_management(
        self, client: TestClient, db: Session
    ) -> None:
        """Personal plan with 10 companies (limit=2, over_limit=True).

        - Listing companies returns all 10 companies.
        - GET, PUT, DELETE work for existing companies.
        - POST new company is blocked (403 LIMIT_REACHED).
        """
        user, email, password = _create_verified_user(db)

        # User has 10 companies while on Personal plan (limit 2)
        companies = _create_companies_for_user(db, user, 10)
        headers = _auth_headers(client, email, password)

        # 1. GET /companies/ (listing) -> 200, all 10 returned
        res = client.get(f"{API}/companies/", headers=headers)
        assert res.status_code == 200
        data = res.json()
        assert data["count"] == 10
        assert len(data["data"]) == 10

        # 2. GET /companies/{id} -> 200
        target_company = companies[0]
        res = client.get(f"{API}/companies/{target_company.id}", headers=headers)
        assert res.status_code == 200
        assert res.json()["company_name"] == target_company.company_name

        # 3. PUT /companies/{id} (editing) -> 200
        res = client.put(
            f"{API}/companies/{target_company.id}",
            headers=headers,
            json={"company_name": "Updated Over-Limit Co Name"},
        )
        assert res.status_code == 200
        assert res.json()["company_name"] == "Updated Over-Limit Co Name"

        # 4. POST /companies/ (creating 11th) -> 403 LIMIT_REACHED
        res = client.post(
            f"{API}/companies/",
            headers=headers,
            json={
                "company_name": "Blocked 11th Co",
                "currency": "MYR",
                "company_email": "blocked@testco.com",
                "phone_number": "+60123456789",
            },
        )
        assert res.status_code == 403
        detail = res.json()["detail"]
        assert detail["error"] == "LIMIT_REACHED"
        assert detail["current_usage"] == 10
        assert detail["limit"] == 2

    def test_companies_deletion_and_return_to_limit_boundary(
        self, client: TestClient, db: Session
    ) -> None:
        """Deleting companies down to the limit (2) and below (1).

        - At 2 companies (2/2): creation is still blocked.
        - At 1 company (1/2): creation is allowed again.
        """
        user, email, password = _create_verified_user(db)
        companies = _create_companies_for_user(db, user, 3)  # 3 companies
        headers = _auth_headers(client, email, password)

        # At 3 companies (3/2) -> POST blocked
        r = client.post(
            f"{API}/companies/",
            headers=headers,
            json={
                "company_name": "New Co 1",
                "currency": "MYR",
                "company_email": "new1@testco.com",
                "phone_number": "+60123456789",
            },
        )
        assert r.status_code == 403

        # Delete 1 company -> now 2 companies (2/2 limit)
        # Note: company must not be the active company to be deleted, so pick company #2
        del_company = companies[2]
        r = client.delete(f"{API}/companies/{del_company.id}", headers=headers)
        assert r.status_code == 200

        # At 2 companies (2/2) -> POST still blocked
        r = client.post(
            f"{API}/companies/",
            headers=headers,
            json={
                "company_name": "New Co 2",
                "currency": "MYR",
                "company_email": "new2@testco.com",
                "phone_number": "+60123456789",
            },
        )
        assert r.status_code == 403

        # Delete another company -> now 1 company (1/2 limit)
        del_company_2 = companies[1]
        r = client.delete(f"{API}/companies/{del_company_2.id}", headers=headers)
        assert r.status_code == 200

        # At 1 company (1/2) -> POST allowed
        r = client.post(
            f"{API}/companies/",
            headers=headers,
            json={
                "company_name": "Allowed New Co",
                "currency": "MYR",
                "company_email": "allowed@testco.com",
                "phone_number": "+60123456789",
            },
        )
        assert r.status_code == 200


# ---------------------------------------------------------------------------
# Staff Over-Limit Tests
# ---------------------------------------------------------------------------

class TestStaffOverLimit:
    def test_over_limit_staff_access_and_management(
        self, client: TestClient, db: Session
    ) -> None:
        """User on Personal plan with a company having 5 staff members (limit=1).

        - GET staff list works (returns all 5 staff).
        - POST add staff is blocked (403 LIMIT_REACHED).
        - DELETE staff works.
        """
        owner, email, password = _create_verified_user(db)
        company = _create_companies_for_user(db, owner, 1)[0]

        # Add 4 additional staff members to the company
        staff_users = []
        for _ in range(4):
            m, _, _ = _create_verified_user(db)
            m.companies = json.dumps([str(company.id)])
            db.add(m)
            staff_users.append(m)
        db.commit()

        headers = _auth_headers(client, email, password)

        # GET staff -> 200, returns 5 members (owner + 4)
        res = client.get(f"{API}/companies/{company.id}/staff", headers=headers)
        assert res.status_code == 200
        staff_data = res.json()["data"]
        assert len(staff_data) == 5

        # POST new staff -> 403 LIMIT_REACHED
        target, _, _ = _create_verified_user(db)
        res = client.post(
            f"{API}/companies/{company.id}/staff",
            headers=headers,
            json={"email": target.email},
        )
        assert res.status_code == 403
        assert res.json()["detail"]["error"] == "LIMIT_REACHED"

        # DELETE staff -> 200 (removing a staff member works while over limit)
        remove_user = staff_users[0]
        res = client.delete(
            f"{API}/companies/{company.id}/staff/{remove_user.id}",
            headers=headers,
        )
        assert res.status_code == 200


# ---------------------------------------------------------------------------
# Products Over-Limit Tests
# ---------------------------------------------------------------------------

class TestProductsOverLimit:
    def test_over_limit_products_access_and_management(
        self, client: TestClient, db: Session
    ) -> None:
        """Personal plan with 100 products (limit=50, over_limit=True).

        - GET /products/ works and lists products.
        - GET /products/{id} works.
        - PUT /products/{id} works.
        - DELETE /products/{id} works.
        - POST /products/ is blocked (403 LIMIT_REACHED).
        """
        user, email, password = _create_verified_user(db)
        company = _create_companies_for_user(db, user, 1)[0]

        # Insert 60 products directly
        products = []
        for i in range(60):
            p = Product(
                product_name=f"OverLimit Prod {i}",
                category="Test",
                cost_price=10.0,
                sell_price=20.0,
                stock_quantity=5.0,
                unit_type="pcs",
                company_id=company.id,
                user_id=user.id,
            )
            db.add(p)
            products.append(p)
        db.commit()
        for p in products:
            db.refresh(p)

        headers = _auth_headers(client, email, password)

        # GET /products/ -> 200
        res = client.get(f"{API}/products/", headers=headers)
        assert res.status_code == 200
        assert res.json()["count"] == 60

        # GET /products/{id} -> 200
        target = products[0]
        res = client.get(f"{API}/products/{target.id}", headers=headers)
        assert res.status_code == 200
        assert res.json()["product_name"] == target.product_name

        # PUT /products/{id} -> 200
        res = client.put(
            f"{API}/products/{target.id}",
            headers=headers,
            json={"product_name": "Updated Product Name"},
        )
        assert res.status_code == 200
        assert res.json()["product_name"] == "Updated Product Name"

        # POST /products/ -> 403 LIMIT_REACHED
        res = client.post(
            f"{API}/products/",
            headers=headers,
            json={
                "product_name": "Blocked Product",
                "cost_price": 5.0,
                "sell_price": 10.0,
                "stock_quantity": 1.0,
                "unit_type": "pcs",
            },
        )
        assert res.status_code == 403
        assert res.json()["detail"]["error"] == "LIMIT_REACHED"

        # DELETE /products/{id} -> 200
        res = client.delete(f"{API}/products/{target.id}", headers=headers)
        assert res.status_code == 200


# ---------------------------------------------------------------------------
# Customers (Clients) Over-Limit Tests
# ---------------------------------------------------------------------------

class TestCustomersOverLimit:
    def test_over_limit_customers_access_and_management(
        self, client: TestClient, db: Session
    ) -> None:
        """Personal plan with 60 customers (limit=50, over_limit=True).

        - GET /clients/ works and lists clients.
        - GET /clients/{id} works.
        - PUT /clients/{id} works.
        - DELETE /clients/{id} works.
        - POST /clients/ is blocked (403 LIMIT_REACHED).
        """
        user, email, password = _create_verified_user(db)
        company = _create_companies_for_user(db, user, 1)[0]

        # Insert 60 clients directly
        clients = []
        for i in range(60):
            c = Client(
                name=f"OverLimit Client {i}",
                email=f"client{i}_{uuid.uuid4().hex[:4]}@example.com",
                customer_type="individual",
                company_id=company.id,
                user_id=user.id,
            )
            db.add(c)
            clients.append(c)
        db.commit()
        for c in clients:
            db.refresh(c)

        headers = _auth_headers(client, email, password)

        # GET /clients/ -> 200
        res = client.get(f"{API}/clients/", headers=headers)
        assert res.status_code == 200
        assert res.json()["count"] == 60

        # GET /clients/{id} -> 200
        target = clients[0]
        res = client.get(f"{API}/clients/{target.id}", headers=headers)
        assert res.status_code == 200
        assert res.json()["name"] == target.name

        # PUT /clients/{id} -> 200
        res = client.put(
            f"{API}/clients/{target.id}",
            headers=headers,
            json={"name": "Updated Client Name"},
        )
        assert res.status_code == 200
        assert res.json()["name"] == "Updated Client Name"

        # POST /clients/ -> 403 LIMIT_REACHED
        res = client.post(
            f"{API}/clients/",
            headers=headers,
            json={"name": "Blocked Client", "email": "blocked@example.com", "customer_type": "individual"},
        )
        assert res.status_code == 403
        assert res.json()["detail"]["error"] == "LIMIT_REACHED"

        # DELETE /clients/{id} -> 200
        res = client.delete(f"{API}/clients/{target.id}", headers=headers)
        assert res.status_code == 200


# ---------------------------------------------------------------------------
# Subscription Entitlement Endpoint Tests
# ---------------------------------------------------------------------------

class TestSubscriptionEntitlementEndpoint:
    def test_get_entitlement_status_endpoint(
        self, client: TestClient, db: Session
    ) -> None:
        """GET /subscription/entitlement/{feature} returns structured status."""
        user, email, password = _create_verified_user(db)
        _create_companies_for_user(db, user, 10)  # 10 companies on Personal (limit 2)
        headers = _auth_headers(client, email, password)

        res = client.get(f"{API}/subscription/entitlement/companies", headers=headers)
        assert res.status_code == 200
        data = res.json()

        assert data["feature"] == "companies"
        assert data["plan"] == "personal"
        assert data["limit"] == 2
        assert data["current_usage"] == 10
        assert data["over_limit"] is True
        assert data["can_create"] is False

    def test_get_entitlement_status_invalid_feature(
        self, client: TestClient, db: Session
    ) -> None:
        user, email, password = _create_verified_user(db)
        headers = _auth_headers(client, email, password)

        res = client.get(f"{API}/subscription/entitlement/invalid_feature", headers=headers)
        assert res.status_code == 400
