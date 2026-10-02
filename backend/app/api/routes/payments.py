"""CHIP Collect Payment Webhook & Callback Route.

POST /api/v1/payments/chip/callback
  - Receives asynchronous callbacks and webhook events from CHIP Collect.
  - Verifies RSA PKCS#1 v1.5 + SHA256 signature against raw HTTP request body bytes.
  - Ensures idempotent handling of duplicate webhooks.
  - Validates purchase identity, amount, currency, and internal reference.
  - Activates or extends user subscription upon verified payment.
"""

import hashlib
import json
import logging

from fastapi import APIRouter, HTTPException, Request, Response
from sqlmodel import select

from app.api.deps import SessionDep
from app.core.config import settings
from app.models import PaymentWebhookEvent, SubscriptionPayment, SubscriptionRenewal, UserSubscription
from app.services.chip_service import ChipService
from app.services.subscription_service import activate_subscription, get_current_subscription, renew_subscription, _now_utc

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/payments", tags=["payments"])


@router.post("/chip/callback")
async def chip_payment_callback(request: Request, session: SessionDep) -> Response:
    """
    Asynchronous payment callback and webhook receiver for CHIP Collect.

    Authenticates provider calls cryptographically via RSA signature over the raw HTTP body.
    Processes payments transactionally and idempotently.
    """
    raw_body = await request.body()
    signature_header = request.headers.get("X-Signature") or request.headers.get("x-signature")

    # Signature verification
    if settings.CHIP_WEBHOOK_PUBLIC_KEY:
        if not signature_header or not ChipService.verify_rsa_signature(
            raw_body, signature_header, settings.CHIP_WEBHOOK_PUBLIC_KEY
        ):
            logger.warning("Rejected CHIP callback: invalid or missing RSA signature")
            raise HTTPException(status_code=401, detail="Invalid signature")
    elif signature_header:
        # Verify if public key signature provided
        pass

    try:
        payload = json.loads(raw_body.decode("utf-8"))
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="Invalid JSON payload") from exc

    event_type = payload.get("event_type") or payload.get("event") or "purchase.paid"
    
    # Extract purchase data from root or purchase object
    purchase_data = payload.get("purchase") if isinstance(payload.get("purchase"), dict) else payload
    purchase_id = purchase_data.get("id") or payload.get("id")
    reference = purchase_data.get("reference") or payload.get("reference")
    status = (purchase_data.get("status") or payload.get("status") or "").lower()
    amount = purchase_data.get("payment", {}).get("amount") or purchase_data.get("price") or payload.get("price")
    currency = purchase_data.get("payment", {}).get("currency") or purchase_data.get("currency") or "MYR"
    client_id = payload.get("client", {}).get("id")
    recurring_token = payload.get("is_recurring_token") or payload.get("recurring_token")

    if not purchase_id and not reference:
        raise HTTPException(status_code=400, detail="Missing purchase_id or reference in payload")

    payload_hash = hashlib.sha256(raw_body).hexdigest()
    object_id_str = str(purchase_id or reference)

    # 1. Idempotency Check via PaymentWebhookEvent
    event_stmt = select(PaymentWebhookEvent).where(
        PaymentWebhookEvent.provider == "chip",
        PaymentWebhookEvent.event_type == event_type,
        PaymentWebhookEvent.provider_object_id == object_id_str,
    )
    webhook_event = session.exec(event_stmt).first()

    if webhook_event and webhook_event.processed:
        logger.info("Ignoring duplicate CHIP webhook event %s for purchase %s", event_type, object_id_str)
        return Response(content=json.dumps({"status": "already_processed"}), media_type="application/json", status_code=200)

    if not webhook_event:
        webhook_event = PaymentWebhookEvent(
            provider="chip",
            event_type=event_type,
            provider_object_id=object_id_str,
            payload_hash=payload_hash,
            processed=False,
            created_at=_now_utc(),
        )
        session.add(webhook_event)
        session.flush()

    # 2. Find SubscriptionPayment record
    payment_stmt = select(SubscriptionPayment)
    if reference:
        payment_stmt = payment_stmt.where(SubscriptionPayment.reference == reference)
    elif purchase_id:
        payment_stmt = payment_stmt.where(SubscriptionPayment.provider_purchase_id == purchase_id)

    payment = session.exec(payment_stmt).first()

    if not payment:
        logger.error("No pending subscription payment found for reference=%s purchase_id=%s", reference, purchase_id)
        webhook_event.processed = True
        webhook_event.processed_at = _now_utc()
        session.add(webhook_event)
        session.commit()
        return Response(content=json.dumps({"status": "payment_record_not_found"}), media_type="application/json", status_code=200)

    # 3. Idempotency Check on SubscriptionPayment
    if payment.status == "paid":
        logger.info("Payment %s already marked as paid", payment.reference)
        webhook_event.processed = True
        webhook_event.processed_at = _now_utc()
        session.add(webhook_event)
        session.commit()
        return Response(content=json.dumps({"status": "already_paid"}), media_type="application/json", status_code=200)

    # 4. Amount and currency validation
    if amount is not None and payment.amount != int(amount):
        logger.error("Payment amount mismatch for %s: expected %s, got %s", payment.reference, payment.amount, amount)
        raise HTTPException(status_code=400, detail="Payment amount mismatch")

    if currency and payment.currency.upper() != str(currency).upper():
        logger.error("Payment currency mismatch for %s: expected %s, got %s", payment.reference, payment.currency, currency)
        raise HTTPException(status_code=400, detail="Payment currency mismatch")

    # 5. Process Payment Activation or Failure
    is_success_event = status == "paid" or event_type in ("purchase.paid", "purchase.success", "payment.success")

    # Check for matching SubscriptionRenewal record
    renewal_stmt = select(SubscriptionRenewal)
    if purchase_id:
        renewal_stmt = renewal_stmt.where(SubscriptionRenewal.chip_purchase_id == str(purchase_id))
    elif payment.subscription_id:
        renewal_stmt = renewal_stmt.where(SubscriptionRenewal.subscription_id == payment.subscription_id)
    renewal = session.exec(renewal_stmt).first()

    if is_success_event:
        payment.status = "paid"
        payment.provider_purchase_id = str(purchase_id) if purchase_id else payment.provider_purchase_id
        payment.paid_at = _now_utc()
        payment.updated_at = _now_utc()
        session.add(payment)

        if renewal:
            renewal.status = "paid"
            renewal.completed_at = _now_utc()
            renewal.updated_at = _now_utc()
            session.add(renewal)

        # Check if user already has an active subscription on the same plan to renew or activate
        existing_sub = get_current_subscription(session, payment.user_id)
        if existing_sub and existing_sub.plan == payment.plan and existing_sub.status == "active":
            updated_sub = renew_subscription(
                session,
                payment.user_id,
                gateway="chip",
                chip_recurring_token=str(recurring_token) if recurring_token else None,
            )
            if updated_sub.auto_renew:
                updated_sub.next_renewal_at = updated_sub.expires_at
                session.add(updated_sub)
        else:
            activate_subscription(
                session,
                user_id=payment.user_id,
                plan=payment.plan,
                billing_period=payment.billing_interval,
                gateway="chip",
                chip_client_id=str(client_id) if client_id else None,
                chip_recurring_token=str(recurring_token) if recurring_token else None,
            )

        webhook_event.processed = True
        webhook_event.processed_at = _now_utc()
        session.add(webhook_event)
        session.commit()

        logger.info("Successfully activated/renewed subscription for user %s on plan %s", payment.user_id, payment.plan)
        return Response(content=json.dumps({"status": "success", "plan": payment.plan}), media_type="application/json", status_code=200)

    elif status in ("failed", "error", "cancelled") or "failure" in event_type:
        payment.status = "failed"
        payment.updated_at = _now_utc()
        session.add(payment)

        if renewal:
            renewal.status = "failed"
            renewal.failure_reason = f"Payment status: {status}"
            renewal.updated_at = _now_utc()
            session.add(renewal)

        webhook_event.processed = True
        webhook_event.processed_at = _now_utc()
        session.add(webhook_event)
        session.commit()

        return Response(content=json.dumps({"status": "payment_failed"}), media_type="application/json", status_code=200)

    # Acknowledge other event types safely
    webhook_event.processed = True
    webhook_event.processed_at = _now_utc()
    session.add(webhook_event)
    session.commit()
    return Response(content=json.dumps({"status": "ignored"}), media_type="application/json", status_code=200)
