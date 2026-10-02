"""CHIP Collect API client and helper service.

Handles server-side communication with CHIP Collect API:
  - Client management (create / retrieve CHIP Client)
  - Server-side price validation and Purchase creation
  - RSA PKCS#1 v1.5 + SHA256 webhook & callback signature verification
"""

from __future__ import annotations

import base64
import logging
from typing import Any

import httpx

from app.core.config import settings
from app.models import User

logger = logging.getLogger(__name__)

# Server-side authoritative price definitions in smallest currency units (MYR cents)
# Pro: RM 29/mo, RM 330.60/yr (5% discount)
# Max: RM 59/mo, RM 672.60/yr (5% discount)
PLAN_PRICES: dict[str, dict[str, dict[str, Any]]] = {
    "pro": {
        "monthly": {"amount": 2900, "currency": "MYR"},
        "yearly": {"amount": 33060, "currency": "MYR"},
    },
    "max": {
        "monthly": {"amount": 5900, "currency": "MYR"},
        "yearly": {"amount": 67260, "currency": "MYR"},
    },
}


class ChipServiceError(Exception):
    """Base exception for CHIP Collect integration errors."""


class ChipRecurringChargeError(ChipServiceError):
    """Error charging a CHIP purchase using a recurring token."""

    def __init__(self, message: str, code: str = "CHARGE_FAILED"):
        super().__init__(message)
        self.code = code


