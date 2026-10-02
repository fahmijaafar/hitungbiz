"""HTTP integration tests — client (customer) creation entitlement enforcement.

Tests that POST /clients/ correctly:
- Allows creation when the user is below their plan limit.
- Returns 403 + LIMIT_REACHED when the user is at their plan limit.
- Does not create a client when the limit is reached.
- Superusers bypass the plan limit entirely.
- Max plan users always have unlimited clients.

Client count is controlled by inserting real Client rows directly into the
database, scoped to the user's company_id.
"""

from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, col, func, select

from app import crud
from app.core.config import settings
from app.models import Client, Company, User, UserCreate
from app.services.subscription_service import activate_subscription
from tests.utils.user import user_authentication_headers
from tests.utils.utils import random_email, random_lower_string

API = settings.API_V1_STR

# Minimal valid client payload
CLIENT_PAYLOAD = {
    "name": "Test Client",
    "email": "testclient@example.com",
    "phone_number": "+60123456789",
    "customer_type": "individual",
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
        company_name=f"Client Co {uuid.uuid4().hex[:6]}",
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


def _insert_clients(db: Session, company: Company, user: User, count: int) -> None:
    """Directly insert `count` Client rows into the database."""
    for i in range(count):
        client = Client(
            name=f"Client {i}",
            email=f"client{i}{uuid.uuid4().hex[:4]}@example.com",
            customer_type="individual",
            company_id=company.id,
            user_id=user.id,
        )
        db.add(client)
    db.commit()


def _set_plan(db: Session, user: User, plan: str) -> None:
    billing_period = None if plan == "personal" else "monthly"
    activate_subscription(db, user_id=user.id, plan=plan, billing_period=billing_period)
    db.commit()


def _auth_headers(client: TestClient, email: str, password: str) -> dict[str, str]:
    return user_authentication_headers(client=client, email=email, password=password)


def _count_clients(db: Session, company_id: uuid.UUID) -> int:
    return db.exec(
        select(func.count()).select_from(Client).where(col(Client.company_id) == company_id)
    ).one()


# ---------------------------------------------------------------------------
# Personal plan (limit = 50)
# ---------------------------------------------------------------------------

class TestPersonalClientLimit:
    def test_personal_below_limit_allows_creation(
        self, client: TestClient, db: Session
    ) -> None:
        """Personal user with 49 clients can create one more (49 < 50)."""
        user, email, password = _create_verified_user(db)
        company = _create_company_for_user(db, user)
        _insert_clients(db, company, user, 49)

        headers = _auth_headers(client, email, password)
        r = client.post(f"{API}/clients/", headers=headers, json=CLIENT_PAYLOAD)
        assert r.status_code == 200, r.text

    def test_personal_at_limit_returns_403(
        self, client: TestClient, db: Session
    ) -> None:
        """Personal user with 50 clients cannot create a 51st."""
        user, email, password = _create_verified_user(db)
        company = _create_company_for_user(db, user)
        _insert_clients(db, company, user, 50)

        headers = _auth_headers(client, email, password)
        r = client.post(f"{API}/clients/", headers=headers, json=CLIENT_PAYLOAD)
        assert r.status_code == 403, r.text

    def test_personal_limit_reached_error_body(
        self, client: TestClient, db: Session
    ) -> None:
        """LIMIT_REACHED response body is correctly structured for customers."""
        user, email, password = _create_verified_user(db)
        company = _create_company_for_user(db, user)
        _insert_clients(db, company, user, 50)

        headers = _auth_headers(client, email, password)
        r = client.post(f"{API}/clients/", headers=headers, json=CLIENT_PAYLOAD)
        detail = r.json()["detail"]

        assert detail["error"] == "LIMIT_REACHED"
        assert detail["feature"] == "customers"
        assert detail["plan"] == "personal"
        assert detail["limit"] == 50
        assert detail["current_usage"] == 50
        assert detail["upgrade_required"] is True
        assert detail["next_plan"] == "pro"

    def test_personal_no_client_created_when_limit_reached(
        self, client: TestClient, db: Session
    ) -> None:
        """When the client limit is reached, no Client row is inserted."""
        user, email, password = _create_verified_user(db)
        company = _create_company_for_user(db, user)
        _insert_clients(db, company, user, 50)
        before = _count_clients(db, company.id)

        headers = _auth_headers(client, email, password)
        r = client.post(f"{API}/clients/", headers=headers, json={
            **CLIENT_PAYLOAD, "name": "Should Not Exist",
        })
        assert r.status_code == 403

        after = _count_clients(db, company.id)
        assert after == before  # no new client inserted


# ---------------------------------------------------------------------------
# Pro plan (limit = 1000)
# ---------------------------------------------------------------------------

class TestProClientLimit:
    def test_pro_below_limit_allows_creation(
        self, client: TestClient, db: Session
    ) -> None:
        """Pro user with 999 clients can create one more."""
        user, email, password = _create_verified_user(db)
        _set_plan(db, user, "pro")
        company = _create_company_for_user(db, user)
        _insert_clients(db, company, user, 999)

        headers = _auth_headers(client, email, password)
        r = client.post(f"{API}/clients/", headers=headers, json=CLIENT_PAYLOAD)
        assert r.status_code == 200, r.text

    def test_pro_at_limit_returns_403(
        self, client: TestClient, db: Session
    ) -> None:
        """Pro user with 1000 clients cannot create a 1001st."""
        user, email, password = _create_verified_user(db)
        _set_plan(db, user, "pro")
        company = _create_company_for_user(db, user)
        _insert_clients(db, company, user, 1000)

        headers = _auth_headers(client, email, password)
        r = client.post(f"{API}/clients/", headers=headers, json=CLIENT_PAYLOAD)
        assert r.status_code == 403, r.text
        detail = r.json()["detail"]
        assert detail["error"] == "LIMIT_REACHED"
        assert detail["plan"] == "pro"
        assert detail["limit"] == 1000
        assert detail["current_usage"] == 1000
        assert detail["next_plan"] == "max"


# ---------------------------------------------------------------------------
# Max plan (unlimited)
# ---------------------------------------------------------------------------

class TestMaxClientUnlimited:
    def test_max_user_can_always_create_clients(
        self, client: TestClient, db: Session
    ) -> None:
        """Max plan user with many clients can still create more."""
        user, email, password = _create_verified_user(db)
        _set_plan(db, user, "max")
        company = _create_company_for_user(db, user)
        # Insert a batch to show the limit is not applied
        _insert_clients(db, company, user, 5)

        headers = _auth_headers(client, email, password)
        r = client.post(f"{API}/clients/", headers=headers, json=CLIENT_PAYLOAD)
        assert r.status_code == 200, r.text


# ---------------------------------------------------------------------------
# Superuser bypasses limits
# ---------------------------------------------------------------------------

class TestSuperuserClientBypass:
    def test_superuser_can_create_beyond_any_limit(
        self, client: TestClient, db: Session, superuser_token_headers: dict[str, str]
    ) -> None:
        """Superusers are not subject to plan limits."""
        r = client.post(
            f"{API}/clients/",
            headers=superuser_token_headers,
            json={**CLIENT_PAYLOAD, "name": "Superuser Client"},
        )
        assert r.status_code == 200, r.text
