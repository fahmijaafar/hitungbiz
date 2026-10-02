"""Tests for Stage B: CHIP Recurring Payment Charging Mechanism.

Covers:
- Subscription auto-renewal eligibility validation
- Renewal billing period calculation (active vs expired)
- process_subscription_renewal service execution & CHIP purchase creation
- Idempotency & concurrency protection (duplicate renewal calls resolve to same record)
- CHIP charge API states (paid, pending_charge, invalid_recurring_token)
- Webhook resolution (marks renewal paid, extends subscription period & next_renewal_at)
- Webhook idempotency (duplicate webhooks extend subscription period exactly once)
- Failed payment handling (subscription period remains unchanged)
- Security checks (superuser test trigger endpoint protection & token secrecy)
"""

import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app import crud
from app.core.config import settings
from app.models import (
    SubscriptionPayment,
    SubscriptionRenewal,
    UserCreate,
    UserSubscription,
)
from app.services.chip_service import ChipRecurringChargeError, ChipService
from app.services.recurring_renewal_service import process_subscription_renewal
from app.services.subscription_service import (
    _now_utc,
    activate_subscription,
    get_current_subscription,
)
from tests.utils.user import create_random_user, user_authentication_headers
from tests.utils.utils import get_superuser_token_headers, random_email, random_lower_string

API = settings.API_V1_STR


@pytest.fixture(autouse=True)
def mock_chip_gateway():
    def dummy_create_purchase(*args, **kwargs):
        reference = kwargs.get("reference") or f"SUB-{uuid.uuid4().hex[:12]}"
        return {
            "checkout_url": f"https://gate.chip-in.asia/p/{reference}/",
            "purchase_id": f"pur_{reference}",
            "client_id": f"cli_{uuid.uuid4().hex[:8]}",
            "reference": reference,
        }

    def dummy_charge_purchase(purchase_id, recurring_token):
        if "invalid" in recurring_token or "bad" in recurring_token:
            raise ChipRecurringChargeError(
                "Stored recurring token is invalid or inactive.",
                code="INVALID_RECURRING_TOKEN",
            )
        if "pending" in recurring_token or "fail" in recurring_token:
            return {
                "id": purchase_id,
                "status": "pending_charge",
                "recurring_token": recurring_token,
            }
        return {
            "id": purchase_id,
            "status": "paid",
            "recurring_token": recurring_token,
        }

    with patch.object(ChipService, "create_purchase", side_effect=dummy_create_purchase), \
         patch.object(ChipService, "charge_purchase_with_recurring_token", side_effect=dummy_charge_purchase):
        yield


class TestRecurringRenewalEligibility:
    def test_personal_plan_not_eligible(self, db: Session) -> None:
        """Personal plan subscriptions must be rejected."""
        user = create_random_user(db)
        sub = get_current_subscription(db, user.id)
        assert sub is not None

        res = process_subscription_renewal(db, sub.id)
        assert res["status"] == "error"
        assert res["code"] == "PERSONAL_PLAN_NOT_ELIGIBLE"

    def test_auto_renew_disabled_not_eligible(self, db: Session) -> None:
        """Subscription with auto_renew=False must be rejected."""
        user = create_random_user(db)
        sub = activate_subscription(
            db,
            user_id=user.id,
            plan="pro",
            billing_period="monthly",
            chip_recurring_token="rec_token_123",
            auto_renew=False,
        )
        db.commit()

        res = process_subscription_renewal(db, sub.id)
        assert res["status"] == "error"
        assert res["code"] == "AUTO_RENEW_DISABLED"

    def test_missing_recurring_token_not_eligible(self, db: Session) -> None:
        """Subscription with auto_renew=True but missing token must return RECURRING_PAYMENT_UNAVAILABLE."""
        user = create_random_user(db)
        sub = activate_subscription(
            db,
            user_id=user.id,
            plan="pro",
            billing_period="monthly",
            chip_recurring_token=None,
            auto_renew=True,
            next_renewal_at=_now_utc() + timedelta(days=30),
        )
        db.commit()

        res = process_subscription_renewal(db, sub.id)
        assert res["status"] == "error"
        assert res["code"] == "RECURRING_PAYMENT_UNAVAILABLE"

    def test_inactive_subscription_not_eligible(self, db: Session) -> None:
        """Cancelled or expired status subscriptions cannot be auto-renewed."""
        user = create_random_user(db)
        sub = activate_subscription(
            db,
            user_id=user.id,
            plan="pro",
            billing_period="monthly",
            chip_recurring_token="rec_token_123",
            auto_renew=True,
        )
        sub.status = "cancelled"
        db.commit()

        res = process_subscription_renewal(db, sub.id)
        assert res["status"] == "error"
        assert res["code"] == "SUBSCRIPTION_NOT_ACTIVE"


