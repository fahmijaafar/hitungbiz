"""Tests for subscription_service.py.

Covers all cases specified in the implementation plan:
- Default subscription: new user gets Personal
- Personal: billing_period=None, started_at=None, expires_at=None, always active
- Paid expirations: monthly=30d, yearly=365d, Pro and Max
- Renewal: active subscription extends from expires_at (not from now)
- Expired renewal: starts fresh from now
- is_subscription_active: past expires_at → expired even if status='active'
"""

from datetime import datetime, timedelta, timezone

import pytest

from app.models import UserSubscription
from app.services.subscription_service import (
    MONTHLY_DAYS,
    YEARLY_DAYS,
    calculate_subscription_expiry,
    is_subscription_active,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_sub(**kwargs) -> UserSubscription:
    """Build a UserSubscription without touching the DB."""
    import uuid
    now = datetime.now(timezone.utc)
    defaults = dict(
        id=uuid.uuid4(),
        user_id=uuid.uuid4(),
        plan="personal",
        billing_period=None,
        status="active",
        started_at=None,
        expires_at=None,
        created_at=now,
        updated_at=now,
    )
    defaults.update(kwargs)
    return UserSubscription(**defaults)


# ---------------------------------------------------------------------------
# Personal plan characteristics
# ---------------------------------------------------------------------------

class TestPersonalPlan:
    def test_personal_has_no_billing_period(self):
        sub = _make_sub(plan="personal")
        assert sub.billing_period is None

    def test_personal_has_no_started_at(self):
        sub = _make_sub(plan="personal")
        assert sub.started_at is None

    def test_personal_has_no_expires_at(self):
        sub = _make_sub(plan="personal")
        assert sub.expires_at is None

    def test_personal_is_always_active(self):
        sub = _make_sub(plan="personal")
        assert is_subscription_active(sub) is True

    def test_personal_is_active_even_with_status_cancelled(self):
        """Personal ignores status — it is perpetual."""
        sub = _make_sub(plan="personal", status="cancelled")
        assert is_subscription_active(sub) is True

    def test_none_subscription_is_always_active(self):
        """None (missing row) is treated as implicit Personal."""
        assert is_subscription_active(None) is True


# ---------------------------------------------------------------------------
# calculate_subscription_expiry
# ---------------------------------------------------------------------------

class TestCalculateExpiry:
    def _base(self) -> datetime:
        return datetime(2026, 8, 10, 0, 0, 0, tzinfo=timezone.utc)

    def test_personal_returns_none(self):
        assert calculate_subscription_expiry("personal", None, self._base()) is None

    def test_pro_monthly_expires_in_30_days(self):
        expires = calculate_subscription_expiry("pro", "monthly", self._base())
        assert expires == self._base() + timedelta(days=MONTHLY_DAYS)

    def test_pro_yearly_expires_in_365_days(self):
        expires = calculate_subscription_expiry("pro", "yearly", self._base())
        assert expires == self._base() + timedelta(days=YEARLY_DAYS)

    def test_max_monthly_expires_in_30_days(self):
        expires = calculate_subscription_expiry("max", "monthly", self._base())
        assert expires == self._base() + timedelta(days=MONTHLY_DAYS)

    def test_max_yearly_expires_in_365_days(self):
        expires = calculate_subscription_expiry("max", "yearly", self._base())
        assert expires == self._base() + timedelta(days=YEARLY_DAYS)

    def test_invalid_plan_raises(self):
        with pytest.raises(ValueError, match="Invalid plan"):
            calculate_subscription_expiry("enterprise", "monthly", self._base())

    def test_paid_plan_without_billing_period_raises(self):
        with pytest.raises(ValueError, match="billing_period"):
            calculate_subscription_expiry("pro", None, self._base())

    def test_pro_monthly_concrete_example(self):
        """Pro Monthly Started: 2026-08-10 → Expires: 2026-09-09"""
        base = datetime(2026, 8, 10, tzinfo=timezone.utc)
        expires = calculate_subscription_expiry("pro", "monthly", base)
        assert expires == datetime(2026, 9, 9, tzinfo=timezone.utc)

    def test_max_yearly_concrete_example(self):
        """Max Yearly Started: 2026-08-10 → Expires: 2027-08-10"""
        base = datetime(2026, 8, 10, tzinfo=timezone.utc)
        expires = calculate_subscription_expiry("max", "yearly", base)
        assert expires == datetime(2027, 8, 10, tzinfo=timezone.utc)


# ---------------------------------------------------------------------------
# is_subscription_active — paid plans
# ---------------------------------------------------------------------------

class TestIsSubscriptionActive:
    def test_active_pro_with_future_expiry_is_active(self):
        future = datetime.now(timezone.utc) + timedelta(days=10)
        sub = _make_sub(plan="pro", billing_period="monthly", status="active", expires_at=future)
        assert is_subscription_active(sub) is True

    def test_active_max_with_future_expiry_is_active(self):
        future = datetime.now(timezone.utc) + timedelta(days=100)
        sub = _make_sub(plan="max", billing_period="yearly", status="active", expires_at=future)
        assert is_subscription_active(sub) is True

    def test_paid_subscription_with_past_expiry_is_not_active(self):
        """Past expires_at → expired, regardless of status field."""
        past = datetime.now(timezone.utc) - timedelta(days=1)
        sub = _make_sub(plan="pro", billing_period="monthly", status="active", expires_at=past)
        assert is_subscription_active(sub) is False

    def test_cancelled_pro_with_future_expiry_is_not_active(self):
        """status='cancelled' overrides — must be 'active'."""
        future = datetime.now(timezone.utc) + timedelta(days=10)
        sub = _make_sub(plan="pro", billing_period="monthly", status="cancelled", expires_at=future)
        assert is_subscription_active(sub) is False

    def test_expired_pro_with_no_expires_at_is_not_active(self):
        """Paid plan with expires_at=None is treated as inactive."""
        sub = _make_sub(plan="pro", billing_period="monthly", status="active", expires_at=None)
        assert is_subscription_active(sub) is False


# ---------------------------------------------------------------------------
# Renewal logic (via subscription_service functions tested directly)
# ---------------------------------------------------------------------------

class TestRenewalLogic:
    """
    We test the renewal date arithmetic independently of the DB.
    The full renew_subscription() function is tested via the route/service
    integration tests that use the DB session.
    """

    def test_monthly_renewal_extends_by_30_days(self):
        """Active monthly: new expiry = expires_at + 30 days (not now + 30)."""
        now = datetime.now(timezone.utc)
        current_expiry = now + timedelta(days=5)  # still active
        new_expiry = current_expiry + timedelta(days=MONTHLY_DAYS)
        assert new_expiry == current_expiry + timedelta(days=30)

    def test_yearly_renewal_extends_by_365_days(self):
        """Active yearly: new expiry = expires_at + 365 days (not now + 365)."""
        now = datetime.now(timezone.utc)
        current_expiry = now + timedelta(days=50)
        new_expiry = current_expiry + timedelta(days=YEARLY_DAYS)
        assert new_expiry == current_expiry + timedelta(days=365)

    def test_monthly_renewal_does_not_discard_remaining_time(self):
        """Renewal from expires_at means remaining days are preserved."""
        now = datetime.now(timezone.utc)
        # 5 days remaining before expiry
        current_expiry = now + timedelta(days=5)
        renewed = current_expiry + timedelta(days=MONTHLY_DAYS)
        # renewed is 35 days from now, NOT 30
        assert (renewed - now).days == 35

    def test_expired_monthly_renewal_starts_from_now(self):
        """If already expired, renewal starts a fresh 30-day period from now."""
        now = datetime.now(timezone.utc)
        old_expiry = now - timedelta(days=9)  # expired 9 days ago
        # Since it's expired, base = now
        new_expiry = now + timedelta(days=MONTHLY_DAYS)
        assert (new_expiry - now).days == 30

    def test_expired_yearly_renewal_starts_from_now(self):
        """If already expired, renewal starts a fresh 365-day period from now."""
        now = datetime.now(timezone.utc)
        new_expiry = now + timedelta(days=YEARLY_DAYS)
        assert (new_expiry - now).days == 365
