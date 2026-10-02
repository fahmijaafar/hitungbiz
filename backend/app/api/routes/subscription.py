"""Subscription API route.

GET /api/v1/subscription
    Returns the authenticated user's current subscription.
    The user can only ever see their own subscription through this endpoint.

POST /api/v1/subscription/checkout
    Initiates subscription checkout via CHIP Collect payment gateway.

GET /api/v1/subscription/payments
    Returns the authenticated user's billing/payment history.
"""

import uuid
from typing import Any, List

from fastapi import APIRouter, HTTPException
from sqlmodel import SQLModel, col, select

from app.api.deps import CurrentSuperUser, CurrentUser, SessionDep
from app.core.config import settings
from app.models import (
    EntitlementStatusPublic,
    SubscriptionDetailsPublic,
    SubscriptionPayment,
    SubscriptionRenewRequest,
    SubscriptionRenewResponse,
    UserPaymentPublic,
    UserSubscriptionPublic,
)
from app.services.chip_service import ChipService, ChipServiceError
from app.services.entitlement_service import get_entitlement_status
from app.services.recurring_renewal_service import process_subscription_renewal
from app.services.subscription_service import (
    _now_utc,
    get_current_subscription,
    get_effective_plan,
    get_subscription_details,
    subscription_to_public,
)

router = APIRouter(prefix="/subscription", tags=["subscription"])


class CheckoutRequest(SQLModel):
    """Payload to initiate a subscription purchase checkout."""

    plan: str
    billing_interval: str


class CheckoutResponse(SQLModel):
    """Response containing CHIP Collect checkout URL and reference."""

    checkout_url: str
    reference: str


@router.get("/", response_model=UserSubscriptionPublic)
def read_subscription(session: SessionDep, current_user: CurrentUser) -> Any:
    """
    Get the current authenticated user's subscription.

    Returns:
    - Personal subscription if the user is on the free plan.
    - Pro/Max subscription with billing details if on a paid plan.

    A user can only retrieve their own subscription through this endpoint.
    """
    subscription = get_current_subscription(session, current_user.id)
    return subscription_to_public(subscription)


