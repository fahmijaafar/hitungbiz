"""Tests for Stage A: Subscription Recurring Payment Data Model & Infrastructure.

Covers:
- Personal plan defaults: auto_renew = False, next_renewal_at = None, chip_recurring_token = None
- Active Pro plan without recurring token: auto_renew = False, chip_recurring_token = None
- Active Pro plan with recurring token: chip_recurring_token present, auto_renew remains False by default
- Domain helper functions: is_auto_renew_enabled, has_recurring_token, get_next_renewal_date
- Database uniqueness constraint on SubscriptionRenewal (subscription_id, billing_period_start, billing_period_end)
- SubscriptionPayment payment_type field (initial, manual_renewal, automatic_renewal)
- Public API schema: auto_renew and next_renewal_at present, chip_recurring_token NOT present
"""

import uuid
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from app import crud
from app.core.config import settings
from app.models import (
    SubscriptionPayment,
    SubscriptionRenewal,
    UserCreate,
    UserSubscription,
)
from app.services.subscription_service import (
    _now_utc,
    activate_subscription,
    create_subscription,
    get_current_subscription,
    get_next_renewal_date,
    has_recurring_token,
    is_auto_renew_enabled,
    renew_subscription,
)
from tests.utils.user import create_random_user, user_authentication_headers
from tests.utils.utils import random_email, random_lower_string

API = settings.API_V1_STR


class TestPersonalSubscriptionDefaults:
    def test_personal_plan_has_null_renewal_fields(self, db: Session) -> None:
        """Personal plan must have auto_renew=False, next_renewal_at=None, chip_recurring_token=None."""
        user = create_random_user(db)
        sub = get_current_subscription(db, user.id)

        assert sub is not None
        assert sub.plan == "personal"
        assert sub.auto_renew is False
        assert sub.next_renewal_at is None
        assert sub.chip_recurring_token is None

    def test_personal_plan_helpers(self, db: Session) -> None:
        """Personal subscription should never be auto-renewable."""
        user = create_random_user(db)
        sub = get_current_subscription(db, user.id)

        assert is_auto_renew_enabled(sub) is False
        assert has_recurring_token(sub) is False
        assert get_next_renewal_date(sub) is None


class TestPaidSubscriptionRecurringState:
    def test_paid_plan_without_recurring_token(self, db: Session) -> None:
        """Active Pro plan without recurring token is valid, auto_renew=False."""
        user = create_random_user(db)
        sub = activate_subscription(
            db,
            user_id=user.id,
            plan="pro",
            billing_period="monthly",
        )
        db.commit()

        assert sub.plan == "pro"
        assert sub.status == "active"
        assert sub.auto_renew is False
        assert sub.chip_recurring_token is None
        assert is_auto_renew_enabled(sub) is False
        assert has_recurring_token(sub) is False

    def test_recurring_token_does_not_automatically_enable_auto_renew(self, db: Session) -> None:
        """
        Presence of chip_recurring_token indicates capability to auto-renew,
        but auto_renew remains False until explicitly authorized.
        """
        user = create_random_user(db)
        sub = activate_subscription(
            db,
            user_id=user.id,
            plan="pro",
            billing_period="monthly",
            chip_recurring_token="rec_token_123456",
        )
        db.commit()

        assert sub.chip_recurring_token == "rec_token_123456"
        assert sub.auto_renew is False  # Separated concern!
        assert has_recurring_token(sub) is True
        assert is_auto_renew_enabled(sub) is False  # Requires auto_renew=True

    def test_explicitly_enabled_auto_renew(self, db: Session) -> None:
        """When auto_renew=True and recurring token exists, is_auto_renew_enabled returns True."""
        user = create_random_user(db)
        next_renew = _now_utc() + timedelta(days=30)
        sub = activate_subscription(
            db,
            user_id=user.id,
            plan="pro",
            billing_period="monthly",
            chip_recurring_token="rec_token_123456",
            auto_renew=True,
            next_renewal_at=next_renew,
        )
        db.commit()

        assert sub.auto_renew is True
        assert sub.next_renewal_at == next_renew
        assert is_auto_renew_enabled(sub) is True
        assert has_recurring_token(sub) is True
        assert get_next_renewal_date(sub) == next_renew

    def test_expired_paid_subscription_not_auto_renewable(self, db: Session) -> None:
        """Expired paid subscription should return is_auto_renew_enabled=False."""
        user = create_random_user(db)
        past = _now_utc() - timedelta(days=5)
        sub = activate_subscription(
            db,
            user_id=user.id,
            plan="pro",
            billing_period="monthly",
            chip_recurring_token="rec_token_123456",
            auto_renew=True,
            next_renewal_at=past,
        )
        sub.status = "expired"
        db.commit()

        assert is_auto_renew_enabled(sub) is False
        assert get_next_renewal_date(sub) is None


