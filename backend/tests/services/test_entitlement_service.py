"""Unit tests for entitlement_service.py.

These tests are pure Python — no database required.
They use _make_user() and a mock subscription to exercise
check_entitlement() in isolation.

Covers:
- Company limits: Personal=2, Pro=10, Max=100
- Staff limits:   Personal=1, Pro=5,  Max=unlimited
- Product limits: Personal=50, Pro=500, Max=unlimited
- Customer limits: Personal=50, Pro=1000, Max=unlimited
- Boundary: usage < limit → allowed
- Boundary: usage >= limit → LimitReachedException
- None limit → unlimited → always allowed
- UPGRADE_PATH hierarchy
- get_company_count, get_staff_count, get_product_count, get_client_count helpers
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

import pytest

from app.models import User, UserSubscription
from app.services.entitlement_service import (
    PLAN_LIMITS,
    UPGRADE_PATH,
    EntitlementStatus,
    LimitReachedException,
    check_entitlement,
    get_client_count,
    get_company_count,
    get_entitlement_status,
    get_product_count,
    get_staff_count,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _now() -> datetime:
    return datetime.now(timezone.utc)


def _make_user(companies: list[str] | None = None) -> User:
    """Build an in-memory User with a given list of company ID strings."""
    companies_json = json.dumps(companies or [])
    return User(
        id=uuid.uuid4(),
        email=f"{uuid.uuid4()}@test.com",
        hashed_password="hashed",
        companies=companies_json,
        is_active=True,
        is_superuser=False,
    )


def _make_sub(plan: str) -> UserSubscription:
    """Build an in-memory UserSubscription for a given plan."""
    now = _now()
    return UserSubscription(
        id=uuid.uuid4(),
        user_id=uuid.uuid4(),
        plan=plan,
        billing_period=None if plan == "personal" else "monthly",
        status="active",
        started_at=None if plan == "personal" else now,
        expires_at=None if plan == "personal" else now + timedelta(days=30),
        created_at=now,
        updated_at=now,
    )


def _mock_session(plan: str):
    """Return a mock Session whose get_current_subscription returns the given plan."""
    return MagicMock()  # session itself isn't used directly; we patch the service function


# ---------------------------------------------------------------------------
# get_company_count
# ---------------------------------------------------------------------------

class TestGetCompanyCount:
    def test_empty_companies_returns_zero(self):
        user = _make_user([])
        assert get_company_count(user) == 0

    def test_counts_companies_correctly(self):
        ids = [str(uuid.uuid4()), str(uuid.uuid4()), str(uuid.uuid4())]
        user = _make_user(ids)
        assert get_company_count(user) == 3

    def test_null_companies_string_returns_zero(self):
        user = _make_user()
        user.companies = None  # type: ignore[assignment]
        assert get_company_count(user) == 0

    def test_corrupt_companies_json_returns_zero(self):
        user = _make_user()
        user.companies = "not-valid-json"
        assert get_company_count(user) == 0

    def test_non_list_json_returns_zero(self):
        user = _make_user()
        user.companies = '{"key": "value"}'
        assert get_company_count(user) == 0


# ---------------------------------------------------------------------------
# get_staff_count (via mocked session)
# ---------------------------------------------------------------------------

class TestGetStaffCount:
    def _make_session_with_users(self, company_id: uuid.UUID, owner_id: uuid.UUID, member_ids: list[uuid.UUID]) -> MagicMock:
        """Build a mock session that returns a company and users where owner + members are set up."""
        from app.models import Company

        company = Company(
            id=company_id,
            company_name="Test Co",
            currency="MYR",
            company_email="test@test.com",
            phone_number="+60123456789",
            user_id=owner_id,
        )

        company_id_str = str(company_id)
        users = []

        # Owner user
        owner = _make_user([company_id_str])
        owner.id = owner_id
        users.append(owner)

        # Member users
        for mid in member_ids:
            member = _make_user([company_id_str])
            member.id = mid
            users.append(member)

        session = MagicMock()
        session.get.return_value = company
        # session.exec(...) must return an object with .all() that returns `users`
        exec_result = MagicMock()
        exec_result.all.return_value = users
        session.exec.return_value = exec_result
        return session

    def test_owner_only_returns_one(self):
        company_id = uuid.uuid4()
        owner_id = uuid.uuid4()
        session = self._make_session_with_users(company_id, owner_id, [])
        assert get_staff_count(session, company_id) == 1

    def test_owner_plus_members(self):
        company_id = uuid.uuid4()
        owner_id = uuid.uuid4()
        members = [uuid.uuid4(), uuid.uuid4(), uuid.uuid4()]
        session = self._make_session_with_users(company_id, owner_id, members)
        assert get_staff_count(session, company_id) == 4  # 1 owner + 3 members

    def test_nonexistent_company_returns_zero(self):
        session = MagicMock()
        session.get.return_value = None
        assert get_staff_count(session, uuid.uuid4()) == 0


# ---------------------------------------------------------------------------
# get_product_count (via mocked session)
# ---------------------------------------------------------------------------

class TestGetProductCount:
    def test_returns_count_from_db(self):
        session = MagicMock()
        session.exec.return_value.one.return_value = 42
        company_id = uuid.uuid4()
        assert get_product_count(session, company_id) == 42

    def test_zero_products(self):
        session = MagicMock()
        session.exec.return_value.one.return_value = 0
        assert get_product_count(session, uuid.uuid4()) == 0


# ---------------------------------------------------------------------------
# get_client_count (via mocked session)
# ---------------------------------------------------------------------------

class TestGetClientCount:
    def test_returns_count_from_db(self):
        session = MagicMock()
        session.exec.return_value.one.return_value = 99
        assert get_client_count(session, uuid.uuid4()) == 99

    def test_zero_clients(self):
        session = MagicMock()
        session.exec.return_value.one.return_value = 0
        assert get_client_count(session, uuid.uuid4()) == 0


# ---------------------------------------------------------------------------
# PLAN_LIMITS configuration
# ---------------------------------------------------------------------------

class TestPlanLimitsConfig:
    def test_personal_company_limit_is_2(self):
        assert PLAN_LIMITS["personal"]["companies"] == 2

    def test_pro_company_limit_is_10(self):
        assert PLAN_LIMITS["pro"]["companies"] == 10

    def test_max_company_limit_is_100(self):
        assert PLAN_LIMITS["max"]["companies"] == 100

    def test_all_plans_have_companies_key(self):
        for plan in ("personal", "pro", "max"):
            assert "companies" in PLAN_LIMITS[plan]

    # Staff
    def test_personal_staff_limit_is_1(self):
        assert PLAN_LIMITS["personal"]["staff"] == 1

    def test_pro_staff_limit_is_5(self):
        assert PLAN_LIMITS["pro"]["staff"] == 5

    def test_max_staff_limit_is_unlimited(self):
        assert PLAN_LIMITS["max"]["staff"] is None

    # Products
    def test_personal_product_limit_is_50(self):
        assert PLAN_LIMITS["personal"]["products"] == 50

    def test_pro_product_limit_is_500(self):
        assert PLAN_LIMITS["pro"]["products"] == 500

    def test_max_product_limit_is_unlimited(self):
        assert PLAN_LIMITS["max"]["products"] is None

    # Customers
    def test_personal_customer_limit_is_50(self):
        assert PLAN_LIMITS["personal"]["customers"] == 50

    def test_pro_customer_limit_is_1000(self):
        assert PLAN_LIMITS["pro"]["customers"] == 1000

    def test_max_customer_limit_is_unlimited(self):
        assert PLAN_LIMITS["max"]["customers"] is None

    def test_all_plans_have_all_new_features(self):
        for plan in ("personal", "pro", "max"):
            for feature in ("staff", "products", "customers", "recurring_invoices"):
                assert feature in PLAN_LIMITS[plan], f"{plan} missing feature {feature!r}"

    def test_personal_recurring_invoices_are_unavailable(self):
        assert PLAN_LIMITS["personal"]["recurring_invoices"] == 0

    def test_pro_recurring_invoices_are_unlimited(self):
        assert PLAN_LIMITS["pro"]["recurring_invoices"] is None

    def test_max_recurring_invoices_are_unlimited(self):
        assert PLAN_LIMITS["max"]["recurring_invoices"] is None


# ---------------------------------------------------------------------------
# UPGRADE_PATH
# ---------------------------------------------------------------------------

class TestUpgradePath:
    def test_personal_upgrades_to_pro(self):
        assert UPGRADE_PATH["personal"] == "pro"

    def test_pro_upgrades_to_max(self):
        assert UPGRADE_PATH["pro"] == "max"

    def test_max_has_no_upgrade(self):
        assert UPGRADE_PATH["max"] is None


# ---------------------------------------------------------------------------
# check_entitlement — Companies — Personal (limit=2)
# ---------------------------------------------------------------------------

class TestCheckEntitlementPersonal:
    def _check(self, company_count: int) -> None:
        user = _make_user([str(uuid.uuid4()) for _ in range(company_count)])
        sub = _make_sub("personal")
        session = MagicMock()
        with patch(
            "app.services.entitlement_service.get_current_subscription",
            return_value=sub,
        ):
            check_entitlement(session, user, "companies")

    def test_zero_companies_allowed(self):
        self._check(0)  # should not raise

    def test_one_company_allowed(self):
        self._check(1)  # should not raise

    def test_two_companies_denied(self):
        with pytest.raises(LimitReachedException) as exc_info:
            self._check(2)
        e = exc_info.value
        assert e.feature == "companies"
        assert e.plan == "personal"
        assert e.limit == 2
        assert e.current_usage == 2
        assert e.next_plan == "pro"

    def test_three_companies_denied(self):
        with pytest.raises(LimitReachedException):
            self._check(3)


# ---------------------------------------------------------------------------
# check_entitlement — Companies — Pro (limit=10)
# ---------------------------------------------------------------------------

class TestCheckEntitlementPro:
    def _check(self, company_count: int) -> None:
        user = _make_user([str(uuid.uuid4()) for _ in range(company_count)])
        sub = _make_sub("pro")
        session = MagicMock()
        with patch(
            "app.services.entitlement_service.get_current_subscription",
            return_value=sub,
        ):
            check_entitlement(session, user, "companies")

    def test_nine_companies_allowed(self):
        self._check(9)  # should not raise

    def test_ten_companies_denied(self):
        with pytest.raises(LimitReachedException) as exc_info:
            self._check(10)
        e = exc_info.value
        assert e.feature == "companies"
        assert e.plan == "pro"
        assert e.limit == 10
        assert e.current_usage == 10
        assert e.next_plan == "max"

    def test_zero_companies_allowed(self):
        self._check(0)  # should not raise


# ---------------------------------------------------------------------------
# check_entitlement — Companies — Max (limit=100)
# ---------------------------------------------------------------------------

class TestCheckEntitlementMax:
    def _check(self, company_count: int) -> None:
        user = _make_user([str(uuid.uuid4()) for _ in range(company_count)])
        sub = _make_sub("max")
        session = MagicMock()
        with patch(
            "app.services.entitlement_service.get_current_subscription",
            return_value=sub,
        ):
            check_entitlement(session, user, "companies")

    def test_ninety_nine_companies_allowed(self):
        self._check(99)  # should not raise

    def test_one_hundred_companies_denied(self):
        with pytest.raises(LimitReachedException) as exc_info:
            self._check(100)
        e = exc_info.value
        assert e.feature == "companies"
        assert e.plan == "max"
        assert e.limit == 100
        assert e.current_usage == 100
        assert e.next_plan is None  # Max has no upgrade

    def test_zero_companies_allowed(self):
        self._check(0)  # should not raise


# ---------------------------------------------------------------------------
# check_entitlement — Staff
# ---------------------------------------------------------------------------

def _check_staff(session: MagicMock, plan: str, current_count: int, company_id: uuid.UUID) -> None:
    """Helper: patch subscription + staff count, then call check_entitlement for 'staff'."""
    sub = _make_sub(plan)
    user = _make_user()
    with patch("app.services.entitlement_service.get_current_subscription", return_value=sub), \
         patch("app.services.entitlement_service.get_staff_count", return_value=current_count):
        check_entitlement(session, user, "staff", company_id=company_id)


class TestCheckEntitlementStaff:
    def setup_method(self):
        self.session = MagicMock()
        self.company_id = uuid.uuid4()

    # Personal (limit=1)
    def test_personal_zero_staff_allowed(self):
        _check_staff(self.session, "personal", 0, self.company_id)  # should not raise

    def test_personal_one_staff_denied(self):
        with pytest.raises(LimitReachedException) as exc_info:
            _check_staff(self.session, "personal", 1, self.company_id)
        e = exc_info.value
        assert e.feature == "staff"
        assert e.plan == "personal"
        assert e.limit == 1
        assert e.current_usage == 1
        assert e.next_plan == "pro"

    # Pro (limit=5)
    def test_pro_four_staff_allowed(self):
        _check_staff(self.session, "pro", 4, self.company_id)  # should not raise

    def test_pro_five_staff_denied(self):
        with pytest.raises(LimitReachedException) as exc_info:
            _check_staff(self.session, "pro", 5, self.company_id)
        e = exc_info.value
        assert e.feature == "staff"
        assert e.plan == "pro"
        assert e.limit == 5
        assert e.current_usage == 5
        assert e.next_plan == "max"

    # Max (unlimited)
    def test_max_any_staff_allowed(self):
        _check_staff(self.session, "max", 1000, self.company_id)  # should not raise

    def test_max_zero_staff_allowed(self):
        _check_staff(self.session, "max", 0, self.company_id)  # should not raise


# ---------------------------------------------------------------------------
# check_entitlement — Products
# ---------------------------------------------------------------------------

def _check_products(session: MagicMock, plan: str, current_count: int) -> None:
    sub = _make_sub(plan)
    user = _make_user()
    user.company_id = uuid.uuid4()  # ensure dispatcher doesn't early-return 0
    with patch("app.services.entitlement_service.get_current_subscription", return_value=sub), \
         patch("app.services.entitlement_service.get_product_count", return_value=current_count):
        check_entitlement(session, user, "products")


class TestCheckEntitlementProducts:
    def setup_method(self):
        self.session = MagicMock()

    # Personal (limit=50)
    def test_personal_49_products_allowed(self):
        _check_products(self.session, "personal", 49)  # should not raise

    def test_personal_50_products_denied(self):
        with pytest.raises(LimitReachedException) as exc_info:
            _check_products(self.session, "personal", 50)
        e = exc_info.value
        assert e.feature == "products"
        assert e.plan == "personal"
        assert e.limit == 50
        assert e.current_usage == 50
        assert e.next_plan == "pro"

    # Pro (limit=500)
    def test_pro_499_products_allowed(self):
        _check_products(self.session, "pro", 499)  # should not raise

    def test_pro_500_products_denied(self):
        with pytest.raises(LimitReachedException) as exc_info:
            _check_products(self.session, "pro", 500)
        e = exc_info.value
        assert e.feature == "products"
        assert e.plan == "pro"
        assert e.limit == 500
        assert e.current_usage == 500
        assert e.next_plan == "max"

    # Max (unlimited)
    def test_max_any_products_allowed(self):
        _check_products(self.session, "max", 10_000)  # should not raise

    def test_max_zero_products_allowed(self):
        _check_products(self.session, "max", 0)  # should not raise


# ---------------------------------------------------------------------------
# check_entitlement — Customers
# ---------------------------------------------------------------------------

def _check_customers(session: MagicMock, plan: str, current_count: int) -> None:
    sub = _make_sub(plan)
    user = _make_user()
    user.company_id = uuid.uuid4()  # ensure dispatcher doesn't early-return 0
    with patch("app.services.entitlement_service.get_current_subscription", return_value=sub), \
         patch("app.services.entitlement_service.get_client_count", return_value=current_count):
        check_entitlement(session, user, "customers")


class TestCheckEntitlementCustomers:
    def setup_method(self):
        self.session = MagicMock()

    # Personal (limit=50)
    def test_personal_49_customers_allowed(self):
        _check_customers(self.session, "personal", 49)  # should not raise

    def test_personal_50_customers_denied(self):
        with pytest.raises(LimitReachedException) as exc_info:
            _check_customers(self.session, "personal", 50)
        e = exc_info.value
        assert e.feature == "customers"
        assert e.plan == "personal"
        assert e.limit == 50
        assert e.current_usage == 50
        assert e.next_plan == "pro"

    # Pro (limit=1000)
    def test_pro_999_customers_allowed(self):
        _check_customers(self.session, "pro", 999)  # should not raise

    def test_pro_1000_customers_denied(self):
        with pytest.raises(LimitReachedException) as exc_info:
            _check_customers(self.session, "pro", 1000)
        e = exc_info.value
        assert e.feature == "customers"
        assert e.plan == "pro"
        assert e.limit == 1000
        assert e.current_usage == 1000
        assert e.next_plan == "max"

    # Max (unlimited)
    def test_max_any_customers_allowed(self):
        _check_customers(self.session, "max", 50_000)  # should not raise

    def test_max_zero_customers_allowed(self):
        _check_customers(self.session, "max", 0)  # should not raise


# ---------------------------------------------------------------------------
# check_entitlement — None subscription (implicit Personal)
# ---------------------------------------------------------------------------

class TestCheckEntitlementNoSubscription:
    def test_no_subscription_treated_as_personal(self):
        """A user with no subscription row defaults to personal (limit=2)."""
        user = _make_user([str(uuid.uuid4()), str(uuid.uuid4())])  # 2 companies
        session = MagicMock()
        with patch(
            "app.services.entitlement_service.get_current_subscription",
            return_value=None,
        ):
            with pytest.raises(LimitReachedException) as exc_info:
                check_entitlement(session, user, "companies")
            assert exc_info.value.plan == "personal"
            assert exc_info.value.limit == 2


# ---------------------------------------------------------------------------
# check_entitlement — Unknown feature raises ValueError
# ---------------------------------------------------------------------------

class TestCheckEntitlementUnknownFeature:
    def test_unknown_usage_feature_raises_value_error(self):
        """If a feature has a non-None limit but no usage dispatcher, ValueError fires."""
        from unittest.mock import patch as _patch
        user = _make_user()
        sub = _make_sub("personal")
        session = MagicMock()
        # Patch PLAN_LIMITS so personal has a non-None limit for the unknown key
        patched_limits = {
            "personal": {"companies": 2, "ghost_feature": 5},
            "pro": {"companies": 10},
            "max": {"companies": 100},
        }
        with _patch("app.services.entitlement_service.get_current_subscription", return_value=sub):
            with _patch("app.services.entitlement_service.PLAN_LIMITS", patched_limits):
                with pytest.raises(ValueError, match="Unknown entitlement feature"):
                    check_entitlement(session, user, "ghost_feature")


# ---------------------------------------------------------------------------
# check_entitlement — staff requires company_id
# ---------------------------------------------------------------------------

class TestCheckEntitlementStaffRequiresCompanyId:
    def test_staff_without_company_id_raises_value_error(self):
        """Calling check_entitlement for 'staff' without company_id raises ValueError."""
        user = _make_user()
        sub = _make_sub("personal")
        session = MagicMock()
        with patch("app.services.entitlement_service.get_current_subscription", return_value=sub):
            with pytest.raises(ValueError, match="company_id is required"):
                check_entitlement(session, user, "staff")  # no company_id


# ---------------------------------------------------------------------------
# LimitReachedException fields
# ---------------------------------------------------------------------------

class TestLimitReachedException:
    def test_exception_carries_all_fields(self):
        exc = LimitReachedException(
            feature="companies",
            plan="personal",
            limit=2,
            current_usage=2,
            next_plan="pro",
        )
        assert exc.feature == "companies"
        assert exc.plan == "personal"
        assert exc.limit == 2
        assert exc.current_usage == 2
        assert exc.next_plan == "pro"

    def test_exception_is_subclass_of_exception(self):
        exc = LimitReachedException(
            feature="companies",
            plan="max",
            limit=100,
            current_usage=100,
            next_plan=None,
        )
        assert isinstance(exc, Exception)


# ---------------------------------------------------------------------------
# get_entitlement_status
# ---------------------------------------------------------------------------

class TestGetEntitlementStatus:
    def test_under_limit_returns_can_create_true_over_limit_false(self):
        user = _make_user([str(uuid.uuid4())])  # 1 company
        sub = _make_sub("personal")
        session = MagicMock()
        with patch("app.services.entitlement_service.get_current_subscription", return_value=sub):
            status = get_entitlement_status(session, user, "companies")
            assert status.feature == "companies"
            assert status.plan == "personal"
            assert status.limit == 2
            assert status.current_usage == 1
            assert status.over_limit is False
            assert status.can_create is True

    def test_at_limit_returns_can_create_false_over_limit_false(self):
        user = _make_user([str(uuid.uuid4()), str(uuid.uuid4())])  # 2 companies
        sub = _make_sub("personal")
        session = MagicMock()
        with patch("app.services.entitlement_service.get_current_subscription", return_value=sub):
            status = get_entitlement_status(session, user, "companies")
            assert status.limit == 2
            assert status.current_usage == 2
            assert status.over_limit is False
            assert status.can_create is False

    def test_over_limit_returns_can_create_false_over_limit_true(self):
        user = _make_user([str(uuid.uuid4()) for _ in range(10)])  # 10 companies, limit is 2
        sub = _make_sub("personal")
        session = MagicMock()
        with patch("app.services.entitlement_service.get_current_subscription", return_value=sub):
            status = get_entitlement_status(session, user, "companies")
            assert status.limit == 2
            assert status.current_usage == 10
            assert status.over_limit is True
            assert status.can_create is False

    def test_unlimited_returns_can_create_true_over_limit_false(self):
        user = _make_user()
        sub = _make_sub("max")
        session = MagicMock()
        with patch("app.services.entitlement_service.get_current_subscription", return_value=sub), \
             patch("app.services.entitlement_service.get_product_count", return_value=500):
            user.company_id = uuid.uuid4()
            status = get_entitlement_status(session, user, "products")
            assert status.limit is None
            assert status.current_usage == 500
            assert status.over_limit is False
            assert status.can_create is True
