"""Unit and integration tests for CHIP Collect payment gateway integration and subscription lifecycle."""

from datetime import datetime, timedelta, timezone
from unittest.mock import patch
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.core.config import settings
from app.models import SubscriptionPayment, User, UserSubscription
from app.services.chip_service import ChipService
from app.services.entitlement_service import check_entitlement, get_entitlement_status, LimitReachedException
from app.services.subscription_service import activate_subscription, get_effective_plan, renew_subscription


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


@pytest.fixture(autouse=True)
def mock_chip_create_purchase():
    def dummy_create_purchase(*args, **kwargs):
        reference = kwargs.get("reference") or f"SUB-{uuid.uuid4().hex[:12]}"
        return {
            "checkout_url": f"https://gate.chip-in.asia/p/{reference}/",
            "purchase_id": f"pur_{reference}",
            "client_id": f"cli_{uuid.uuid4().hex[:8]}",
            "reference": reference,
        }
    with patch.object(ChipService, "create_purchase", side_effect=dummy_create_purchase):
        yield


def test_checkout_validation(client: TestClient, normal_user_token_headers: dict[str, str]) -> None:
    """Verify server-side plan and interval validation on checkout."""
    # Personal cannot be purchased
    r_personal = client.post(
        f"{settings.API_V1_STR}/subscription/checkout",
        headers=normal_user_token_headers,
        json={"plan": "personal", "billing_interval": "monthly"},
    )
    assert r_personal.status_code == 400

    # Invalid interval rejected
    r_invalid_interval = client.post(
        f"{settings.API_V1_STR}/subscription/checkout",
        headers=normal_user_token_headers,
        json={"plan": "pro", "billing_interval": "weekly"},
    )
    assert r_invalid_interval.status_code == 400


def test_checkout_creates_pending_payment(
    client: TestClient,
    db: Session,
    normal_user_token_headers: dict[str, str],
) -> None:
    """Verify checkout creates pending SubscriptionPayment and returns valid checkout_url."""
    response = client.post(
        f"{settings.API_V1_STR}/subscription/checkout",
        headers=normal_user_token_headers,
        json={"plan": "pro", "billing_interval": "monthly"},
    )
    assert response.status_code == 200
    data = response.json()

    assert "checkout_url" in data
    assert "reference" in data
    assert data["reference"].startswith("SUB-")

    # Verify pending DB record
    payment = db.exec(
        select(SubscriptionPayment).where(SubscriptionPayment.reference == data["reference"])
    ).first()

    assert payment is not None
    assert payment.status == "pending"
    assert payment.plan == "pro"
    assert payment.billing_interval == "monthly"
    assert payment.amount == 2900
    assert payment.currency == "MYR"


def test_chip_callback_signature_verification_failure(client: TestClient) -> None:
    """Verify callback with invalid RSA signature is rejected with HTTP 401."""
    with patch.object(settings, "CHIP_WEBHOOK_PUBLIC_KEY", "mock_pem_key"):
        response = client.post(
            f"{settings.API_V1_STR}/payments/chip/callback",
            headers={"X-Signature": "invalid_base64_signature"},
            json={"id": "pur_123", "status": "paid"},
        )
        assert response.status_code == 401


def test_chip_callback_success_activates_subscription(
    client: TestClient,
    db: Session,
    normal_user_token_headers: dict[str, str],
) -> None:
    """Verify valid callback activates Pro subscription and grants entitlements."""
    # 1. Create checkout to get reference
    checkout_res = client.post(
        f"{settings.API_V1_STR}/subscription/checkout",
        headers=normal_user_token_headers,
        json={"plan": "pro", "billing_interval": "monthly"},
    )
    assert checkout_res.status_code == 200
    reference = checkout_res.json()["reference"]

    # 2. Simulate CHIP success callback
    callback_payload = {
        "id": f"pur_{reference}",
        "event_type": "purchase.paid",
        "reference": reference,
        "status": "paid",
        "price": 2900,
        "currency": "MYR",
    }

    with patch.object(settings, "CHIP_WEBHOOK_PUBLIC_KEY", ""):
        callback_res = client.post(
            f"{settings.API_V1_STR}/payments/chip/callback",
            json=callback_payload,
        )
    assert callback_res.status_code == 200
    assert callback_res.json()["status"] == "success"

    # 3. Check updated subscription status via GET /api/v1/subscription/
    sub_res = client.get(
        f"{settings.API_V1_STR}/subscription/",
        headers=normal_user_token_headers,
    )
    assert sub_res.status_code == 200
    sub_data = sub_res.json()

    assert sub_data["plan"] == "pro"
    assert sub_data["effective_plan"] == "pro"
    assert sub_data["status"] == "active"
    assert sub_data["billing_period"] == "monthly"


