"""HTTP integration tests — staff creation entitlement enforcement.

Tests that POST /companies/{id}/staff correctly:
- Allows adding staff when the owner is below their plan limit.
- Returns 403 + LIMIT_REACHED when the owner is at their plan limit.
- Does not add a staff member when the limit is reached.
- Superusers bypass the plan limit entirely.
- Max plan users always have unlimited staff.

Staff count is controlled by creating real User records in the DB whose
``companies`` JSON array contains the company ID string. This mirrors the
exact logic used by the ``get_staff_count`` helper and ``read_company_staff``.
"""

from __future__ import annotations

import json
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app import crud
from app.core.config import settings
from app.models import Company, User, UserCreate
from app.services.subscription_service import activate_subscription
from tests.utils.user import user_authentication_headers
from tests.utils.utils import random_email, random_lower_string

API = settings.API_V1_STR


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


def _create_company_for_owner(db: Session, owner: User) -> Company:
    """Create a Company owned by `owner` and grant them access."""
    company = Company(
        company_name=f"Test Co {uuid.uuid4().hex[:6]}",
        currency="MYR",
        company_email=f"{uuid.uuid4().hex}@testco.com",
        phone_number="+60123456789",
        user_id=owner.id,
    )
    db.add(company)
    db.commit()
    db.refresh(company)

    # Grant owner access via companies JSON
    try:
        ids = json.loads(owner.companies or "[]")
    except (json.JSONDecodeError, TypeError):
        ids = []
    if not isinstance(ids, list):
        ids = []
    if str(company.id) not in ids:
        ids.append(str(company.id))
    owner.companies = json.dumps(ids)
    db.add(owner)
    db.commit()
    db.refresh(owner)
    return company


def _add_n_members(db: Session, company: Company, n: int) -> list[User]:
    """Create n users as members of `company` (not owner)."""
    members = []
    for _ in range(n):
        email = random_email()
        password = random_lower_string()
        user_in = UserCreate(email=email, password=password)
        member = crud.create_user(session=db, user_create=user_in)
        member.email_verified = True
        # Grant membership
        try:
            ids = json.loads(member.companies or "[]")
        except (json.JSONDecodeError, TypeError):
            ids = []
        if not isinstance(ids, list):
            ids = []
        ids.append(str(company.id))
        member.companies = json.dumps(ids)
        db.add(member)
        db.commit()
        db.refresh(member)
        members.append(member)
    return members


def _set_plan(db: Session, user: User, plan: str) -> None:
    """Activate the given subscription plan for a user."""
    billing_period = None if plan == "personal" else "monthly"
    activate_subscription(db, user_id=user.id, plan=plan, billing_period=billing_period)
    db.commit()


def _auth_headers(client: TestClient, email: str, password: str) -> dict[str, str]:
    return user_authentication_headers(client=client, email=email, password=password)


# ---------------------------------------------------------------------------
# Personal plan (staff limit = 1)
# Staff = 1 owner; adding 1 member → total would be 2 → DENIED
# ---------------------------------------------------------------------------

class TestPersonalStaffLimit:
    def test_personal_owner_alone_can_add_first_member(
        self, client: TestClient, db: Session
    ) -> None:
        """Personal owner with only themselves (count=1) should be DENIED (1 >= 1)."""
        # The owner IS the only staff member (count=1), limit=1 → denied
        owner, email, password = _create_verified_user(db)
        company = _create_company_for_owner(db, owner)

        # Create a target user to add
        target, _, _ = _create_verified_user(db)

        headers = _auth_headers(client, email, password)
        r = client.post(
            f"{API}/companies/{company.id}/staff",
            headers=headers,
            json={"email": target.email},
        )
        assert r.status_code == 403, r.text
        detail = r.json()["detail"]
        assert detail["error"] == "LIMIT_REACHED"
        assert detail["feature"] == "staff"
        assert detail["plan"] == "personal"
        assert detail["limit"] == 1
        assert detail["current_usage"] == 1
        assert detail["next_plan"] == "pro"

    def test_personal_limit_reached_does_not_add_member(
        self, client: TestClient, db: Session
    ) -> None:
        """When the staff limit is reached, no membership is actually granted."""
        owner, email, password = _create_verified_user(db)
        company = _create_company_for_owner(db, owner)
        target, _, _ = _create_verified_user(db)

        headers = _auth_headers(client, email, password)
        r = client.post(
            f"{API}/companies/{company.id}/staff",
            headers=headers,
            json={"email": target.email},
        )
        assert r.status_code == 403

        # Verify the target user was NOT granted membership
        db.refresh(target)
        try:
            company_ids = json.loads(target.companies or "[]")
        except (json.JSONDecodeError, TypeError):
            company_ids = []
        assert str(company.id) not in company_ids


