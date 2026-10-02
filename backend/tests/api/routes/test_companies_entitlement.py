"""HTTP integration tests — company creation entitlement enforcement.

Tests that POST /companies/ correctly:
- Allows creation when the user is below their plan limit.
- Returns 403 + LIMIT_REACHED when the user is at their plan limit.
- Does not create a company when the limit is reached.
- Superusers bypass the plan limit entirely.

Company count is controlled directly in the DB (user.companies JSON field)
without calling the API to create companies, so these tests are fast and
isolated regardless of other test state.
"""

from __future__ import annotations

import json
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session

from app import crud
from app.core.config import settings
from app.models import Company, User, UserCreate
from app.services.subscription_service import activate_subscription
from tests.utils.user import user_authentication_headers
from tests.utils.utils import random_email, random_lower_string

API = settings.API_V1_STR

# ---------------------------------------------------------------------------
# Minimal valid company payload (satisfies CompanyCreate schema)
# ---------------------------------------------------------------------------
COMPANY_PAYLOAD = {
    "company_name": "Test Co",
    "currency": "MYR",
    "registration_number": "",
    "company_email": "test@testco.com",
    "phone_number": "+60123456789",
    "company_url": "",
    "company_address": "",
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _create_verified_user(db: Session) -> tuple[User, str, str]:
    """Create a fresh user with email_verified=True. Returns (user, email, password)."""
    email = random_email()
    password = random_lower_string()
    user_in = UserCreate(email=email, password=password)
    user = crud.create_user(session=db, user_create=user_in)
    user.email_verified = True
    db.add(user)
    db.commit()
    db.refresh(user)
    return user, email, password


def _set_company_count(db: Session, user: User, count: int) -> None:
    """Directly set user.companies to a JSON array of `count` short ID strings."""
    user.companies = json.dumps([str(i) for i in range(count)])
    db.add(user)
    db.commit()
    db.refresh(user)


def _set_plan(db: Session, user: User, plan: str) -> None:
    """Activate the given subscription plan for a user."""
    billing_period = None if plan == "personal" else "monthly"
    activate_subscription(
        db,
        user_id=user.id,
        plan=plan,
        billing_period=billing_period,
    )
    db.commit()


def _auth_headers(client: TestClient, email: str, password: str) -> dict[str, str]:
    return user_authentication_headers(client=client, email=email, password=password)


# ---------------------------------------------------------------------------
# Personal plan (limit = 2)
# ---------------------------------------------------------------------------

class TestPersonalCompanyLimit:
    def test_personal_below_limit_allows_creation(
        self, client: TestClient, db: Session
    ) -> None:
        """Personal user with 1 company can create one more (1 < 2)."""
        user, email, password = _create_verified_user(db)
        _set_company_count(db, user, 1)

        headers = _auth_headers(client, email, password)
        r = client.post(f"{API}/companies/", headers=headers, json=COMPANY_PAYLOAD)
        assert r.status_code == 200, r.text

    def test_personal_at_limit_returns_403(
        self, client: TestClient, db: Session
    ) -> None:
        """Personal user with 2 companies cannot create a 3rd."""
        user, email, password = _create_verified_user(db)
        _set_company_count(db, user, 2)

        headers = _auth_headers(client, email, password)
        r = client.post(f"{API}/companies/", headers=headers, json=COMPANY_PAYLOAD)
        assert r.status_code == 403, r.text

    def test_personal_limit_reached_error_code(
        self, client: TestClient, db: Session
    ) -> None:
        """LIMIT_REACHED response body is correctly structured."""
        user, email, password = _create_verified_user(db)
        _set_company_count(db, user, 2)

        headers = _auth_headers(client, email, password)
        r = client.post(f"{API}/companies/", headers=headers, json=COMPANY_PAYLOAD)
        detail = r.json()["detail"]

        assert detail["error"] == "LIMIT_REACHED"
        assert detail["feature"] == "companies"
        assert detail["plan"] == "personal"
        assert detail["limit"] == 2
        assert detail["current_usage"] == 2
        assert detail["upgrade_required"] is True
        assert detail["next_plan"] == "pro"

    def test_personal_no_company_created_when_limit_reached(
        self, client: TestClient, db: Session
    ) -> None:
        """When limit is hit, no Company row is inserted in the database."""
        user, email, password = _create_verified_user(db)
        _set_company_count(db, user, 2)

        headers = _auth_headers(client, email, password)

        # Count companies before
        from sqlmodel import select as sql_select, col
        from app.models import Company as CompanyModel
        before_count = db.exec(
            sql_select(CompanyModel).where(CompanyModel.company_email == COMPANY_PAYLOAD["company_email"])
        ).all()

        r = client.post(f"{API}/companies/", headers=headers, json={
            **COMPANY_PAYLOAD,
            "company_email": "unique_no_create@testco.com",
        })
        assert r.status_code == 403

        # No new company row inserted with that email
        after = db.exec(
            sql_select(CompanyModel).where(
                CompanyModel.company_email == "unique_no_create@testco.com"
            )
        ).all()
        assert len(after) == 0


# ---------------------------------------------------------------------------
# Pro plan (limit = 10)
# ---------------------------------------------------------------------------

class TestProCompanyLimit:
    def test_pro_below_limit_allows_creation(
        self, client: TestClient, db: Session
    ) -> None:
        """Pro user with 9 companies can create one more (9 < 10)."""
        user, email, password = _create_verified_user(db)
        _set_plan(db, user, "pro")
        _set_company_count(db, user, 9)

        headers = _auth_headers(client, email, password)
        r = client.post(f"{API}/companies/", headers=headers, json=COMPANY_PAYLOAD)
        assert r.status_code == 200, r.text

    def test_pro_at_limit_returns_403(
        self, client: TestClient, db: Session
    ) -> None:
        """Pro user with 10 companies cannot create an 11th."""
        user, email, password = _create_verified_user(db)
        _set_plan(db, user, "pro")
        _set_company_count(db, user, 10)

        headers = _auth_headers(client, email, password)
        r = client.post(f"{API}/companies/", headers=headers, json=COMPANY_PAYLOAD)
        assert r.status_code == 403, r.text

    def test_pro_limit_reached_response(
        self, client: TestClient, db: Session
    ) -> None:
        user, email, password = _create_verified_user(db)
        _set_plan(db, user, "pro")
        _set_company_count(db, user, 10)

        headers = _auth_headers(client, email, password)
        r = client.post(f"{API}/companies/", headers=headers, json=COMPANY_PAYLOAD)
        detail = r.json()["detail"]

        assert detail["error"] == "LIMIT_REACHED"
        assert detail["plan"] == "pro"
        assert detail["limit"] == 10
        assert detail["current_usage"] == 10
        assert detail["next_plan"] == "max"


# ---------------------------------------------------------------------------
# Max plan (limit = 100)
# ---------------------------------------------------------------------------

class TestMaxCompanyLimit:
    def test_max_below_limit_allows_creation(
        self, client: TestClient, db: Session
    ) -> None:
        """Max user with 99 companies can create one more (99 < 100)."""
        user, email, password = _create_verified_user(db)
        _set_plan(db, user, "max")
        _set_company_count(db, user, 99)

        headers = _auth_headers(client, email, password)
        r = client.post(f"{API}/companies/", headers=headers, json=COMPANY_PAYLOAD)
        assert r.status_code == 200, r.text

    def test_max_at_limit_returns_403(
        self, client: TestClient, db: Session
    ) -> None:
        """Max user with 100 companies cannot create a 101st."""
        user, email, password = _create_verified_user(db)
        _set_plan(db, user, "max")
        _set_company_count(db, user, 100)

        headers = _auth_headers(client, email, password)
        r = client.post(f"{API}/companies/", headers=headers, json=COMPANY_PAYLOAD)
        assert r.status_code == 403, r.text

    def test_max_limit_reached_has_no_next_plan(
        self, client: TestClient, db: Session
    ) -> None:
        """When Max plan limit is reached, next_plan is null."""
        user, email, password = _create_verified_user(db)
        _set_plan(db, user, "max")
        _set_company_count(db, user, 100)

        headers = _auth_headers(client, email, password)
        r = client.post(f"{API}/companies/", headers=headers, json=COMPANY_PAYLOAD)
        detail = r.json()["detail"]

        assert detail["error"] == "LIMIT_REACHED"
        assert detail["plan"] == "max"
        assert detail["limit"] == 100
        assert detail["next_plan"] is None


# ---------------------------------------------------------------------------
# Superuser bypasses limits
# ---------------------------------------------------------------------------

class TestSuperuserBypassesLimit:
    def test_superuser_can_create_beyond_personal_limit(
        self, client: TestClient, superuser_token_headers: dict[str, str]
    ) -> None:
        """Superusers are not subject to plan limits."""
        r = client.post(
            f"{API}/companies/",
            headers=superuser_token_headers,
            json={**COMPANY_PAYLOAD, "company_name": "Superuser Bypass Co"},
        )
        assert r.status_code == 200, r.text