@router.get("/details", response_model=SubscriptionDetailsPublic)
def read_subscription_details(
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    """
    Get consolidated subscription management details including effective plan,
    status, renewal dates, feature limits, current usage, over-limit warnings,
    subscription history, and payment history.
    """
    return get_subscription_details(session, current_user)


@router.post("/renew", response_model=SubscriptionRenewResponse)
def renew_subscription_checkout(
    session: SessionDep,
    current_user: CurrentUser,
    request: SubscriptionRenewRequest | None = None,
) -> Any:
    """
    Initiate renewal checkout for an existing active or expired paid subscription (Pro or Max).

    Returns a CHIP Collect checkout URL to complete payment and extend the subscription period.
    """
    sub = get_current_subscription(session, current_user.id)
    renew_plan: str | None = None

    if sub and sub.plan in ("pro", "max"):
        renew_plan = sub.plan
    else:
        # Check last successful payment plan
        last_payment_stmt = (
            select(SubscriptionPayment)
            .where(
                col(SubscriptionPayment.user_id) == current_user.id,
                col(SubscriptionPayment.status) == "paid",
            )
            .order_by(col(SubscriptionPayment.created_at).desc())
        )
        last_payment = session.exec(last_payment_stmt).first()
        if last_payment and last_payment.plan in ("pro", "max"):
            renew_plan = last_payment.plan

    if not renew_plan or renew_plan == "personal":
        raise HTTPException(
            status_code=400,
            detail="Personal plan does not require renewal. Please upgrade instead.",
        )

    billing_interval = "monthly"
    if request and request.billing_interval:
        if request.billing_interval not in ("monthly", "yearly"):
            raise HTTPException(
                status_code=400,
                detail=f"Invalid billing interval: '{request.billing_interval}'. Allowed: 'monthly', 'yearly'.",
            )
        billing_interval = request.billing_interval
    elif sub and sub.billing_period in ("monthly", "yearly"):
        billing_interval = sub.billing_period

    # Server-side price lookup
    try:
        amount, currency = ChipService.get_price(renew_plan, billing_interval)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    # Prevent duplicate pending payment created in rapid succession (within 30 seconds)
    from datetime import timedelta
    recent_cutoff = _now_utc() - timedelta(seconds=30)
    existing_pending_stmt = (
        select(SubscriptionPayment)
        .where(
            col(SubscriptionPayment.user_id) == current_user.id,
            col(SubscriptionPayment.plan) == renew_plan,
            col(SubscriptionPayment.status) == "pending",
            col(SubscriptionPayment.created_at) >= recent_cutoff,
        )
        .order_by(col(SubscriptionPayment.created_at).desc())
    )
    existing_pending = session.exec(existing_pending_stmt).first()
    if existing_pending and existing_pending.provider_purchase_id:
        mock_checkout = f"{settings.APP_PUBLIC_URL.rstrip('/')}/payment/success?ref={existing_pending.reference}&mock=true"
        return SubscriptionRenewResponse(
            checkout_url=mock_checkout,
            reference=existing_pending.reference,
        )

    # Generate unique internal payment reference
    ref_unique = uuid.uuid4().hex[:8]
    user_short = str(current_user.id)[:8]
    reference = f"REN-{user_short}-{ref_unique}"

    payment = SubscriptionPayment(
        user_id=current_user.id,
        subscription_id=sub.id if sub else None,
        provider="chip",
        plan=renew_plan,
        billing_interval=billing_interval,
        payment_type="manual_renewal",
        amount=amount,
        currency=currency,
        status="pending",
        reference=reference,
        created_at=_now_utc(),
        updated_at=_now_utc(),
    )
    session.add(payment)
    session.flush()

    try:
        purchase_data = ChipService.create_purchase(
            user=current_user,
            plan=renew_plan,
            billing_interval=billing_interval,
            reference=reference,
        )
    except ChipServiceError as exc:
        session.rollback()
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    payment.provider_purchase_id = purchase_data["purchase_id"]
    session.add(payment)
    session.commit()

    return SubscriptionRenewResponse(
        checkout_url=purchase_data["checkout_url"],
        reference=reference,
    )



@router.post("/checkout", response_model=CheckoutResponse)
def create_subscription_checkout(
    request: CheckoutRequest,
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    """
    Initiate checkout for a paid subscription plan (Pro or Max).

    Creates a pending payment record and retrieves a CHIP Collect checkout URL.
    """
    if request.plan not in ("pro", "max"):
        raise HTTPException(
            status_code=400,
            detail=f"Plan '{request.plan}' cannot be purchased. Allowed plans: 'pro', 'max'.",
        )

    if request.billing_interval not in ("monthly", "yearly"):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid billing interval: '{request.billing_interval}'. Allowed: 'monthly', 'yearly'.",
        )

    # Server-side price lookup
    try:
        amount, currency = ChipService.get_price(request.plan, request.billing_interval)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    # Generate unique internal payment reference
    ref_unique = uuid.uuid4().hex[:8]
    user_short = str(current_user.id)[:8]
    reference = f"SUB-{user_short}-{ref_unique}"

    # Get current user subscription if any
    current_sub = get_current_subscription(session, current_user.id)

    # Create pending SubscriptionPayment record
    payment = SubscriptionPayment(
        user_id=current_user.id,
        subscription_id=current_sub.id if current_sub else None,
        provider="chip",
        plan=request.plan,
        billing_interval=request.billing_interval,
        payment_type="initial",
        amount=amount,
        currency=currency,
        status="pending",
        reference=reference,
        created_at=_now_utc(),
        updated_at=_now_utc(),
    )
    session.add(payment)
    session.flush()

    try:
        purchase_data = ChipService.create_purchase(
            user=current_user,
            plan=request.plan,
            billing_interval=request.billing_interval,
            reference=reference,
        )
    except ChipServiceError as exc:
        session.rollback()
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    # Update payment with provider purchase ID
    payment.provider_purchase_id = purchase_data["purchase_id"]
    session.add(payment)
    session.commit()

    return CheckoutResponse(
        checkout_url=purchase_data["checkout_url"],
        reference=reference,
    )


@router.get("/payments", response_model=List[UserPaymentPublic])
def read_subscription_payments(
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    """Get billing and payment history for the authenticated user."""
    statement = (
        select(SubscriptionPayment)
        .where(col(SubscriptionPayment.user_id) == current_user.id)
        .order_by(col(SubscriptionPayment.created_at).desc())
    )
    payments = session.exec(statement).all()

    return [
        UserPaymentPublic(
            id=p.id,
            provider=p.provider,
            plan=p.plan,
            billing_interval=p.billing_interval,
            amount=p.amount,
            currency=p.currency,
            status=p.status,
            reference=p.reference,
            paid_at=p.paid_at,
            created_at=p.created_at,
        )
        for p in payments
    ]


@router.get("/entitlement/{feature}", response_model=EntitlementStatusPublic)
def read_entitlement_status(
    feature: str,
    session: SessionDep,
    current_user: CurrentUser,
    company_id: uuid.UUID | None = None,
) -> Any:
    """
    Get entitlement status for a feature.

    Returns structured status indicating limit, current_usage, over_limit, and can_create.
    """
    try:
        status = get_entitlement_status(
            session, current_user, feature, company_id=company_id
        )
        return EntitlementStatusPublic(
            feature=status.feature,
            plan=status.plan,
            limit=status.limit,
            current_usage=status.current_usage,
            over_limit=status.over_limit,
            can_create=status.can_create,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/{subscription_id}/test-auto-renew")
def trigger_test_subscription_renewal(
    subscription_id: uuid.UUID,
    session: SessionDep,
    current_user: CurrentSuperUser,
) -> Any:
    """
    Superuser-only test route to manually trigger a single subscription auto-renewal.

    Executes process_subscription_renewal without a background scheduler.
    """
    result = process_subscription_renewal(session, subscription_id)
    if result.get("status") == "error":
        raise HTTPException(
            status_code=400,
            detail=result.get("detail", "Renewal processing failed"),
        )
    return result


@router.post("/test-run-scheduler")
def trigger_test_run_scheduler(
    session: SessionDep,
    current_user: CurrentSuperUser,
) -> Any:
    """
    Superuser-only test route to manually run a full subscription renewal scheduler pass.

    Executes process_due_subscription_renewals, retry_failed_subscription_renewals,
    and reconcile_pending_subscription_renewals synchronously.
    """
    from app.services.recurring_renewal_service import (
        process_due_subscription_renewals,
        reconcile_pending_subscription_renewals,
        retry_failed_subscription_renewals,
    )
    processed = process_due_subscription_renewals(session)
    retried = retry_failed_subscription_renewals(session)
    reconciled = reconcile_pending_subscription_renewals(session)
    return {
        "status": "success",
        "processed_count": processed,
        "retried_count": retried,
        "reconciled_count": reconciled,
    }
