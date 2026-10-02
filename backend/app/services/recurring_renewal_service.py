"""Subscription Recurring Renewal Service.

Handles automatic renewal attempts and retries for user subscriptions using CHIP Collect:
- Validates subscription eligibility (paid plan, active/past_due status, auto_renew=True, chip_recurring_token present)
- Computes canonical billing period for renewal (preserving remaining time if active)
- Enforces 1 Subscription + 1 Billing Period = 1 Renewal idempotency via subscription_renewals database constraint
- Creates CHIP Purchase and calls CHIP recurring charge API POST /purchases/{id}/charge/
- Handles retry policy, grace period management, and stale payment status reconciliation
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, col, select

from app.core.config import settings
from app.models import (
    SubscriptionPayment,
    SubscriptionRenewal,
    User,
    UserSubscription,
)
from app.services.chip_service import ChipRecurringChargeError, ChipService, ChipServiceError
from app.services.subscription_service import (
    _ensure_aware,
    _now_utc,
    calculate_subscription_expiry,
    get_current_subscription,
    is_auto_renew_enabled,
    renew_subscription,
)

logger = logging.getLogger(__name__)


def _apply_renewal_failure(
    session: Session,
    sub: UserSubscription,
    renewal: SubscriptionRenewal,
    failure_reason: str,
) -> None:
    """Helper to record a renewal failure, schedule retry or mark subscription expired if grace period elapsed."""
    now = _now_utc()
    renewal.status = "failed"
    renewal.failure_reason = failure_reason

    max_attempts = getattr(settings, "SUBSCRIPTION_RENEWAL_MAX_ATTEMPTS", 3)
    grace_days = getattr(settings, "SUBSCRIPTION_RENEWAL_GRACE_PERIOD_DAYS", 3)

    if renewal.attempt_count < max_attempts:
        # Schedule next retry (+1 day)
        renewal.next_retry_at = now + timedelta(days=1)
        if sub.status == "active":
            sub.status = "past_due"
        session.add(sub)
    else:
        # All retry attempts exhausted
        renewal.next_retry_at = None
        expires_at_aware = _ensure_aware(sub.expires_at) if sub.expires_at else now
        if now >= expires_at_aware + timedelta(days=grace_days):
            sub.status = "expired"
            sub.auto_renew = False
            sub.next_renewal_at = None
        else:
            sub.status = "past_due"
        session.add(sub)

    renewal.updated_at = now
    session.add(renewal)


def process_subscription_renewal(
    session: Session,
    subscription_id: uuid.UUID,
) -> dict[str, Any]:
    """
    Process a single automatic subscription renewal for a subscription.

    Returns dict containing status information:
      - status: 'success' | 'processing' | 'already_paid' | 'already_processing' | 'error' | 'failed'
      - code: optional error or result code
      - detail: optional human-readable description
      - renewal_id: UUID string of the SubscriptionRenewal record
      - purchase_id: CHIP Purchase ID if created
    """
    sub = session.get(UserSubscription, subscription_id)
    if sub is None:
        return {
            "status": "error",
            "code": "SUBSCRIPTION_NOT_FOUND",
            "detail": f"Subscription {subscription_id} not found",
        }

    # 1. Eligibility Validation
    if sub.plan == "personal":
        return {
            "status": "error",
            "code": "PERSONAL_PLAN_NOT_ELIGIBLE",
            "detail": "Personal plan subscriptions cannot be automatically renewed",
        }

    if sub.status not in ("active", "past_due"):
        return {
            "status": "error",
            "code": "SUBSCRIPTION_NOT_ACTIVE",
            "detail": f"Subscription status is '{sub.status}', expected 'active' or 'past_due'",
        }

    if not sub.auto_renew:
        return {
            "status": "error",
            "code": "AUTO_RENEW_DISABLED",
            "detail": "Automatic renewal is not enabled for this subscription",
        }

    if not sub.chip_recurring_token:
        logger.warning(
            "Subscription %s has auto_renew=True but missing chip_recurring_token",
            subscription_id,
        )
        return {
            "status": "error",
            "code": "RECURRING_PAYMENT_UNAVAILABLE",
            "detail": "Recurring payment token is missing or unavailable",
        }

    if not sub.billing_period or sub.billing_period not in ("monthly", "yearly"):
        return {
            "status": "error",
            "code": "INVALID_BILLING_PERIOD",
            "detail": f"Invalid billing period: '{sub.billing_period}'",
        }

    now = _now_utc()

    # 2. Renewal Period Calculation
    if sub.expires_at and _ensure_aware(sub.expires_at) > now:
        period_start = _ensure_aware(sub.expires_at)
    else:
        period_start = now

    period_end = calculate_subscription_expiry(sub.plan, sub.billing_period, period_start)
    if period_end is None:
        return {
            "status": "error",
            "code": "CALCULATION_ERROR",
            "detail": "Unable to calculate renewal period end date",
        }

    scheduled_at = period_start

    # 3. Idempotency Boundary: Find or Create SubscriptionRenewal
    existing_renewal_stmt = select(SubscriptionRenewal).where(
        SubscriptionRenewal.subscription_id == sub.id,
        SubscriptionRenewal.billing_period_start == period_start,
        SubscriptionRenewal.billing_period_end == period_end,
    )
    renewal = session.exec(existing_renewal_stmt).first()

    if renewal:
        if renewal.status == "paid":
            logger.info("Renewal %s for period %s - %s is already paid", renewal.id, period_start, period_end)
            return {
                "status": "already_paid",
                "renewal_id": str(renewal.id),
                "purchase_id": renewal.chip_purchase_id,
            }
        if renewal.status == "processing":
            logger.info("Renewal %s for period %s - %s is currently processing", renewal.id, period_start, period_end)
            return {
                "status": "already_processing",
                "renewal_id": str(renewal.id),
                "purchase_id": renewal.chip_purchase_id,
            }
    else:
        amount, currency = ChipService.get_price(sub.plan, sub.billing_period)
        renewal = SubscriptionRenewal(
            subscription_id=sub.id,
            user_id=sub.user_id,
            billing_period_start=period_start,
            billing_period_end=period_end,
            scheduled_at=scheduled_at,
            status="pending",
            attempt_count=1,
            amount=amount,
            currency=currency,
            created_at=now,
            updated_at=now,
        )
        try:
            session.add(renewal)
            session.flush()
        except IntegrityError:
            session.rollback()
            renewal = session.exec(existing_renewal_stmt).first()
            if renewal and renewal.status in ("paid", "processing"):
                return {
                    "status": f"already_{renewal.status}",
                    "renewal_id": str(renewal.id),
                    "purchase_id": renewal.chip_purchase_id,
                }
            if not renewal:
                return {
                    "status": "error",
                    "code": "CONCURRENCY_ERROR",
                    "detail": "Failed to create subscription renewal due to database lock",
                }

    user = session.get(User, sub.user_id)
    if not user:
        return {
            "status": "error",
            "code": "USER_NOT_FOUND",
            "detail": f"User {sub.user_id} not found for subscription",
        }

    # 4. CHIP Purchase Creation
    ref_unique = uuid.uuid4().hex[:6]
    sub_short = str(sub.id)[:8]
    ren_short = str(renewal.id)[:8]
    reference = f"SUB-{sub_short}-REN-{ren_short}-{ref_unique}"

    payment = SubscriptionPayment(
        user_id=sub.user_id,
        subscription_id=sub.id,
        provider="chip",
        plan=sub.plan,
        billing_interval=sub.billing_period,
        payment_type="automatic_renewal",
        amount=renewal.amount,
        currency=renewal.currency,
        status="pending",
        reference=reference,
        created_at=now,
        updated_at=now,
    )
    session.add(payment)
    session.flush()

    try:
        purchase_data = ChipService.create_purchase(
            user=user,
            plan=sub.plan,
            billing_interval=sub.billing_period,
            reference=reference,
        )
    except ChipServiceError as exc:
        _apply_renewal_failure(session, sub, renewal, f"Purchase creation failed: {exc}")
        session.commit()
        return {
            "status": "failed",
            "code": "PURCHASE_CREATION_FAILED",
            "detail": str(exc),
            "renewal_id": str(renewal.id),
        }

    purchase_id = purchase_data["purchase_id"]
    renewal.chip_purchase_id = purchase_id
    payment.provider_purchase_id = purchase_id
    renewal.status = "processing"
    renewal.attempted_at = _now_utc()
    session.add(renewal)
    session.add(payment)
    session.commit()

    # 5. Charge CHIP Purchase with Recurring Token
    try:
        charge_result = ChipService.charge_purchase_with_recurring_token(
            purchase_id=purchase_id,
            recurring_token=sub.chip_recurring_token,
        )
        chip_status = charge_result.get("status")
        logger.info(
            "Initiated recurring charge for subscription %s purchase %s status=%s",
            sub.id,
            purchase_id,
            chip_status,
        )
        return {
            "status": "success" if chip_status == "paid" else "processing",
            "code": "CHARGE_INITIATED",
            "renewal_id": str(renewal.id),
            "purchase_id": purchase_id,
            "chip_status": chip_status,
        }
    except ChipRecurringChargeError as exc:
        _apply_renewal_failure(session, sub, renewal, exc.args[0])
        session.commit()
        return {
            "status": "failed",
            "code": exc.code,
            "detail": str(exc),
            "renewal_id": str(renewal.id),
            "purchase_id": purchase_id,
        }
    except ChipServiceError as exc:
        logger.warning(
            "Ambiguous result when charging purchase %s for subscription %s: %s",
            purchase_id,
            sub.id,
            exc,
        )
        return {
            "status": "processing",
            "code": "CHARGE_PENDING_WEBHOOK",
            "detail": "Charge initiated; awaiting webhook status confirmation",
            "renewal_id": str(renewal.id),
            "purchase_id": purchase_id,
        }


def process_due_subscription_renewals(session: Session) -> int:
    """
    Scheduled job entrypoint to query due subscriptions and invoke renewal processing.
    """
    now = _now_utc()
    batch_size = getattr(settings, "SUBSCRIPTION_RENEWAL_BATCH_SIZE", 50)

    statement = (
        select(UserSubscription)
        .where(UserSubscription.plan != "personal")
        .where(col(UserSubscription.status).in_(["active", "past_due"]))
        .where(UserSubscription.auto_renew == True)  # noqa: E712
        .where(UserSubscription.chip_recurring_token != None)  # noqa: E711
        .where(UserSubscription.next_renewal_at != None)  # noqa: E711
        .where(UserSubscription.next_renewal_at <= now)
        .order_by(col(UserSubscription.next_renewal_at).asc())
        .limit(batch_size)
    )

    due_subs = session.exec(statement).all()
    processed_count = 0

    for candidate in due_subs:
        try:
            locked_stmt = (
                select(UserSubscription)
                .where(UserSubscription.id == candidate.id)
                .with_for_update(skip_locked=True)
            )
            locked_sub = session.exec(locked_stmt).one_or_none()
            if not locked_sub:
                continue

            res = process_subscription_renewal(session, locked_sub.id)
            if res.get("status") in ("success", "processing"):
                processed_count += 1
        except Exception as exc:
            logger.error(
                "Error processing automatic renewal for subscription %s: %s",
                candidate.id,
                exc,
                exc_info=True,
            )
            continue

    return processed_count


def retry_failed_subscription_renewals(session: Session) -> int:
    """
    Scheduled job to retry previously failed renewal attempts that are due for retry.
    Creates a new CHIP Purchase for each retry attempt under the existing renewal record.
    """
    now = _now_utc()
    batch_size = getattr(settings, "SUBSCRIPTION_RENEWAL_BATCH_SIZE", 50)
    max_attempts = getattr(settings, "SUBSCRIPTION_RENEWAL_MAX_ATTEMPTS", 3)

    statement = (
        select(SubscriptionRenewal)
        .where(SubscriptionRenewal.status == "failed")
        .where(SubscriptionRenewal.next_retry_at != None)  # noqa: E711
        .where(SubscriptionRenewal.next_retry_at <= now)
        .where(SubscriptionRenewal.attempt_count < max_attempts)
        .order_by(col(SubscriptionRenewal.next_retry_at).asc())
        .limit(batch_size)
    )

    due_retries = session.exec(statement).all()
    retried_count = 0

    for renewal in due_retries:
        sub = None
        try:
            locked_stmt = (
                select(SubscriptionRenewal)
                .where(SubscriptionRenewal.id == renewal.id)
                .with_for_update(skip_locked=True)
            )
            locked_ren = session.exec(locked_stmt).one_or_none()
            if not locked_ren or locked_ren.status != "failed":
                continue

            sub = session.get(UserSubscription, locked_ren.subscription_id)
            if not sub or not sub.auto_renew or not sub.chip_recurring_token or not sub.billing_period:
                continue

            # Reconcile status of previous purchase first to prevent double-charging if timeout occurred
            if locked_ren.chip_purchase_id:
                try:
                    chip_info = ChipService.get_purchase(locked_ren.chip_purchase_id)
                    if chip_info.get("status") == "paid":
                        locked_ren.status = "paid"
                        locked_ren.completed_at = now
                        locked_ren.updated_at = now
                        session.add(locked_ren)
                        renew_subscription(session, sub.user_id, gateway="chip", chip_recurring_token=sub.chip_recurring_token)
                        sub.next_renewal_at = sub.expires_at
                        session.add(sub)
                        session.commit()
                        retried_count += 1
                        continue
                except ChipServiceError:
                    pass

            user = session.get(User, sub.user_id)
            if not user:
                continue

            # Execute retry with a new CHIP Purchase ID
            locked_ren.attempt_count += 1
            sub_short = str(sub.id)[:8]
            ren_short = str(locked_ren.id)[:8]
            reference = f"SUB-{sub_short}-REN-{ren_short}-ATT{locked_ren.attempt_count}"

            payment = SubscriptionPayment(
                user_id=sub.user_id,
                subscription_id=sub.id,
                provider="chip",
                plan=sub.plan,
                billing_interval=sub.billing_period,
                payment_type="automatic_renewal",
                amount=locked_ren.amount,
                currency=locked_ren.currency,
                status="pending",
                reference=reference,
                created_at=now,
                updated_at=now,
            )
            session.add(payment)
            session.flush()

            purchase_data = ChipService.create_purchase(
                user=user,
                plan=sub.plan,
                billing_interval=sub.billing_period,
                reference=reference,
            )
            purchase_id = purchase_data["purchase_id"]
            locked_ren.chip_purchase_id = purchase_id
            payment.provider_purchase_id = purchase_id
            locked_ren.status = "processing"
            locked_ren.attempted_at = now
            session.add(locked_ren)
            session.add(payment)
            session.commit()

            charge_res = ChipService.charge_purchase_with_recurring_token(
                purchase_id=purchase_id,
                recurring_token=sub.chip_recurring_token,
            )
            if charge_res.get("status") == "paid":
                locked_ren.status = "paid"
                locked_ren.completed_at = now
                session.add(locked_ren)
                renew_subscription(session, sub.user_id, gateway="chip", chip_recurring_token=sub.chip_recurring_token)
                sub.next_renewal_at = sub.expires_at
                session.add(sub)
                session.commit()
            retried_count += 1
        except ChipRecurringChargeError as exc:
            if locked_ren and sub:
                _apply_renewal_failure(session, sub, locked_ren, exc.args[0])
                session.commit()
        except Exception as exc:
            logger.error("Error retrying renewal %s: %s", renewal.id, exc, exc_info=True)
            continue

    return retried_count


def reconcile_pending_subscription_renewals(session: Session) -> int:
    """
    Reconciles stale processing renewals (older than 15 minutes) with CHIP gateway.
    """
    now = _now_utc()
    threshold = now - timedelta(minutes=15)
    statement = (
        select(SubscriptionRenewal)
        .where(SubscriptionRenewal.status == "processing")
        .where(SubscriptionRenewal.attempted_at != None)  # noqa: E711
        .where(SubscriptionRenewal.attempted_at <= threshold)
    )

    stale_renewals = session.exec(statement).all()
    reconciled_count = 0

    for renewal in stale_renewals:
        if not renewal.chip_purchase_id:
            continue
        try:
            purchase_info = ChipService.get_purchase(renewal.chip_purchase_id)
            chip_status = (purchase_info.get("status") or "").lower()

            if chip_status == "paid":
                renewal.status = "paid"
                renewal.completed_at = now
                renewal.updated_at = now
                session.add(renewal)

                sub = session.get(UserSubscription, renewal.subscription_id)
                if sub:
                    updated_sub = renew_subscription(
                        session,
                        user_id=sub.user_id,
                        gateway="chip",
                        chip_recurring_token=sub.chip_recurring_token,
                    )
                    updated_sub.next_renewal_at = updated_sub.expires_at
                    session.add(updated_sub)

                session.commit()
                reconciled_count += 1
            elif chip_status in ("failed", "error", "cancelled"):
                sub = session.get(UserSubscription, renewal.subscription_id)
                if sub:
                    _apply_renewal_failure(session, sub, renewal, f"Reconciled status: {chip_status}")
                    session.commit()
                reconciled_count += 1
        except Exception as exc:
            logger.error("Failed to reconcile subscription renewal %s: %s", renewal.id, exc)
            continue

    return reconciled_count