def test_duplicate_webhook_is_idempotent(
    client: TestClient,
    db: Session,
    normal_user_token_headers: dict[str, str],
) -> None:
    """Verify sending duplicate successful webhooks does not extend period twice."""
    checkout_res = client.post(
        f"{settings.API_V1_STR}/subscription/checkout",
        headers=normal_user_token_headers,
        json={"plan": "max", "billing_interval": "yearly"},
    )
    reference = checkout_res.json()["reference"]

    callback_payload = {
        "id": f"pur_{reference}",
        "event_type": "purchase.paid",
        "reference": reference,
        "status": "paid",
        "price": 67260,
        "currency": "MYR",
    }

    with patch.object(settings, "CHIP_WEBHOOK_PUBLIC_KEY", ""):
        # First callback
        res1 = client.post(f"{settings.API_V1_STR}/payments/chip/callback", json=callback_payload)
        assert res1.status_code == 200
        assert res1.json()["status"] == "success"

        # Fetch initial expires_at
        sub1 = client.get(f"{settings.API_V1_STR}/subscription/", headers=normal_user_token_headers).json()
        expires_first = sub1["expires_at"]

        # Second identical callback
        res2 = client.post(f"{settings.API_V1_STR}/payments/chip/callback", json=callback_payload)
        assert res2.status_code == 200
        assert res2.json()["status"] in ("already_processed", "already_paid")

        # Expiry must remain identical
        sub2 = client.get(f"{settings.API_V1_STR}/subscription/", headers=normal_user_token_headers).json()
        assert sub2["expires_at"] == expires_first