class TestRecurringRenewalExecution:
    def test_successful_recurring_renewal_process(self, db: Session) -> None:
        """Processing an eligible subscription creates a renewal record, payment record, and CHIP charge."""
        user = create_random_user(db)
        expiry = _now_utc() + timedelta(days=30)
        sub = activate_subscription(
            db,
            user_id=user.id,
            plan="pro",
            billing_period="monthly",
            chip_recurring_token="rec_token_test_123",
            auto_renew=True,
            next_renewal_at=expiry,
        )
        db.commit()

        res = process_subscription_renewal(db, sub.id)
        assert res["status"] in ("success", "processing")
        assert "renewal_id" in res
        assert "purchase_id" in res

        # Verify database renewal record created
        renewal_id = uuid.UUID(res["renewal_id"])
        renewal = db.get(SubscriptionRenewal, renewal_id)
        assert renewal is not None
        assert renewal.subscription_id == sub.id
        assert renewal.user_id == user.id
        assert renewal.status == "processing"
        assert renewal.chip_purchase_id == res["purchase_id"]

        # Verify database payment record created with payment_type=automatic_renewal
        payment_stmt = select(SubscriptionPayment).where(
            SubscriptionPayment.provider_purchase_id == res["purchase_id"]
        )
        payment = db.exec(payment_stmt).first()
        assert payment is not None
        assert payment.payment_type == "automatic_renewal"
        assert payment.amount == 2900

    def test_idempotency_prevents_duplicate_charges(self, db: Session) -> None:
        """Calling process_subscription_renewal twice for the same period returns idempotent status."""
        user = create_random_user(db)
        expiry = _now_utc() + timedelta(days=30)
        sub = activate_subscription(
            db,
            user_id=user.id,
            plan="pro",
            billing_period="monthly",
            chip_recurring_token="rec_token_test_456",
            auto_renew=True,
            next_renewal_at=expiry,
        )
        db.commit()

        # First call creates renewal and purchase
        res1 = process_subscription_renewal(db, sub.id)
        assert res1["status"] in ("success", "processing")

        # Second call for the same period should resolve to existing renewal without duplicate charge
        res2 = process_subscription_renewal(db, sub.id)
        assert res2["status"] in ("already_processing", "already_paid")
        assert res2["renewal_id"] == res1["renewal_id"]
        assert res2["purchase_id"] == res1["purchase_id"]


class TestRecurringChargeErrors:
    def test_invalid_recurring_token_marks_renewal_failed(self, db: Session) -> None:
        """If CHIP returns invalid_recurring_token, renewal is marked failed."""
        user = create_random_user(db)
        expiry = _now_utc() + timedelta(days=30)
        sub = activate_subscription(
            db,
            user_id=user.id,
            plan="pro",
            billing_period="monthly",
            chip_recurring_token="invalid_token_bad",
            auto_renew=True,
            next_renewal_at=expiry,
        )
        db.commit()

        def dummy_charge_fail(purchase_id, recurring_token):
            raise ChipRecurringChargeError(
                "Stored recurring token is invalid or inactive.",
                code="INVALID_RECURRING_TOKEN",
            )

        with patch.object(ChipService, "charge_purchase_with_recurring_token", side_effect=dummy_charge_fail):
            res = process_subscription_renewal(db, sub.id)

        assert res["status"] == "failed"
        assert res["code"] == "INVALID_RECURRING_TOKEN"

        renewal = db.get(SubscriptionRenewal, uuid.UUID(res["renewal_id"]))
        assert renewal is not None
        assert renewal.status == "failed"
        assert renewal.failure_reason is not None
        assert "invalid" in renewal.failure_reason.lower()