class TestSubscriptionRenewalModel:
    def test_create_subscription_renewal_record(self, db: Session) -> None:
        """Can create a valid SubscriptionRenewal record."""
        user = create_random_user(db)
        sub = get_current_subscription(db, user.id)
        assert sub is not None

        start_dt = _now_utc()
        end_dt = start_dt + timedelta(days=30)

        renewal = SubscriptionRenewal(
            subscription_id=sub.id,
            user_id=user.id,
            billing_period_start=start_dt,
            billing_period_end=end_dt,
            scheduled_at=end_dt,
            status="pending",
            amount=2900,
            currency="MYR",
        )
        db.add(renewal)
        db.commit()
        db.refresh(renewal)

        assert renewal.id is not None
        assert renewal.subscription_id == sub.id
        assert renewal.user_id == user.id
        assert renewal.status == "pending"
        assert renewal.amount == 2900
        assert renewal.chip_purchase_id is None

    def test_prevent_duplicate_canonical_renewals(self, db: Session) -> None:
        """Unique constraint prevents multiple renewal records for same subscription & period."""
        user = create_random_user(db)
        sub = get_current_subscription(db, user.id)
        assert sub is not None

        start_dt = datetime(2026, 9, 11, 10, 0, tzinfo=timezone.utc)
        end_dt = datetime(2026, 10, 11, 10, 0, tzinfo=timezone.utc)

        renewal1 = SubscriptionRenewal(
            subscription_id=sub.id,
            user_id=user.id,
            billing_period_start=start_dt,
            billing_period_end=end_dt,
            scheduled_at=end_dt,
            status="pending",
            amount=2900,
        )
        db.add(renewal1)
        db.commit()

        renewal2 = SubscriptionRenewal(
            subscription_id=sub.id,
            user_id=user.id,
            billing_period_start=start_dt,
            billing_period_end=end_dt,
            scheduled_at=end_dt,
            status="pending",
            amount=2900,
        )
        db.add(renewal2)

        with pytest.raises(IntegrityError):
            db.commit()

        db.rollback()


class TestSubscriptionPaymentType:
    def test_payment_type_default_and_values(self, db: Session) -> None:
        """SubscriptionPayment supports payment_type field with default 'initial'."""
        user = create_random_user(db)

        p1 = SubscriptionPayment(
            user_id=user.id,
            plan="pro",
            billing_interval="monthly",
            amount=2900,
            reference=f"REF-{uuid.uuid4().hex[:8]}",
        )
        db.add(p1)
        db.commit()
        assert p1.payment_type == "initial"

        p2 = SubscriptionPayment(
            user_id=user.id,
            plan="pro",
            billing_interval="monthly",
            payment_type="automatic_renewal",
            amount=2900,
            reference=f"REF-{uuid.uuid4().hex[:8]}",
        )
        db.add(p2)
        db.commit()
        assert p2.payment_type == "automatic_renewal"


class TestSubscriptionApiPublicSchema:
    def test_api_returns_auto_renew_and_does_not_leak_recurring_token(
        self, client: TestClient, db: Session
    ) -> None:
        """GET /api/v1/subscription/ returns auto_renew and next_renewal_at, but NOT chip_recurring_token."""
        email = random_email()
        password = random_lower_string()
        user_in = UserCreate(email=email, password=password)
        user = crud.create_user(session=db, user_create=user_in)

        # Set a recurring token on the user's subscription
        sub = get_current_subscription(db, user.id)
        assert sub is not None
        sub.chip_recurring_token = "secret_chip_token_abc123"
        db.add(sub)
        db.commit()

        headers = user_authentication_headers(client=client, email=email, password=password)
        r = client.get(f"{API}/subscription/", headers=headers)
        assert r.status_code == 200
        data = r.json()

        assert "auto_renew" in data
        assert data["auto_renew"] is False
        assert "next_renewal_at" in data
        assert data["next_renewal_at"] is None
        # Security check: secret token MUST NOT be leaked to frontend
        assert "chip_recurring_token" not in data