# ---------------------------------------------------------------------------
# Pro plan (staff limit = 5)
# ---------------------------------------------------------------------------

class TestProStaffLimit:
    def test_pro_four_total_staff_can_add_one_more(
        self, client: TestClient, db: Session
    ) -> None:
        """Pro owner with 4 total staff (1 owner + 3 members) can add 1 more (4 < 5)."""
        owner, email, password = _create_verified_user(db)
        _set_plan(db, owner, "pro")
        company = _create_company_for_owner(db, owner)
        # 1 owner + 3 members = 4 total → can add one more
        _add_n_members(db, company, 3)

        target, _, _ = _create_verified_user(db)
        headers = _auth_headers(client, email, password)
        r = client.post(
            f"{API}/companies/{company.id}/staff",
            headers=headers,
            json={"email": target.email},
        )
        assert r.status_code == 200, r.text

    def test_pro_five_total_staff_denied(
        self, client: TestClient, db: Session
    ) -> None:
        """Pro owner with 5 total staff (1 owner + 4 members) cannot add more (5 >= 5)."""
        owner, email, password = _create_verified_user(db)
        _set_plan(db, owner, "pro")
        company = _create_company_for_owner(db, owner)
        # 1 owner + 4 members = 5 total → at limit
        _add_n_members(db, company, 4)

        target, _, _ = _create_verified_user(db)
        headers = _auth_headers(client, email, password)
        r = client.post(
            f"{API}/companies/{company.id}/staff",
            headers=headers,
            json={"email": target.email},
        )
        assert r.status_code == 403, r.text
        detail = r.json()["detail"]
        assert detail["error"] == "LIMIT_REACHED"
        assert detail["feature"] == "staff"
        assert detail["plan"] == "pro"
        assert detail["limit"] == 5
        assert detail["current_usage"] == 5
        assert detail["next_plan"] == "max"


# ---------------------------------------------------------------------------
# Max plan (staff = unlimited)
# ---------------------------------------------------------------------------

class TestMaxStaffUnlimited:
    def test_max_user_can_always_add_staff(
        self, client: TestClient, db: Session
    ) -> None:
        """Max plan owner with many staff can still add more."""
        owner, email, password = _create_verified_user(db)
        _set_plan(db, owner, "max")
        company = _create_company_for_owner(db, owner)
        # Add 10 members to show no limit applies
        _add_n_members(db, company, 10)

        target, _, _ = _create_verified_user(db)
        headers = _auth_headers(client, email, password)
        r = client.post(
            f"{API}/companies/{company.id}/staff",
            headers=headers,
            json={"email": target.email},
        )
        assert r.status_code == 200, r.text


# ---------------------------------------------------------------------------
# Superuser bypasses limits
# ---------------------------------------------------------------------------

class TestSuperuserStaffBypass:
    def test_superuser_bypasses_staff_limit(
        self, client: TestClient, db: Session, superuser_token_headers: dict[str, str]
    ) -> None:
        """Superusers can add staff regardless of plan limits."""
        # Create a regular owner (personal plan) with a company already at limit (1 staff)
        owner, _, _ = _create_verified_user(db)
        company = _create_company_for_owner(db, owner)

        target, _, _ = _create_verified_user(db)

        r = client.post(
            f"{API}/companies/{company.id}/staff",
            headers=superuser_token_headers,
            json={"email": target.email},
        )
        # Superuser bypasses entitlement
        assert r.status_code == 200, r.text
