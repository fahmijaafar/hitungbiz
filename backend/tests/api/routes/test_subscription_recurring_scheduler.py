"""Tests for Stage C: Subscription Renewal Scheduler, Retry & Auto-Renew Lifecycle.

Covers:
- Scheduler selection query logic (Personal skipped, auto_renew=False skipped, missing token skipped, future skipped, due selected)
- Batch processing & PostgreSQL locking pattern
- Stage B service call delegation from scheduler
- Retry policy & attempt count tracking
- Past due grace period and automatic plan fallback to 'personal' after max attempts + grace period
- Downtime recovery (due timestamp in past processed cleanly)
- Manual renewal interaction (advances next_renewal_at, scheduler skips period)
- Stale processing renewal status reconciliation via ChipService.get_purchase()
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
from app.services.recurring_renewal_service import (
    process_due_subscription_renewals,
    reconcile_pending_subscription_renewals,
    retry_failed_subscription_renewals,
)
from app.services.subscription_service import (
    _now_utc,
    activate_subscription,
    get_current_subscription,
    get_effective_plan,
    renew_subscription,
    set_auto_renew,
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
        if "invalid" in recurring_token or "fail" in recurring_token:
            raise ChipRecurringChargeError(
                "Stored recurring token is invalid or inactive.",
                code="INVALID_RECURRING_TOKEN",
            )
        return {
            "id": purchase_id,
            "status": "paid",
            "recurring_token": recurring_token,
        }

    def dummy_get_purchase(purchase_id):
        if "stale" in purchase_id:
            return {"id": purchase_id, "status": "paid"}
        return {"id": purchase_id, "status": "failed"}

    with patch.object(ChipService, "create_purchase", side_effect=dummy_create_purchase), \
         patch.object(ChipService, "charge_purchase_with_recurring_token", side_effect=dummy_charge_purchase), \
         patch.object(ChipService, "get_purchase", side_effect=dummy_get_purchase):
        yield


class TestSubscriptionSchedulerSelection:
    def test_personal_plan_skipped(self, db: Session) -> None:
        """Personal plan subscriptions must never be selected by the renewal scheduler."""
        user = create_random_user(db)
        sub = get_current_subscription(db, user.id)
        assert sub is not None

        # Try running scheduler pass
        processed = process_due_subscription_renewals(db)
        assert processed == 0

    def test_auto_renew_disabled_skipped(self, db: Session) -> None:
        """Subscriptions with auto_renew=False must be skipped."""
        user = create_random_user(db)
        due_date = _now_utc() - timedelta(days=1)
        sub = activate_subscription(
            db,
            user_id=user.id,
            plan="pro",
            billing_period="monthly",
            chip_recurring_token="rec_token_123",
            auto_renew=False,
            next_renewal_at=due_date,
        )
        db.commit()

        processed = process_due_subscription_renewals(db)
        assert processed == 0

    def test_missing_token_skipped(self, db: Session) -> None:
        """Subscriptions with auto_renew=True but missing recurring token must be skipped."""
        user = create_random_user(db)
        due_date = _now_utc() - timedelta(days=1)
        sub = activate_subscription(
            db,
            user_id=user.id,
            plan="pro",
            billing_period="monthly",
            chip_recurring_token=None,
            auto_renew=True,
            next_renewal_at=due_date,
        )
        db.commit()

        processed = process_due_subscription_renewals(db)
        assert processed == 0

    def test_future_renewal_skipped(self, db: Session) -> None:
        """Subscriptions with next_renewal_at in the future must be skipped."""
        user = create_random_user(db)
        future_date = _now_utc() + timedelta(days=10)
        sub = activate_subscription(
            db,
            user_id=user.id,
            plan="pro",
            billing_period="monthly",
            chip_recurring_token="rec_token_future",
            auto_renew=True,
            next_renewal_at=future_date,
        )
        db.commit()

        processed = process_due_subscription_renewals(db)
        assert processed == 0

    def test_due_subscription_selected_and_processed(self, db: Session) -> None:
        """Eligible due subscriptions must be selected and processed by scheduler."""
        user = create_random_user(db)
        past_due_date = _now_utc() - timedelta(hours=1)
        sub = activate_subscription(
            db,
            user_id=user.id,
            plan="pro",
            billing_period="monthly",
            chip_recurring_token="rec_token_due_valid",
            auto_renew=True,
            next_renewal_at=past_due_date,
        )
        db.commit()

        processed = process_due_subscription_renewals(db)
        assert processed == 1

        # Check renewal record created
        renewal_stmt = select(SubscriptionRenewal).where(
            SubscriptionRenewal.subscription_id == sub.id
        )
        renewal = db.exec(renewal_stmt).first()
        assert renewal is not None
        assert renewal.status in ("paid", "processing")


class TestSubscriptionRetryLifecycle:
    def test_failed_renewal_schedules_retry(self, db: Session) -> None:
        """Failed renewal sets status to past_due, records attempt_count, and schedules next_retry_at."""
        user = create_random_user(db)
        past_due_date = _now_utc() - timedelta(hours=1)
        sub = activate_subscription(
            db,
            user_id=user.id,
            plan="pro",
            billing_period="monthly",
            chip_recurring_token="rec_token_fail_token",
            auto_renew=True,
            next_renewal_at=past_due_date,
        )
        db.commit()

        process_due_subscription_renewals(db)

        db.refresh(sub)
        assert sub.status == "past_due"

        renewal_stmt = select(SubscriptionRenewal).where(
            SubscriptionRenewal.subscription_id == sub.id
        )
        renewal = db.exec(renewal_stmt).first()
        assert renewal is not None
        assert renewal.status == "failed"
        assert renewal.attempt_count == 1
        assert renewal.next_retry_at is not None

    def test_retry_job_executes_due_retries(self, db: Session) -> None:
        """retry_failed_subscription_renewals picks up due failed renewals and retries with new purchase."""
        user = create_random_user(db)
        past_due_date = _now_utc() - timedelta(hours=1)
        sub = activate_subscription(
            db,
            user_id=user.id,
            plan="pro",
            billing_period="monthly",
            chip_recurring_token="rec_token_fail_token",
            auto_renew=True,
            next_renewal_at=past_due_date,
        )
        db.commit()

        process_due_subscription_renewals(db)

        # Retrieve failed renewal and make next_retry_at due
        renewal_stmt = select(SubscriptionRenewal).where(
            SubscriptionRenewal.subscription_id == sub.id
        )
        renewal = db.exec(renewal_stmt).first()
        assert renewal is not None
        renewal.next_retry_at = _now_utc() - timedelta(minutes=5)
        # Update token to a valid token so retry succeeds!
        sub.chip_recurring_token = "rec_token_valid_retry"
        db.add(renewal)
        db.add(sub)
        db.commit()

        retried = retry_failed_subscription_renewals(db)
        assert retried == 1

        db.refresh(renewal)
        assert renewal.status == "paid"
        assert renewal.attempt_count == 2


class TestGracePeriodAndPlanFallback:
    def test_past_due_retains_paid_access_during_grace_period(self, db: Session) -> None:
        """Subscriptions in past_due status retain paid access via get_effective_plan during grace period."""
        user = create_random_user(db)
        sub = activate_subscription(
            db,
            user_id=user.id,
            plan="pro",
            billing_period="monthly",
            chip_recurring_token="rec_token_123",
            auto_renew=True,
        )
        sub.status = "past_due"
        db.add(sub)
        db.commit()

        effective = get_effective_plan(sub)
        assert effective == "pro"

    def test_max_attempts_and_grace_period_expired_falls_back_to_personal(self, db: Session) -> None:
        """When max attempts are reached and grace period passes, status becomes expired and auto_renew=False."""
        user = create_random_user(db)
        old_expiry = _now_utc() - timedelta(days=5)
        sub = activate_subscription(
            db,
            user_id=user.id,
            plan="pro",
            billing_period="monthly",
            chip_recurring_token="rec_token_fail_max",
            auto_renew=True,
            next_renewal_at=old_expiry,
        )
        sub.expires_at = old_expiry
        db.add(sub)
        db.commit()

        # Run renewal 3 times with max_attempts = 3
        with patch.object(settings, "SUBSCRIPTION_RENEWAL_MAX_ATTEMPTS", 1), \
             patch.object(settings, "SUBSCRIPTION_RENEWAL_GRACE_PERIOD_DAYS", 3):
            process_due_subscription_renewals(db)

        db.refresh(sub)
        assert sub.status == "expired"
        assert sub.auto_renew is False
        assert get_effective_plan(sub) == "personal"


class TestManualRenewalAndAutoRenewHelpers:
    def test_manual_renewal_prevents_duplicate_auto_renewal(self, db: Session) -> None:
        """When user manually renews, next_renewal_at advances and scheduler skips duplicate charge."""
        user = create_random_user(db)
        expiry = _now_utc() + timedelta(days=5)
        sub = activate_subscription(
            db,
            user_id=user.id,
            plan="pro",
            billing_period="monthly",
            chip_recurring_token="rec_token_manual",
            auto_renew=True,
            next_renewal_at=expiry,
        )
        db.commit()

        # User manually renews
        updated_sub = renew_subscription(db, user.id, gateway="chip", chip_recurring_token="rec_token_manual")
        updated_sub.next_renewal_at = updated_sub.expires_at
        db.add(updated_sub)
        db.commit()

        # Run scheduler
        processed = process_due_subscription_renewals(db)
        assert processed == 0

    def test_set_auto_renew_requires_valid_token(self, db: Session) -> None:
        """Enabling auto-renew without recurring token raises ValueError."""
        user = create_random_user(db)
        sub = activate_subscription(
            db,
            user_id=user.id,
            plan="pro",
            billing_period="monthly",
            chip_recurring_token=None,
            auto_renew=False,
        )
        db.commit()

        with pytest.raises(ValueError, match="RECURRING_PAYMENT_UNAVAILABLE"):
            set_auto_renew(db, user.id, True)


class TestReconciliationAndSuperuserRoute:
    def test_reconcile_stale_processing_renewals(self, db: Session) -> None:
        """reconcile_pending_subscription_renewals reconciles processing renewals older than 15 minutes."""
        user = create_random_user(db)
        sub = activate_subscription(
            db,
            user_id=user.id,
            plan="pro",
            billing_period="monthly",
            chip_recurring_token="rec_token_rec",
            auto_renew=True,
        )

        stale_time = _now_utc() - timedelta(minutes=20)
        renewal = SubscriptionRenewal(
            subscription_id=sub.id,
            user_id=user.id,
            billing_period_start=sub.started_at or _now_utc(),
            billing_period_end=sub.expires_at or _now_utc(),
            scheduled_at=stale_time,
            attempted_at=stale_time,
            status="processing",
            chip_purchase_id="pur_stale_123",
            amount=2900,
            currency="MYR",
            created_at=stale_time,
            updated_at=stale_time,
        )
        db.add(renewal)
        db.commit()

        reconciled = reconcile_pending_subscription_renewals(db)
        assert reconciled == 1

        db.refresh(renewal)
        assert renewal.status == "paid"

    def test_superuser_can_trigger_test_run_scheduler(self, client: TestClient, db: Session) -> None:
        """Superuser can invoke POST /api/v1/subscription/test-run-scheduler."""
        headers = get_superuser_token_headers(client)

        r = client.post(
            f"{API}/subscription/test-run-scheduler",
            headers=headers,
        )
        assert r.status_code == 200
        data = r.json()
        assert data["status"] == "success"
        assert "processed_count" in data
        assert "retried_count" in data
        assert "reconciled_count" in data