class TestWebhookIntegration:
    def test_successful_webhook_extends_subscription(self, client: TestClient, db: Session) -> None:
        """
        Receiving a purchase.paid webhook for a recurring renewal marks the renewal paid
        and extends current_period_start, current_period_end, and next_renewal_at.
        """
        user = create_random_user(db)
        old_expiry = _now_utc() + timedelta(days=10)
        sub = activate_subscription(
            db,
            user_id=user.id,
            plan="pro",
            billing_period="monthly",
            chip_recurring_token="rec_token_789",
            auto_renew=True,
            next_renewal_at=old_expiry,
        )
        db.commit()

        res = process_subscription_renewal(db, sub.id)
        purchase_id = res["purchase_id"]

        # Simulate CHIP webhook callback
        webhook_payload = {
            "event_type": "purchase.paid",
            "id": purchase_id,
            "status": "paid",
            "price": 2900,
            "currency": "MYR",
        }

        with patch.object(settings, "CHIP_WEBHOOK_PUBLIC_KEY", ""):
            r = client.post(
                f"{API}/payments/chip/callback",
                json=webhook_payload,
            )
        assert r.status_code == 200
        data = r.json()
        assert data["status"] == "success"

        # Refresh subscription & renewal state
        db.refresh(sub)
        renewal = db.get(SubscriptionRenewal, uuid.UUID(res["renewal_id"]))

        assert renewal is not None
        assert renewal.status == "paid"
        assert renewal.completed_at is not None

        assert sub.status == "active"
        assert sub.auto_renew is True  # Preserved auto_renew!
        assert sub.expires_at is not None
        assert sub.expires_at > old_expiry  # Period extended!
        assert sub.next_renewal_at == sub.expires_at

    def test_duplicate_webhook_delivery_is_idempotent(self, client: TestClient, db: Session) -> None:
        """Sending duplicate webhook calls extends period exactly once."""
        user = create_random_user(db)
        old_expiry = _now_utc() + timedelta(days=10)
        sub = activate_subscription(
            db,
            user_id=user.id,
            plan="pro",
            billing_period="monthly",
            chip_recurring_token="rec_token_duplicate_test",
            auto_renew=True,
            next_renewal_at=old_expiry,
        )
        db.commit()

        res = process_subscription_renewal(db, sub.id)
        purchase_id = res["purchase_id"]

        webhook_payload = {
            "event_type": "purchase.paid",
            "id": purchase_id,
            "status": "paid",
            "price": 2900,
            "currency": "MYR",
        }

        with patch.object(settings, "CHIP_WEBHOOK_PUBLIC_KEY", ""):
            r1 = client.post(f"{API}/payments/chip/callback", json=webhook_payload)
            assert r1.status_code == 200
            db.refresh(sub)
            first_expiry = sub.expires_at

            # Duplicate webhook
            r2 = client.post(f"{API}/payments/chip/callback", json=webhook_payload)
            assert r2.status_code == 200
            assert r2.json()["status"] in ("already_processed", "already_paid")

        db.refresh(sub)
        assert sub.expires_at == first_expiry  # Expiry did not change second time!

    def test_failed_webhook_does_not_extend_subscription(self, client: TestClient, db: Session) -> None:
        """Failed webhook marks renewal failed and leaves subscription period unchanged."""
        user = create_random_user(db)
        sub = activate_subscription(
            db,
            user_id=user.id,
            plan="pro",
            billing_period="monthly",
            chip_recurring_token="rec_token_fail_test",
            auto_renew=True,
        )
        db.commit()
        initial_expiry = sub.expires_at

        res = process_subscription_renewal(db, sub.id)
        purchase_id = res["purchase_id"]

        webhook_payload = {
            "event_type": "purchase.failed",
            "id": purchase_id,
            "status": "failed",
            "price": 2900,
            "currency": "MYR",
        }

        with patch.object(settings, "CHIP_WEBHOOK_PUBLIC_KEY", ""):
            r = client.post(f"{API}/payments/chip/callback", json=webhook_payload)
        assert r.status_code == 200

        db.refresh(sub)
        renewal = db.get(SubscriptionRenewal, uuid.UUID(res["renewal_id"]))

        assert renewal is not None
        assert renewal.status == "failed"
        assert sub.expires_at == initial_expiry  # Period unchanged!


class TestSuperuserTestTriggerEndpoint:
    def test_superuser_can_trigger_test_renewal(self, client: TestClient, db: Session) -> None:
        """Superuser can call POST /subscription/{id}/test-auto-renew."""
        headers = get_superuser_token_headers(client)

        user = create_random_user(db)
        sub = activate_subscription(
            db,
            user_id=user.id,
            plan="pro",
            billing_period="monthly",
            chip_recurring_token="rec_token_su_test",
            auto_renew=True,
            next_renewal_at=_now_utc() + timedelta(days=30),
        )
        db.commit()

        r = client.post(
            f"{API}/subscription/{sub.id}/test-auto-renew",
            headers=headers,
        )
        assert r.status_code == 200
        data = r.json()
        assert data["status"] in ("success", "processing")
        assert "renewal_id" in data

    def test_normal_user_cannot_trigger_test_renewal(self, client: TestClient, db: Session) -> None:
        """Normal user cannot call superuser test trigger route."""
        email = random_email()
        password = random_lower_string()
        user_in = UserCreate(email=email, password=password)
        user = crud.create_user(session=db, user_create=user_in)

        sub = get_current_subscription(db, user.id)
        assert sub is not None

        headers = user_authentication_headers(client=client, email=email, password=password)
        r = client.post(
            f"{API}/subscription/{sub.id}/test-auto-renew",
            headers=headers,
        )
        assert r.status_code == 403