def test_subscription_expiry_falls_back_to_personal_without_scheduler(db: Session) -> None:
    """Verify effective plan automatically reverts to Personal upon expiry without running a cron job."""
    user = User(
        email=f"test_expiry_{uuid.uuid4().hex[:6]}@example.com",
        hashed_password="fake",
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # Set subscription that expired yesterday
    sub = UserSubscription(
        user_id=user.id,
        plan="pro",
        billing_period="monthly",
        status="active",
        started_at=_now_utc() - timedelta(days=31),
        expires_at=_now_utc() - timedelta(days=1),
        created_at=_now_utc() - timedelta(days=31),
        updated_at=_now_utc() - timedelta(days=1),
    )
    db.add(sub)
    db.commit()

    # Evaluates effective plan purely based on current time
    effective = get_effective_plan(session=db, user_id=user.id)
    assert effective == "personal"


def test_renewal_preserves_remaining_time(db: Session) -> None:
    """Verify renewing an active subscription extends from existing expires_at (no lost days)."""
    user = User(
        email=f"test_renew_{uuid.uuid4().hex[:6]}@example.com",
        hashed_password="fake",
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # Currently active subscription expiring in 10 days
    current_expiry = _now_utc() + timedelta(days=10)
    sub = UserSubscription(
        user_id=user.id,
        plan="pro",
        billing_period="monthly",
        status="active",
        started_at=_now_utc() - timedelta(days=20),
        expires_at=current_expiry,
        created_at=_now_utc() - timedelta(days=20),
        updated_at=_now_utc() - timedelta(days=20),
    )
    db.add(sub)
    db.commit()

    # Renew subscription
    renewed = renew_subscription(db, user_id=user.id)
    db.commit()

    # New expiry should be current_expiry + 30 days (~40 days from now)
    expected_expiry = current_expiry + timedelta(days=30)
    assert abs((renewed.expires_at - expected_expiry).total_seconds()) < 5


def test_payment_history_endpoint(
    client: TestClient,
    normal_user_token_headers: dict[str, str],
) -> None:
    """Verify GET /api/v1/subscription/payments returns user's billing history."""
    # Create checkout
    client.post(
        f"{settings.API_V1_STR}/subscription/checkout",
        headers=normal_user_token_headers,
        json={"plan": "pro", "billing_interval": "monthly"},
    )

    response = client.get(
        f"{settings.API_V1_STR}/subscription/payments",
        headers=normal_user_token_headers,
    )
    assert response.status_code == 200
    history = response.json()
    assert isinstance(history, list)
    assert len(history) >= 1
    assert history[0]["plan"] == "pro"
    assert history[0]["billing_interval"] == "monthly"


def test_get_subscription_details_personal(
    client: TestClient,
    db: Session,
    normal_user_token_headers: dict[str, str],
) -> None:
    """Verify GET /api/v1/subscription/details returns structured Personal plan overview."""
    user = db.exec(select(User).where(User.email == settings.EMAIL_TEST_USER)).first()
    assert user is not None
    # Reset user to Personal plan for this test
    sub = db.exec(select(UserSubscription).where(UserSubscription.user_id == user.id)).first()
    if sub:
        sub.plan = "personal"
        sub.billing_period = None
        sub.status = "active"
        sub.started_at = None
        sub.expires_at = None
        db.add(sub)
    # Remove existing payment records for clean personal test assertion
    payments = db.exec(select(SubscriptionPayment).where(SubscriptionPayment.user_id == user.id)).all()
    for p in payments:
        db.delete(p)
    db.commit()

    response = client.get(
        f"{settings.API_V1_STR}/subscription/details",
        headers=normal_user_token_headers,
    )
    assert response.status_code == 200
    data = response.json()

    assert data["plan"] == "personal"
    assert data["effective_plan"] == "personal"
    assert data["status"] == "active"
    assert data["is_expired"] is False
    assert data["over_limit_warnings"] == []
    assert data["limits"]["companies"] == 2
    assert "usage" in data
    assert "subscription_history" in data
    assert "payment_history" in data


def test_subscription_details_counts_onboarding_company(
    client: TestClient,
    db: Session,
) -> None:
    """Verify that a company created during onboarding is counted in subscription details usage."""
    from tests.utils.user import create_random_user, user_authentication_headers
    from tests.utils.utils import random_email, random_lower_string
    from app import crud
    from app.models import Company, UserCreate

    email = random_email()
    password = random_lower_string()
    user = crud.create_user(session=db, user_create=UserCreate(email=email, password=password, email_verified=True))
    headers = user_authentication_headers(client=client, email=email, password=password)

    # 1. Initially usage should be 0 companies
    res = client.get(f"{settings.API_V1_STR}/subscription/details", headers=headers)
    assert res.status_code == 200
    assert res.json()["usage"]["companies"] == 0

    # 2. Company created during onboarding (POST /companies/)
    co_payload = {
        "company_name": "Onboarded Startup Inc",
        "currency": "RM",
        "company_email": "hello@onboarded.com",
        "phone_number": "+60123456789",
    }
    co_res = client.post(f"{settings.API_V1_STR}/companies/", headers=headers, json=co_payload)
    assert co_res.status_code == 200
    co_id = co_res.json()["id"]

    # In onboarding onSuccess, frontend also updates user me with company_id
    client.patch(f"{settings.API_V1_STR}/users/me", headers=headers, json={"company_id": co_id})

    # 3. Check subscription details: companies must be 1 / 2, not 0 / 2
    res_after = client.get(f"{settings.API_V1_STR}/subscription/details", headers=headers)
    assert res_after.status_code == 200
    usage = res_after.json()["usage"]
    assert usage["companies"] == 1
    assert usage["staff"] == 1

    # 4. Even if user.companies in DB was empty string '[]', company_id / ownership still counts
    db.refresh(user)
    user.companies = "[]"
    db.add(user)
    db.commit()

    res_fallback = client.get(f"{settings.API_V1_STR}/subscription/details", headers=headers)
    assert res_fallback.status_code == 200
    assert res_fallback.json()["usage"]["companies"] == 1


def test_get_subscription_details_active_pro(
    client: TestClient,
    db: Session,
    normal_user_token_headers: dict[str, str],
) -> None:
    """Verify GET /api/v1/subscription/details returns Active Pro subscription metadata."""
    # First checkout and pay for Pro
    res_checkout = client.post(
        f"{settings.API_V1_STR}/subscription/checkout",
        headers=normal_user_token_headers,
        json={"plan": "pro", "billing_interval": "monthly"},
    )
    ref = res_checkout.json()["reference"]

    # Callback payment
    with patch.object(settings, "CHIP_WEBHOOK_PUBLIC_KEY", ""):
        client.post(
            f"{settings.API_V1_STR}/payments/chip/callback",
            json={
                "id": f"pur_{ref}",
                "event_type": "purchase.paid",
                "reference": ref,
                "status": "paid",
                "price": 2900,
                "currency": "MYR",
            },
        )

    # Details check
    res_details = client.get(
        f"{settings.API_V1_STR}/subscription/details",
        headers=normal_user_token_headers,
    )
    assert res_details.status_code == 200
    data = res_details.json()

    assert data["plan"] == "pro"
    assert data["effective_plan"] == "pro"
    assert data["status"] == "active"
    assert data["billing_interval"] == "monthly"
    assert data["limits"]["companies"] == 10
    assert data["is_expired"] is False


def test_get_subscription_details_expired_pro(
    client: TestClient,
    db: Session,
    normal_user_token_headers: dict[str, str],
) -> None:
    """Verify expired Pro subscription returns stored plan pro, effective plan personal, and status expired."""
    user = db.exec(select(User).where(User.email == settings.EMAIL_TEST_USER)).first()
    assert user is not None

    sub = db.exec(select(UserSubscription).where(UserSubscription.user_id == user.id)).first()
    if sub:
        sub.plan = "pro"
        sub.billing_period = "monthly"
        sub.status = "active"
        sub.started_at = _now_utc() - timedelta(days=35)
        sub.expires_at = _now_utc() - timedelta(days=5)
        db.add(sub)
    else:
        sub = UserSubscription(
            user_id=user.id,
            plan="pro",
            billing_period="monthly",
            status="active",
            started_at=_now_utc() - timedelta(days=35),
            expires_at=_now_utc() - timedelta(days=5),
        )
        db.add(sub)
    db.commit()

    res_details = client.get(
        f"{settings.API_V1_STR}/subscription/details",
        headers=normal_user_token_headers,
    )
    assert res_details.status_code == 200
    data = res_details.json()

    assert data["plan"] == "pro"
    assert data["effective_plan"] == "personal"
    assert data["status"] == "expired"
    assert data["is_expired"] is True


def test_renew_personal_user_rejected(
    client: TestClient,
    db: Session,
    normal_user_token_headers: dict[str, str],
) -> None:
    """Verify Personal user calling renewal endpoint is rejected with HTTP 400."""
    user = db.exec(select(User).where(User.email == settings.EMAIL_TEST_USER)).first()
    assert user is not None

    # Reset user to Personal plan with no paid payment history
    sub = db.exec(select(UserSubscription).where(UserSubscription.user_id == user.id)).first()
    if sub:
        sub.plan = "personal"
        sub.billing_period = None
        sub.status = "active"
        sub.started_at = None
        sub.expires_at = None
        db.add(sub)
    payments = db.exec(select(SubscriptionPayment).where(SubscriptionPayment.user_id == user.id)).all()
    for p in payments:
        db.delete(p)
    db.commit()

    res = client.post(
        f"{settings.API_V1_STR}/subscription/renew",
        headers=normal_user_token_headers,
        json={"billing_interval": "monthly"},
    )
    assert res.status_code == 400
    assert "Personal plan does not require renewal" in res.json()["detail"]


def test_renewal_callback_extends_active_subscription(
    client: TestClient,
    db: Session,
    normal_user_token_headers: dict[str, str],
) -> None:
    """Verify active subscription renewal extends expires_at from existing expiry date."""
    user = db.exec(select(User).where(User.email == settings.EMAIL_TEST_USER)).first()
    assert user is not None

    initial_expiry = _now_utc() + timedelta(days=12)
    sub = db.exec(select(UserSubscription).where(UserSubscription.user_id == user.id)).first()
    if sub:
        sub.plan = "pro"
        sub.billing_period = "monthly"
        sub.status = "active"
        sub.started_at = _now_utc() - timedelta(days=18)
        sub.expires_at = initial_expiry
        db.add(sub)
    else:
        sub = UserSubscription(
            user_id=user.id,
            plan="pro",
            billing_period="monthly",
            status="active",
            started_at=_now_utc() - timedelta(days=18),
            expires_at=initial_expiry,
        )
        db.add(sub)
    db.commit()

    # Initiate renewal
    renew_res = client.post(
        f"{settings.API_V1_STR}/subscription/renew",
        headers=normal_user_token_headers,
        json={"billing_interval": "monthly"},
    )
    assert renew_res.status_code == 200
    ref = renew_res.json()["reference"]

    # Process successful payment callback
    with patch.object(settings, "CHIP_WEBHOOK_PUBLIC_KEY", ""):
        cb_res = client.post(
            f"{settings.API_V1_STR}/payments/chip/callback",
            json={
                "id": f"pur_{ref}",
                "event_type": "purchase.paid",
                "reference": ref,
                "status": "paid",
                "price": 2900,
                "currency": "MYR",
            },
        )
    assert cb_res.status_code == 200

    # Verify extended expiry
    db.refresh(sub)
    expected_new_expiry = initial_expiry + timedelta(days=30)
    assert abs((sub.expires_at - expected_new_expiry).total_seconds()) < 5


def test_renewal_callback_starts_fresh_period_for_expired_subscription(
    client: TestClient,
    db: Session,
    normal_user_token_headers: dict[str, str],
) -> None:
    """Verify expired subscription renewal starts fresh from current payment date."""
    user = db.exec(select(User).where(User.email == settings.EMAIL_TEST_USER)).first()
    assert user is not None

    sub = db.exec(select(UserSubscription).where(UserSubscription.user_id == user.id)).first()
    if sub:
        sub.plan = "pro"
        sub.billing_period = "monthly"
        sub.status = "active"
        sub.started_at = _now_utc() - timedelta(days=40)
        sub.expires_at = _now_utc() - timedelta(days=10)
        db.add(sub)
    else:
        sub = UserSubscription(
            user_id=user.id,
            plan="pro",
            billing_period="monthly",
            status="active",
            started_at=_now_utc() - timedelta(days=40),
            expires_at=_now_utc() - timedelta(days=10),
        )
        db.add(sub)
    db.commit()

    # Renew expired sub
    renew_res = client.post(
        f"{settings.API_V1_STR}/subscription/renew",
        headers=normal_user_token_headers,
        json={"billing_interval": "monthly"},
    )
    assert renew_res.status_code == 200
    ref = renew_res.json()["reference"]

    # Callback payment
    with patch.object(settings, "CHIP_WEBHOOK_PUBLIC_KEY", ""):
        cb_res = client.post(
            f"{settings.API_V1_STR}/payments/chip/callback",
            json={
                "id": f"pur_{ref}",
                "event_type": "purchase.paid",
                "reference": ref,
                "status": "paid",
                "price": 2900,
                "currency": "MYR",
            },
        )
    assert cb_res.status_code == 200

    db.refresh(sub)
    assert sub.status == "active"
    expected_new_expiry = _now_utc() + timedelta(days=30)
    assert abs((sub.expires_at - expected_new_expiry).total_seconds()) < 5


def test_failed_renewal_does_not_extend_subscription(
    client: TestClient,
    db: Session,
    normal_user_token_headers: dict[str, str],
) -> None:
    """Verify failed renewal callback does not extend subscription expiry date."""
    user = db.exec(select(User).where(User.email == settings.EMAIL_TEST_USER)).first()
    assert user is not None

    initial_expiry = _now_utc() + timedelta(days=8)
    sub = db.exec(select(UserSubscription).where(UserSubscription.user_id == user.id)).first()
    if sub:
        sub.plan = "pro"
        sub.billing_period = "monthly"
        sub.status = "active"
        sub.expires_at = initial_expiry
        db.add(sub)
    db.commit()

    # Initiate renewal
    renew_res = client.post(
        f"{settings.API_V1_STR}/subscription/renew",
        headers=normal_user_token_headers,
        json={"billing_interval": "monthly"},
    )
    ref = renew_res.json()["reference"]

    # Payment failed callback
    with patch.object(settings, "CHIP_WEBHOOK_PUBLIC_KEY", ""):
        cb_res = client.post(
            f"{settings.API_V1_STR}/payments/chip/callback",
            json={
                "id": f"pur_{ref}",
                "event_type": "purchase.failed",
                "reference": ref,
                "status": "failed",
                "price": 2900,
                "currency": "MYR",
            },
        )
    assert cb_res.status_code == 200
    assert cb_res.json()["status"] == "payment_failed"

    assert sub is not None
    # Expiry remains unchanged
    assert abs((sub.expires_at - initial_expiry).total_seconds()) < 2

