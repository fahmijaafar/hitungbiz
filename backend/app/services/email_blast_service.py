"""
Email blast service.

Provides:
- resolve_recipients(): build recipient list from a filter dict
- replace_placeholders(): substitute {{placeholder}} tokens in body text
- render_campaign_email(): wrap a composed body in the campaign_email.html template
- dispatch_campaign(): background job that sends a campaign and tracks per-recipient status
"""
from __future__ import annotations

import logging
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlmodel import Session, or_, select

from app.core.config import settings
from app.core.db import engine
from app.models import (
    EmailCampaign,
    EmailCampaignRecipient,
    User,
)
from app.utils import EmailData, render_email_template, send_email

logger = logging.getLogger(__name__)

# ────────────────────────────────────────────────────────────────────────────
# Placeholder replacement
# ────────────────────────────────────────────────────────────────────────────

SUPPORTED_PLACEHOLDERS = [
    "user_name",
    "email",
    "company_name",
    "app_name",
    "support_email",
    "current_date",
]


def replace_placeholders(body: str, user: User | None = None, extra: dict[str, Any] | None = None) -> str:
    """Replace {{placeholder}} tokens in *body* with actual values.

    Args:
        body: The raw HTML / text body from the campaign or template.
        user: If provided, used to fill user-specific placeholders.
        extra: Additional key→value overrides (takes precedence over defaults).

    Returns:
        Body with all recognised placeholders replaced.
    """
    replacements: dict[str, str] = {
        "user_name": (user.full_name or user.email) if user else "",
        "email": user.email if user else "",
        "company_name": settings.PROJECT_NAME,
        "app_name": settings.PROJECT_NAME,
        "support_email": str(settings.EMAILS_FROM_EMAIL or "support@example.com"),
        "current_date": datetime.now(timezone.utc).strftime("%B %d, %Y"),
    }
    if extra:
        replacements.update(extra)

    for key, value in replacements.items():
        body = body.replace(f"{{{{{key}}}}}", str(value))

    return body


# ────────────────────────────────────────────────────────────────────────────
# Recipient resolution
# ────────────────────────────────────────────────────────────────────────────

def resolve_recipients(session: Session, filter_json: dict[str, Any]) -> list[User]:
    """Dynamically build a user query from *filter_json* and return matching users.

    Supported filter keys:
        all_users (bool)           – return all active users (ignores other filters)
        new_users_days (int)       – created within the last N days
        active_within_days (int)   – last_login_at within the last N days
        onboarding_completed (bool)– match onboarding_completed column
        active_only (bool)         – restrict to is_active=True (default True)
        superusers_only (bool)     – restrict to is_superuser=True
        selected_user_ids (list)   – always include these UUIDs (union)
    """
    now = datetime.now(timezone.utc)
    selected_ids: list[str] = filter_json.get("selected_user_ids", [])
    all_users: bool = filter_json.get("all_users", False)
    active_only: bool = filter_json.get("active_only", True)

    users_by_filter: list[User] = []

    if all_users:
        stmt = select(User)
        if active_only:
            stmt = stmt.where(User.is_active == True)  # noqa: E712
        users_by_filter = list(session.exec(stmt).all())
    else:
        conditions = []

        new_users_days: int | None = filter_json.get("new_users_days")
        if new_users_days is not None:
            since = now - timedelta(days=new_users_days)
            conditions.append(User.created_at >= since)

        active_within_days: int | None = filter_json.get("active_within_days")
        if active_within_days is not None:
            since = now - timedelta(days=active_within_days)
            conditions.append(User.last_login_at >= since)

        onboarding_completed: bool | None = filter_json.get("onboarding_completed")
        if onboarding_completed is not None:
            conditions.append(User.onboarding_completed == onboarding_completed)

        superusers_only: bool = filter_json.get("superusers_only", False)
        if superusers_only:
            conditions.append(User.is_superuser == True)  # noqa: E712

        if conditions:
            stmt = select(User).where(*conditions)
            if active_only:
                stmt = stmt.where(User.is_active == True)  # noqa: E712
            users_by_filter = list(session.exec(stmt).all())

    # Always include specifically selected users
    selected_users: list[User] = []
    if selected_ids:
        selected_uuids = []
        for uid in selected_ids:
            try:
                selected_uuids.append(uuid.UUID(uid))
            except ValueError:
                pass
        if selected_uuids:
            selected_users = list(
                session.exec(select(User).where(User.id.in_(selected_uuids))).all()  # type: ignore[attr-defined]
            )

    # Merge and deduplicate by email
    all_users_combined = {u.email: u for u in users_by_filter}
    for u in selected_users:
        all_users_combined[u.email] = u

    return list(all_users_combined.values())


