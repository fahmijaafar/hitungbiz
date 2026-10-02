"""Subscription service.

Provides all subscription business logic as reusable, stateless functions.
No business logic lives in API routes — routes delegate here.

Expiry rules:
  - Personal: perpetual — billing_period=None, started_at=None, expires_at=None
  - Monthly paid: expires_at = started_at + 30 days
  - Yearly paid:  expires_at = started_at + 365 days

Renewal rules (extend from current expiry, not from today, to preserve remaining time):
  - Active monthly: new_expiry = expires_at + 30 days
  - Active yearly:  new_expiry = expires_at + 365 days
  - Expired:        new_expiry = now() + 30/365 days (fresh start)

is_subscription_active:
  - Personal: always True
  - Paid:     status == "active" AND expires_at > now()
              (authoritative — do NOT rely on status alone)
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlmodel import Session, select

from app.core.config import settings
from app.models import (
    BILLING_PERIOD_VALUES,
    SUBSCRIPTION_PLAN_VALUES,
    SUBSCRIPTION_STATUS_VALUES,
    UserSubscription,
    UserSubscriptionPublic,
)


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

MONTHLY_DAYS = 30
YEARLY_DAYS = 365


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _ensure_aware(dt: datetime) -> datetime:
    """Ensure a datetime is timezone-aware (UTC)."""
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


# ---------------------------------------------------------------------------
# Core query
# ---------------------------------------------------------------------------

def get_current_subscription(session: Session, user_id: uuid.UUID) -> UserSubscription | None:
    """Return the current UserSubscription row for the given user, or None."""
    statement = select(UserSubscription).where(UserSubscription.user_id == user_id)
    return session.exec(statement).first()


# ---------------------------------------------------------------------------
# Active status determination (never stale — based on expires_at, not only status)
# ---------------------------------------------------------------------------

def is_subscription_active(subscription: UserSubscription | None) -> bool:
    """
    Check if a subscription grants active paid access.

    - Personal (plan='personal'): always active.
    - Paid: status must be 'active' or 'past_due' (within grace period).
    """
    if subscription is None or subscription.plan == "personal":
        return True
    if subscription.status not in ("active", "past_due"):
        return False
    if subscription.expires_at is None:
        return False
    expires = _ensure_aware(subscription.expires_at)
    if subscription.status == "past_due":
        grace_days = getattr(settings, "SUBSCRIPTION_RENEWAL_GRACE_PERIOD_DAYS", 3)
        return (expires + timedelta(days=grace_days)) > _now_utc()
    return expires > _now_utc()


def get_effective_plan(
    subscription: UserSubscription | None = None,
    session: Session | None = None,
    user_id: uuid.UUID | None = None,
) -> str:
    """
    Determine the authoritative effective plan for a user.

    Returns 'personal', 'pro', or 'max'.
    The effective plan falls back to 'personal' as soon as expires_at + grace_period passes
    or if status is 'expired' or 'cancelled'.
    """
    if subscription is None:
        if session is not None and user_id is not None:
            subscription = get_current_subscription(session, user_id)

    if subscription is None or subscription.plan == "personal":
        return "personal"

    if subscription.status not in ("active", "past_due"):
        return "personal"

    if subscription.expires_at is None:
        return "personal"

    expires = _ensure_aware(subscription.expires_at)
    now = _now_utc()
    if subscription.status == "past_due":
        grace_days = getattr(settings, "SUBSCRIPTION_RENEWAL_GRACE_PERIOD_DAYS", 3)
        if (expires + timedelta(days=grace_days)) > now:
            return subscription.plan
        return "personal"

    if expires > now:
        return subscription.plan

    return "personal"


def set_auto_renew(session: Session, user_id: uuid.UUID, enabled: bool) -> UserSubscription:
    """
    Enable or disable automatic renewal for a user's subscription.

    If enabling auto_renew=True, requires that chip_recurring_token is present.
    Raises ValueError if attempting to enable auto_renew without a valid token.
    """
    sub = get_current_subscription(session, user_id)
    if not sub:
        raise ValueError("Subscription not found")
    if sub.plan == "personal":
        raise ValueError("Personal plan does not support automatic renewal")

    if enabled:
        if not sub.chip_recurring_token:
            raise ValueError("RECURRING_PAYMENT_UNAVAILABLE: No valid recurring payment token available")
        sub.auto_renew = True
        sub.next_renewal_at = sub.expires_at
    else:
        sub.auto_renew = False

    sub.updated_at = _now_utc()
    session.add(sub)
    session.commit()
    session.refresh(sub)
    return sub


# ---------------------------------------------------------------------------
# Expiry calculation
# ---------------------------------------------------------------------------

def calculate_subscription_expiry(
    plan: str,
    billing_period: str | None,
    base_dt: datetime,
) -> datetime | None:
    """
    Calculate the expiry datetime for a new subscription period.

    Returns None for personal (perpetual). Raises ValueError for invalid input.
    """
    if plan == "personal":
        return None
    if plan not in SUBSCRIPTION_PLAN_VALUES:
        raise ValueError(f"Invalid plan: {plan!r}")
    if billing_period is None or billing_period not in BILLING_PERIOD_VALUES:
        raise ValueError(
            f"Paid plans require a valid billing_period, got: {billing_period!r}"
        )
    base = _ensure_aware(base_dt)
    if billing_period == "monthly":
        return base + timedelta(days=MONTHLY_DAYS)
    return base + timedelta(days=YEARLY_DAYS)


# ---------------------------------------------------------------------------
# Subscription creation
# ---------------------------------------------------------------------------

def create_subscription(
    session: Session,
    *,
    user_id: uuid.UUID,
    plan: str,
    billing_period: str | None = None,
    started_at: datetime | None = None,
    gateway: str | None = None,
    chip_client_id: str | None = None,
    chip_recurring_token: str | None = None,
    auto_renew: bool = False,
    next_renewal_at: datetime | None = None,
) -> UserSubscription:
    """
    Create a new subscription record.

    For Personal: billing_period, started_at, expires_at are all None, auto_renew=False, next_renewal_at=None.
    For paid plans: started_at defaults to now() if not provided; expires_at is
    computed via calculate_subscription_expiry.

    Does NOT commit — the caller manages the transaction.
    """
    if plan not in SUBSCRIPTION_PLAN_VALUES:
        raise ValueError(f"Invalid plan: {plan!r}")

    now = _now_utc()

    if plan == "personal":
        sub = UserSubscription(
            user_id=user_id,
            plan="personal",
            billing_period=None,
            status="active",
            started_at=None,
            expires_at=None,
            auto_renew=False,
            next_renewal_at=None,
            gateway=gateway,
            chip_client_id=chip_client_id,
            chip_recurring_token=chip_recurring_token,
            created_at=now,
            updated_at=now,
        )
    else:
        if billing_period not in BILLING_PERIOD_VALUES:
            raise ValueError(
                f"Paid plans require a valid billing_period, got: {billing_period!r}"
            )
        effective_start = started_at or now
        expires = calculate_subscription_expiry(plan, billing_period, effective_start)
        sub = UserSubscription(
            user_id=user_id,
            plan=plan,
            billing_period=billing_period,
            status="active",
            started_at=effective_start,
            expires_at=expires,
            auto_renew=auto_renew,
            next_renewal_at=next_renewal_at if auto_renew else None,
            gateway=gateway,
            chip_client_id=chip_client_id,
            chip_recurring_token=chip_recurring_token,
            created_at=now,
            updated_at=now,
        )

    session.add(sub)
    return sub


def create_default_personal_subscription(
    session: Session,
    user_id: uuid.UUID,
) -> UserSubscription:
    """
    Create the default Personal subscription for a newly registered user.
    Called from crud.create_user inside the same session/transaction.
    """
    return create_subscription(session, user_id=user_id, plan="personal")


# ---------------------------------------------------------------------------
# Activate / update subscription
# ---------------------------------------------------------------------------

def activate_subscription(
    session: Session,
    *,
    user_id: uuid.UUID,
    plan: str,
    billing_period: str | None = None,
    started_at: datetime | None = None,
    gateway: str | None = None,
    chip_client_id: str | None = None,
    chip_recurring_token: str | None = None,
    auto_renew: bool | None = None,
    next_renewal_at: datetime | None = None,
) -> UserSubscription:
    """
    Set (or replace) the user's current subscription to the given plan.

    If the user already has a subscription row it is updated in place.
    If not, a new row is created.

    This function is intended to be called by a payment provider after a
    successful payment. Do NOT expose it as a public API endpoint.

    Does NOT commit — the caller manages the transaction.
    """
    existing = get_current_subscription(session, user_id)
    now = _now_utc()

    if plan == "personal":
        if existing:
            existing.plan = "personal"
            existing.billing_period = None
            existing.status = "active"
            existing.started_at = None
            existing.expires_at = None
            existing.cancel_at_period_end = False
            existing.auto_renew = False
            existing.next_renewal_at = None
            if gateway:
                existing.gateway = gateway
            if chip_client_id:
                existing.chip_client_id = chip_client_id
            if chip_recurring_token:
                existing.chip_recurring_token = chip_recurring_token
            existing.updated_at = now
            session.add(existing)
            return existing
        return create_subscription(
            session,
            user_id=user_id,
            plan="personal",
            gateway=gateway,
            chip_client_id=chip_client_id,
            chip_recurring_token=chip_recurring_token,
        )

    if plan not in SUBSCRIPTION_PLAN_VALUES:
        raise ValueError(f"Invalid plan: {plan!r}")
    if billing_period not in BILLING_PERIOD_VALUES:
        raise ValueError(
            f"Paid plans require a valid billing_period, got: {billing_period!r}"
        )

    effective_start = started_at or now
    expires = calculate_subscription_expiry(plan, billing_period, effective_start)

    if existing:
        existing.plan = plan
        existing.billing_period = billing_period
        existing.status = "active"
        existing.started_at = effective_start
        existing.expires_at = expires
        existing.cancel_at_period_end = False
        if auto_renew is not None:
            existing.auto_renew = auto_renew
        if next_renewal_at is not None:
            existing.next_renewal_at = next_renewal_at
        elif existing.auto_renew and existing.next_renewal_at is None:
            existing.next_renewal_at = expires
        if gateway:
            existing.gateway = gateway
        if chip_client_id:
            existing.chip_client_id = chip_client_id
        if chip_recurring_token:
            existing.chip_recurring_token = chip_recurring_token
        existing.updated_at = now
        session.add(existing)
        return existing

    return create_subscription(
        session,
        user_id=user_id,
        plan=plan,
        billing_period=billing_period,
        started_at=effective_start,
        gateway=gateway,
        chip_client_id=chip_client_id,
        chip_recurring_token=chip_recurring_token,
        auto_renew=auto_renew if auto_renew is not None else False,
        next_renewal_at=next_renewal_at,
    )


# ---------------------------------------------------------------------------
# Renewal
# ---------------------------------------------------------------------------

def renew_subscription(
    session: Session,
    user_id: uuid.UUID,
    *,
    gateway: str | None = None,
    chip_recurring_token: str | None = None,
    auto_renew: bool | None = None,
    next_renewal_at: datetime | None = None,
) -> UserSubscription:
    """
    Renew the user's current paid subscription.

    - If currently active (expires_at in the future): extend from expires_at
      (preserves remaining time).
    - If expired or no subscription: start a fresh period from now().
    - Personal plan: no-op, returns the current subscription unchanged.

    Does NOT commit — the caller manages the transaction.
    """
    existing = get_current_subscription(session, user_id)
    now = _now_utc()

    if existing is None or existing.plan == "personal":
        if existing is None:
            return create_subscription(session, user_id=user_id, plan="personal")
        return existing

    if existing.billing_period not in BILLING_PERIOD_VALUES:
        raise ValueError(
            f"Cannot renew subscription with billing_period={existing.billing_period!r}"
        )

    days = MONTHLY_DAYS if existing.billing_period == "monthly" else YEARLY_DAYS

    # Determine the base for extension
    if existing.expires_at and _ensure_aware(existing.expires_at) > now:
        # Still active — extend from current expiry (don't lose remaining time)
        base = _ensure_aware(existing.expires_at)
    else:
        # Already expired — fresh period starting now
        base = now

    new_expires = base + timedelta(days=days)
    existing.status = "active"
    existing.expires_at = new_expires
    if auto_renew is not None:
        existing.auto_renew = auto_renew
    if next_renewal_at is not None:
        existing.next_renewal_at = next_renewal_at
    elif existing.auto_renew:
        existing.next_renewal_at = new_expires

    if gateway:
        existing.gateway = gateway
    if chip_recurring_token:
        existing.chip_recurring_token = chip_recurring_token
    existing.updated_at = now
    session.add(existing)
    return existing


# ---------------------------------------------------------------------------
# Recurring domain helpers
# ---------------------------------------------------------------------------

def is_auto_renew_enabled(subscription: UserSubscription | None) -> bool:
    """
    Determine whether a subscription is currently active and configured for auto-renew.

    Requires:
      - Subscription exists and plan != 'personal'
      - Status == 'active'
      - auto_renew is True
      - chip_recurring_token is present
      - next_renewal_at is present
    """
    if subscription is None or subscription.plan == "personal":
        return False
    if subscription.status != "active":
        return False
    if not subscription.auto_renew:
        return False
    if not subscription.chip_recurring_token:
        return False
    if subscription.next_renewal_at is None:
        return False
    return True


def has_recurring_token(subscription: UserSubscription | None) -> bool:
    """Check if a recurring token exists for the subscription."""
    if subscription is None:
        return False
    return bool(subscription.chip_recurring_token)


def get_next_renewal_date(subscription: UserSubscription | None) -> datetime | None:
    """Return next_renewal_at if auto_renew is enabled, otherwise None."""
    if subscription is not None and is_auto_renew_enabled(subscription):
        return subscription.next_renewal_at
    return None


# ---------------------------------------------------------------------------
# Public response helper
# ---------------------------------------------------------------------------

def subscription_to_public(subscription: UserSubscription | None) -> UserSubscriptionPublic:
    """Convert a UserSubscription (or None) to its public response schema."""
    if subscription is None:
        return UserSubscriptionPublic(
            plan="personal",
            effective_plan="personal",
            billing_period=None,
            status="active",
            started_at=None,
            expires_at=None,
            cancel_at_period_end=False,
            auto_renew=False,
            next_renewal_at=None,
        )

    effective = get_effective_plan(subscription=subscription)
    status_display = subscription.status
    if (
        subscription.plan != "personal"
        and effective == "personal"
        and subscription.status == "active"
    ):
        status_display = "expired"

    return UserSubscriptionPublic(
        plan=subscription.plan,
        effective_plan=effective,
        billing_period=subscription.billing_period,
        status=status_display,
        started_at=subscription.started_at,
        expires_at=subscription.expires_at,
        cancel_at_period_end=subscription.cancel_at_period_end,
        auto_renew=subscription.auto_renew,
        next_renewal_at=subscription.next_renewal_at,
    )


def get_subscription_details(
    session: Session,
    user: Any,
) -> Any:
    """
    Consolidate authoritative subscription details, entitlement limits, quota usages,
    over-limit warnings, subscription history, and payment history for the given user.
    """
    from app.models import (
        OverLimitWarningPublic,
        SubscriptionDetailsPublic,
        SubscriptionHistoryPublic,
        SubscriptionPayment,
        UserPaymentPublic,
    )
    from app.services import entitlement_service
    from sqlmodel import col

    sub = get_current_subscription(session, user.id)
    effective_plan = get_effective_plan(subscription=sub)
    stored_plan = sub.plan if sub else "personal"
    billing_period = sub.billing_period if sub else None

    is_expired = stored_plan != "personal" and effective_plan == "personal"

    status_display = sub.status if sub else "active"
    if (
        stored_plan != "personal"
        and effective_plan == "personal"
        and sub
        and sub.status == "active"
    ):
        status_display = "expired"

    now = _now_utc()
    is_approaching_expiry = False
    days_until_expiry: int | None = None

    if sub and sub.expires_at and effective_plan != "personal":
        expires = _ensure_aware(sub.expires_at)
        diff_seconds = (expires - now).total_seconds()
        if diff_seconds > 0:
            days_until_expiry = max(0, int(diff_seconds // 86400))
            is_approaching_expiry = days_until_expiry <= 5
        else:
            days_until_expiry = 0

    limits = dict(
        entitlement_service.PLAN_LIMITS.get(
            effective_plan, entitlement_service.PLAN_LIMITS["personal"]
        )
    )

    # Counts
    import json
    from app.models import Company

    company_ids: list[str] = []
    try:
        company_ids = json.loads(user.companies or "[]")
    except Exception:
        pass
    if not isinstance(company_ids, list):
        company_ids = []

    if user.company_id and str(user.company_id) not in company_ids:
        company_ids.append(str(user.company_id))

    if user.id is not None:
        owned_companies = session.exec(
            select(Company.id).where(
                Company.user_id == user.id,
                col(Company.is_active).is_(True),
            )
        ).all()
        for oc_id in owned_companies:
            oc_str = str(oc_id)
            if oc_str not in company_ids:
                company_ids.append(oc_str)

    # Filter to only active companies
    valid_uuids = []
    for cid_str in company_ids:
        try:
            valid_uuids.append(uuid.UUID(cid_str))
        except Exception:
            pass
    if valid_uuids:
        active_ids = set(
            str(cid)
            for cid in session.exec(
                select(Company.id).where(
                    col(Company.id).in_(valid_uuids),
                    col(Company.is_active).is_(True),
                )
            ).all()
        )
        company_ids = [cid for cid in company_ids if cid in active_ids]
    else:
        company_ids = []

    # Sync user.companies in DB if non-superuser is missing any active company IDs
    if not user.is_superuser:
        try:
            existing_ids = json.loads(user.companies or "[]")
        except Exception:
            existing_ids = []
        if set(existing_ids) != set(company_ids):
            user.companies = json.dumps(company_ids)
            session.add(user)
            session.commit()
            session.refresh(user)

    companies_count = len(company_ids)

    staff_count = 1
    products_count = 0
    customers_count = 0

    if company_ids:
        staff_sum = 0
        prod_sum = 0
        cust_sum = 0
        for cid_str in company_ids:
            try:
                cid = uuid.UUID(cid_str)
                staff_sum += entitlement_service.get_staff_count(session, cid)
                prod_sum += entitlement_service.get_product_count(session, cid)
                cust_sum += entitlement_service.get_client_count(session, cid)
            except Exception:
                pass
        if staff_sum > 0:
            staff_count = staff_sum
        products_count = prod_sum
        customers_count = cust_sum

    # Monthly quota usage
    doc_used = entitlement_service.get_monthly_usage(
        session, user_id=user.id, feature="documents"
    )
    ocr_used = entitlement_service.get_monthly_usage(
        session, user_id=user.id, feature="ocr"
    )

    # AI Summary
    ai_available = True
    ai_cooldown_seconds: int | None = None
    ai_next_available_at: datetime | None = None

    if limits.get("ai_summary") is not None:
        last_used = entitlement_service.get_last_used_at(
            session, user_id=user.id, feature="ai_summary"
        )
        if last_used:
            elapsed = now - last_used
            cooldown = entitlement_service.AI_SUMMARY_COOLDOWN
            if elapsed < cooldown:
                remaining = cooldown - elapsed
                ai_available = False
                ai_cooldown_seconds = int(remaining.total_seconds())
                ai_next_available_at = last_used + cooldown

    usage_dict = {
        "companies": companies_count,
        "staff": staff_count,
        "products": products_count,
        "customers": customers_count,
        "documents": {
            "used": doc_used,
            "limit": limits.get("documents"),
        },
        "ocr": {
            "used": ocr_used,
            "limit": limits.get("ocr"),
        },
        "ai_summary": {
            "available": ai_available,
            "cooldown_seconds": ai_cooldown_seconds,
            "next_available_at": (
                ai_next_available_at.isoformat() if ai_next_available_at else None
            ),
        },
    }

    # Over-limit warnings
    over_limit_warnings: list[OverLimitWarningPublic] = []
    if is_expired or effective_plan == "personal":
        resource_labels = {
            "companies": ("Companies", companies_count),
            "staff": ("Staff", staff_count),
            "products": ("Products", products_count),
            "customers": ("Customers", customers_count),
        }
        for feat, (lbl, curr) in resource_labels.items():
            lim = limits.get(feat)
            if lim is not None and isinstance(lim, int) and curr > lim:
                over_limit_warnings.append(
                    OverLimitWarningPublic(
                        feature=feat,
                        label=lbl,
                        current=curr,
                        limit=lim,
                        message=(
                            f"Your previous {stored_plan.capitalize()} plan allowed more resources. "
                            f"You currently have: {curr} {lbl.lower()}. "
                            f"Personal allows: {lim} {lbl.lower()}. "
                            f"Your existing data remains available, but you cannot add another "
                            f"{feat[:-1] if feat.endswith('s') else feat} unless you upgrade."
                        ),
                    )
                )

    # Payment history
    pay_stmt = (
        select(SubscriptionPayment)
        .where(col(SubscriptionPayment.user_id) == user.id)
        .order_by(col(SubscriptionPayment.created_at).desc())
    )
    payments = session.exec(pay_stmt).all()
    payment_history = [
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

    # Subscription history
    subscription_history: list[SubscriptionHistoryPublic] = []
    for p in payments:
        if p.status == "paid":
            hist_status = (
                "Active"
                if (
                    sub
                    and sub.status == "active"
                    and effective_plan == p.plan
                    and sub.billing_period == p.billing_interval
                )
                else "Paid"
            )
            period_dt = p.paid_at or p.created_at
            period_str = period_dt.strftime("%b %Y") if period_dt else ""
            subscription_history.append(
                SubscriptionHistoryPublic(
                    plan=p.plan.capitalize(),
                    billing_interval=p.billing_interval.capitalize(),
                    period=period_str,
                    status=hist_status,
                    created_at=period_dt,
                )
            )

    if not subscription_history or stored_plan == "personal":
        subscription_history.append(
            SubscriptionHistoryPublic(
                plan="Personal",
                billing_interval="Free",
                period="Perpetual",
                status="Active" if effective_plan == "personal" else "Ended",
                created_at=sub.created_at if sub else getattr(user, "created_at", None),
            )
        )

    return SubscriptionDetailsPublic(
        plan=stored_plan,
        effective_plan=effective_plan,
        status=status_display,
        billing_interval=billing_period,
        current_period_start=sub.started_at if sub else None,
        current_period_end=sub.expires_at if sub else None,
        cancel_at_period_end=sub.cancel_at_period_end if sub else False,
        auto_renew=sub.auto_renew if sub else False,
        next_renewal_at=sub.next_renewal_at if sub else None,
        is_approaching_expiry=is_approaching_expiry,
        days_until_expiry=days_until_expiry,
        is_expired=is_expired,
        limits=limits,
        usage=usage_dict,
        over_limit_warnings=over_limit_warnings,
        subscription_history=subscription_history,
        payment_history=payment_history,
    )