class ChipService:
    """Service encapsulating CHIP Collect REST API communication."""

    @staticmethod
    def get_price(plan: str, billing_interval: str) -> tuple[int, str]:
        """Return the authoritative server-side price (amount_cents, currency)."""
        if plan not in PLAN_PRICES:
            raise ValueError(
                f"Invalid plan for purchase: {plan!r}. Personal plan is free."
            )
        plan_config = PLAN_PRICES[plan]
        if billing_interval not in plan_config:
            raise ValueError(f"Invalid billing interval: {billing_interval!r}")

        item = plan_config[billing_interval]
        return item["amount"], item["currency"]

    @classmethod
    def create_purchase(
        cls,
        user: User,
        plan: str,
        billing_interval: str,
        reference: str,
    ) -> dict[str, Any]:
        """
        Create a CHIP Purchase for subscription checkout.

        Returns dict containing:
          - purchase_id: CHIP Purchase ID
          - checkout_url: Redirect URL for frontend checkout
          - client_id: CHIP Client ID
          - amount: Amount in cents
          - currency: Currency string
        """
        amount, currency = cls.get_price(plan, billing_interval)

        # Base URL construction
        chip_url = settings.CHIP_API_URL.rstrip("/")
        webhook_url = (
            settings.CHIP_WEBHOOK_URL
            or f"{settings.APP_PUBLIC_URL.rstrip('/')}/api/v1/payments/chip/callback"
        )

        headers = {
            "Authorization": f"Bearer {settings.CHIP_SECRET_KEY}",
            "Content-Type": "application/json",
        }

        payload: dict[str, Any] = {
            "brand_id": settings.CHIP_BRAND_ID,
            "client": {
                "email": user.email,
                "full_name": user.full_name or user.email,
            },
            "purchase": {
                "currency": currency,
                "products": [
                    {
                        "name": f"{settings.PROJECT_NAME} Subscription - {plan.capitalize()} ({billing_interval.capitalize()})",
                        "price": amount,
                        "quantity": 1,
                    }
                ],
                "notes": f"Subscription user_id={user.id} plan={plan} interval={billing_interval}",
            },
            "success_redirect": f"{settings.APP_PUBLIC_URL.rstrip('/')}/payment/success?ref={reference}",
            "failure_redirect": f"{settings.APP_PUBLIC_URL.rstrip('/')}/payment/failure?ref={reference}",
            "cancel_redirect": f"{settings.APP_PUBLIC_URL.rstrip('/')}/payment/cancel?ref={reference}",
            "success_callback": webhook_url,
            "reference": reference,
        }

        # If CHIP credentials are not configured (e.g. in test env without mock), mock response cleanly
        if not settings.CHIP_SECRET_KEY or not settings.CHIP_BRAND_ID:
            logger.warning(
                "CHIP_SECRET_KEY or CHIP_BRAND_ID not configured; generating mock checkout session"
            )
            mock_id = f"pur_mock_{reference}"
            return {
                "purchase_id": mock_id,
                "checkout_url": f"{settings.APP_PUBLIC_URL.rstrip('/')}/payment/success?ref={reference}&mock=true",
                "client_id": f"cli_mock_{user.id}",
                "amount": amount,
                "currency": currency,
            }

        try:
            response = httpx.post(
                f"{chip_url}/purchases/",
                json=payload,
                headers=headers,
                timeout=15.0,
            )
            response.raise_for_status()
            data = response.json()

            purchase_id = data.get("id")
            checkout_url = data.get("checkout_url")
            client_id = data.get("client", {}).get("id")

            if not checkout_url:
                raise ChipServiceError("CHIP API response did not contain checkout_url")

            return {
                "purchase_id": purchase_id,
                "checkout_url": checkout_url,
                "client_id": client_id,
                "amount": amount,
                "currency": currency,
            }
        except httpx.HTTPError as exc:
            logger.error("Failed to create CHIP purchase: %s", exc)
            raise ChipServiceError(
                "Unable to initiate payment with CHIP gateway. Please try again."
            ) from exc

    @staticmethod
    def verify_rsa_signature(
        raw_body: bytes,
        signature_b64: str,
        public_key_pem: str,
    ) -> bool:
        """
        Verify RSA PKCS#1 v1.5 SHA-256 signature against raw HTTP request body.

        Args:
            raw_body: Raw request body bytes as received from HTTP request.
            signature_b64: Base64-encoded signature from X-Signature header.
            public_key_pem: RSA Public Key in PEM format.

        Returns:
            bool: True if signature is valid, False otherwise.
        """
        if not signature_b64 or not public_key_pem:
            return False

        try:
            from cryptography.exceptions import InvalidSignature
            from cryptography.hazmat.primitives import hashes
            from cryptography.hazmat.primitives.asymmetric import padding
            from cryptography.hazmat.primitives.serialization import load_pem_public_key

            signature_bytes = base64.b64decode(signature_b64)
            formatted_pem = public_key_pem.replace("\\n", "\n").strip()
            public_key = load_pem_public_key(formatted_pem.encode("utf-8"))

            # RSA PKCS#1 v1.5 SHA-256 verification
            public_key.verify(  # type: ignore[union-attr]
                signature_bytes,
                raw_body,
                padding.PKCS1v15(),
                hashes.SHA256(),
            )
            return True
        except (ValueError, TypeError, InvalidSignature) as exc:
            logger.warning("RSA signature verification failed: %s", exc)
            return False

    @classmethod
    def charge_purchase_with_recurring_token(
        cls,
        purchase_id: str,
        recurring_token: str,
    ) -> dict[str, Any]:
        """
        Charge a CHIP Purchase using a stored recurring token via:
        POST /purchases/{purchase_id}/charge/

        Returns API response dict containing:
          - id: Purchase ID
          - status: Purchase status ('paid', 'pending_charge', etc.)
        Raises ChipRecurringChargeError on invalid token or charge failure.
        """
        chip_url = settings.CHIP_API_URL.rstrip("/")
        headers = {
            "Authorization": f"Bearer {settings.CHIP_SECRET_KEY}",
            "Content-Type": "application/json",
        }
        payload = {"recurring_token": recurring_token}

        if not settings.CHIP_SECRET_KEY or not settings.CHIP_BRAND_ID:
            logger.warning(
                "CHIP_SECRET_KEY or CHIP_BRAND_ID not configured; generating mock recurring charge response"
            )
            return {
                "id": purchase_id,
                "status": "paid",
                "recurring_token": recurring_token,
                "mock": True,
            }

        try:
            response = httpx.post(
                f"{chip_url}/purchases/{purchase_id}/charge/",
                json=payload,
                headers=headers,
                timeout=15.0,
            )

            if response.status_code in (400, 422):
                try:
                    err_data = response.json()
                except Exception:
                    err_data = {}

                err_str = str(err_data).lower()
                if (
                    "invalid_recurring_token" in err_str
                    or "invalid recurring token" in err_str
                    or "token" in err_str
                ):
                    logger.error(
                        "CHIP recurring charge failed: invalid recurring token for purchase %s",
                        purchase_id,
                    )
                    raise ChipRecurringChargeError(
                        "Stored recurring token is invalid or inactive.",
                        code="INVALID_RECURRING_TOKEN",
                    )
                logger.error(
                    "CHIP recurring charge failed for purchase %s: %s",
                    purchase_id,
                    err_data,
                )
                raise ChipRecurringChargeError(
                    f"Payment provider rejected charge: {err_data.get('message', 'charge_failed')}",
                    code="CHARGE_FAILED",
                )

            response.raise_for_status()
            return response.json()
        except httpx.TimeoutException as exc:
            logger.error(
                "Timeout while charging CHIP purchase %s: %s", purchase_id, exc
            )
            raise ChipServiceError(
                "Network timeout during CHIP charge request"
            ) from exc
        except httpx.HTTPError as exc:
            logger.error(
                "HTTP error while charging CHIP purchase %s: %s", purchase_id, exc
            )
            raise ChipServiceError(
                "Unable to communicate with CHIP gateway for recurring charge."
            ) from exc

    @classmethod
    def get_purchase(cls, purchase_id: str) -> dict[str, Any]:
        """
        Retrieve CHIP Purchase details via GET /purchases/{purchase_id}/
        Used for status reconciliation following network timeouts or ambiguous charge responses.
        """
        chip_url = settings.CHIP_API_URL.rstrip("/")
        headers = {
            "Authorization": f"Bearer {settings.CHIP_SECRET_KEY}",
        }

        if not settings.CHIP_SECRET_KEY or not settings.CHIP_BRAND_ID:
            return {"id": purchase_id, "status": "paid", "mock": True}

        try:
            response = httpx.get(
                f"{chip_url}/purchases/{purchase_id}/",
                headers=headers,
                timeout=15.0,
            )
            response.raise_for_status()
            return response.json()
        except httpx.HTTPError as exc:
            logger.error("Failed to retrieve CHIP purchase %s: %s", purchase_id, exc)
            raise ChipServiceError("Unable to retrieve CHIP purchase details.") from exc