def count_recipients(session: Session, filter_json: dict[str, Any]) -> int:
    """Return the count without loading full User objects."""
    return len(resolve_recipients(session, filter_json))


# ────────────────────────────────────────────────────────────────────────────
# Email rendering
# ────────────────────────────────────────────────────────────────────────────

def render_campaign_email(subject: str, body: str) -> EmailData:
    """Wrap *body* in the campaign_email.html structural template."""
    html_content = render_email_template(
        template_name="campaign_email.html",
        context={
            "subject": subject,
            "body_html": body,
            "project_name": settings.PROJECT_NAME,
            "support_email": str(settings.EMAILS_FROM_EMAIL or "support@example.com"),
        },
    )
    return EmailData(html_content=html_content, subject=subject)


# ────────────────────────────────────────────────────────────────────────────
# Campaign dispatch (background job)
# ────────────────────────────────────────────────────────────────────────────

BATCH_SIZE = 50
BATCH_DELAY_SECONDS = 0.1


def dispatch_campaign(campaign_id: str) -> None:
    """Send a campaign asynchronously.

    This function is called by the background scheduler; it creates its own
    DB session independently of the request session.
    """
    logger.info(f"[email_blast] Starting campaign dispatch: {campaign_id}")

    with Session(engine) as session:
        campaign = session.get(EmailCampaign, uuid.UUID(campaign_id))
        if not campaign:
            logger.error(f"[email_blast] Campaign not found: {campaign_id}")
            return

        if campaign.status not in ("draft", "failed"):
            logger.warning(
                f"[email_blast] Campaign {campaign_id} has status={campaign.status!r}, skipping."
            )
            return

        # ── Resolve recipients ──────────────────────────────────────────
        try:
            recipients = resolve_recipients(session, campaign.filter_json)
        except Exception as exc:
            logger.exception(f"[email_blast] Failed to resolve recipients for {campaign_id}: {exc}")
            campaign.status = "failed"
            session.add(campaign)
            session.commit()
            return

        if not recipients:
            logger.info(f"[email_blast] No recipients for campaign {campaign_id}. Marking completed.")
            campaign.status = "completed"
            campaign.recipient_count = 0
            campaign.sent_at = datetime.now(timezone.utc)
            session.add(campaign)
            session.commit()
            return

        # ── Create recipient rows ───────────────────────────────────────
        recipient_rows: list[EmailCampaignRecipient] = []
        for user in recipients:
            row = EmailCampaignRecipient(
                campaign_id=campaign.id,
                user_id=user.id,
                email=user.email,
                status="pending",
            )
            session.add(row)
            recipient_rows.append(row)

        campaign.status = "sending"
        campaign.recipient_count = len(recipients)
        session.add(campaign)
        session.commit()
        # Refresh to get generated IDs
        for row in recipient_rows:
            session.refresh(row)

        logger.info(f"[email_blast] Sending to {len(recipient_rows)} recipients.")

        # ── Send in batches ─────────────────────────────────────────────
        sent = 0
        failed = 0
        now = datetime.now(timezone.utc)

        for i in range(0, len(recipient_rows), BATCH_SIZE):
            batch = recipient_rows[i : i + BATCH_SIZE]
            for row in batch:
                # Find user for placeholder replacement
                user = next((u for u in recipients if u.email == row.email), None)
                personalised_body = replace_placeholders(campaign.body, user)
                email_data = render_campaign_email(campaign.subject, personalised_body)
                try:
                    send_email(
                        email_to=row.email,
                        subject=email_data.subject,
                        html_content=email_data.html_content,
                    )
                    row.status = "sent"
                    row.sent_at = now
                    sent += 1
                except Exception as exc:
                    row.status = "failed"
                    row.error_message = str(exc)[:500]
                    failed += 1
                    logger.warning(f"[email_blast] Failed to send to {row.email}: {exc}")
                session.add(row)

            session.commit()
            if i + BATCH_SIZE < len(recipient_rows):
                time.sleep(BATCH_DELAY_SECONDS)

        # ── Mark campaign completed ─────────────────────────────────────
        campaign.status = "completed"
        campaign.sent_at = datetime.now(timezone.utc)
        session.add(campaign)
        session.commit()

        logger.info(
            f"[email_blast] Campaign {campaign_id} done. sent={sent} failed={failed}"
        )
