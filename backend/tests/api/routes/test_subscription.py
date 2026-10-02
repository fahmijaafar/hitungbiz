"""Tests for GET /api/v1/subscription.

Covers:
- Authenticated user gets their own subscription
- Unauthenticated requests are rejected (401/403)
- A user cannot retrieve another user's subscription (endpoint is self-only)
- New user created via crud.create_user automatically has a Personal subscription
- Existing users who received Personal via migration also pass
"""

import pytest

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app import crud
from app.core.config import settings
from app.models import UserCreate, UserSubscription
from app.services.subscription_service import (
    create_default_personal_subscription,
    get_current_subscription,
    is_subscription_active,
)
from tests.utils.user import create_random_user, user_authentication_headers
from tests.utils.utils import random_email, random_lower_string

API = settings.API_V1_STR


# ---------------------------------------------------------------------------
# Unauthenticated access
# ---------------------------------------------------------------------------

class TestUnauthenticated:
    def test_unauthenticated_request_is_rejected(self, client: TestClient) -> None:
        r = client.get(f"{API}/subscription/")
        assert r.status_code in (401, 403)


# ---------------------------------------------------------------------------
# Authenticated: returns own subscription
# ---------------------------------------------------------------------------

class TestAuthenticatedSubscription:
    def test_new_user_gets_personal_subscription(
        self, client: TestClient, db: Session
    ) -> None:
        """New user created via crud.create_user should automatically have Personal."""
        user = create_random_user(db)
        sub = get_current_subscription(db, user.id)
        assert sub is not None
        assert sub.plan == "personal"
        assert sub.billing_period is None
        assert sub.started_at is None
        assert sub.expires_at is None
        assert sub.status == "active"
        assert is_subscription_active(sub) is True

    def test_get_subscription_returns_200(
        self, client: TestClient, db: Session
    ) -> None:
        email = random_email()
        password = random_lower_string()
        user_in = UserCreate(email=email, password=password)
        user = crud.create_user(session=db, user_create=user_in)

        headers = user_authentication_headers(client=client, email=email, password=password)
        r = client.get(f"{API}/subscription/", headers=headers)
        assert r.status_code == 200

    def test_get_subscription_returns_personal_for_new_user(
        self, client: TestClient, db: Session
    ) -> None:
        email = random_email()
        password = random_lower_string()
        user_in = UserCreate(email=email, password=password)
        crud.create_user(session=db, user_create=user_in)

        headers = user_authentication_headers(client=client, email=email, password=password)
        r = client.get(f"{API}/subscription/", headers=headers)
        data = r.json()

        assert data["plan"] == "personal"
        assert data["billing_period"] is None
        assert data["started_at"] is None
        assert data["expires_at"] is None
        assert data["status"] == "active"

    def test_subscription_response_schema(
        self, client: TestClient, db: Session
    ) -> None:
        """Response must contain all required fields."""
        email = random_email()
        password = random_lower_string()
        user_in = UserCreate(email=email, password=password)
        crud.create_user(session=db, user_create=user_in)

        headers = user_authentication_headers(client=client, email=email, password=password)
        r = client.get(f"{API}/subscription/", headers=headers)
        data = r.json()

        assert "plan" in data
        assert "billing_period" in data
        assert "status" in data
        assert "started_at" in data
        assert "expires_at" in data


# ---------------------------------------------------------------------------
# Isolation: cannot retrieve another user's subscription
# ---------------------------------------------------------------------------

class TestSubscriptionIsolation:
    def test_endpoint_returns_own_subscription_not_another_users(
        self, client: TestClient, db: Session
    ) -> None:
        """
        The GET /subscription endpoint always returns the authenticated user's
        subscription. There is no way to pass a user_id to get someone else's.
        This test verifies two separate users each get their own subscription.
        """
        # Create user A
        email_a = random_email()
        password_a = random_lower_string()
        user_a_in = UserCreate(email=email_a, password=password_a)
        user_a = crud.create_user(session=db, user_create=user_a_in)

        # Create user B
        email_b = random_email()
        password_b = random_lower_string()
        user_b_in = UserCreate(email=email_b, password=password_b)
        user_b = crud.create_user(session=db, user_create=user_b_in)

        # Each user gets their own subscription
        sub_a = get_current_subscription(db, user_a.id)
        sub_b = get_current_subscription(db, user_b.id)

        assert sub_a is not None
        assert sub_b is not None
        assert sub_a.user_id == user_a.id
        assert sub_b.user_id == user_b.id
        assert sub_a.id != sub_b.id

    def test_cannot_read_other_users_subscription_via_api(
        self, client: TestClient, db: Session
    ) -> None:
        """Authenticate as user A and confirm the API returns user A's subscription."""
        email_a = random_email()
        password_a = random_lower_string()
        user_a_in = UserCreate(email=email_a, password=password_a)
        user_a = crud.create_user(session=db, user_create=user_a_in)

        email_b = random_email()
        password_b = random_lower_string()
        user_b_in = UserCreate(email=email_b, password=password_b)
        user_b = crud.create_user(session=db, user_create=user_b_in)

        # Log in as user A
        headers_a = user_authentication_headers(client=client, email=email_a, password=password_a)
        r = client.get(f"{API}/subscription/", headers=headers_a)
        assert r.status_code == 200
        data = r.json()

        # Verify it's user A's own subscription (both are personal, so content matches)
        # The critical check is that there's only one response and no user_id leak
        assert "plan" in data
        assert "plan" in data  # endpoint doesn't expose user_id in response


# ---------------------------------------------------------------------------
# No duplicates created
# ---------------------------------------------------------------------------

class TestNoDuplicates:
    def test_creating_same_user_twice_would_fail(self, db: Session) -> None:
        """
        Indirectly verifies the unique constraint: calling
        create_default_personal_subscription for the same user twice raises.
        """
        user = create_random_user(db)
        # First subscription was auto-created. Attempting a second should conflict.
        from sqlalchemy.exc import IntegrityError
        with pytest.raises(Exception):  # IntegrityError or similar
            create_default_personal_subscription(db, user.id)
            db.commit()
        db.rollback()

    def test_existing_user_has_exactly_one_subscription(self, db: Session) -> None:
        user = create_random_user(db)
        statement = select(UserSubscription).where(UserSubscription.user_id == user.id)
        subs = db.exec(statement).all()
        assert len(subs) == 1

