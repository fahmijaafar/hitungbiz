"""
Email Blasting API routes.

All endpoints require superuser privileges.
"""
from __future__ import annotations

import threading
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import col, func, or_, select

from app.api.deps import CurrentUser, SessionDep, VerifiedUser, get_current_active_superuser
from app.core.config import settings
from app.models import (
    EmailCampaign,
    EmailCampaignCreate,
    EmailCampaignPublic,
    EmailCampaignRecipient,
    EmailCampaignRecipientPublic,
    EmailCampaignRecipientsPublic,
    EmailCampaignsPublic,
    EmailCampaignUpdate,
    EmailTemplate,
    EmailTemplateCreate,
    EmailTemplatePublic,
    EmailTemplatesPublic,
    EmailTemplateUpdate,
    Message,
    RecipientCountResponse,
    RecipientFilter,
    SendTestEmailRequest,
    User,
    UserSearchResult,
    UserSearchResults,
)
from app.services.email_blast_service import (
    count_recipients,
    render_campaign_email,
    replace_placeholders,
)
from app.utils import send_email

router = APIRouter(
    prefix="/email-blasting",
    tags=["email-blasting"],
    dependencies=[Depends(get_current_active_superuser)],
)


# ─────────────────────────────────────────────────────────────────────────────
# Email Templates
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/templates", response_model=EmailTemplatesPublic)
def list_templates(
    session: SessionDep,
    skip: int = 0,
    limit: int = 100,
) -> Any:
    """List all email templates."""
    count = session.exec(select(func.count()).select_from(EmailTemplate)).one()
    templates = session.exec(
        select(EmailTemplate)
        .order_by(col(EmailTemplate.created_at).desc())
        .offset(skip)
        .limit(limit)
    ).all()
    return EmailTemplatesPublic(
        data=[EmailTemplatePublic.model_validate(t) for t in templates],
        count=count,
    )


@router.post("/templates", response_model=EmailTemplatePublic)
def create_template(
    *,
    session: SessionDep,
    current_user: VerifiedUser,
    template_in: EmailTemplateCreate,
) -> Any:
    """Create a new email template."""
    template = EmailTemplate.model_validate(
        template_in, update={"created_by": current_user.id}
    )
    session.add(template)
    session.commit()
    session.refresh(template)
    return template


@router.get("/templates/{template_id}", response_model=EmailTemplatePublic)
def get_template(template_id: uuid.UUID, session: SessionDep) -> Any:
    """Get a single email template."""
    template = session.get(EmailTemplate, template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    return template


@router.put("/templates/{template_id}", response_model=EmailTemplatePublic)
def update_template(
    *,
    template_id: uuid.UUID,
    session: SessionDep,
    template_in: EmailTemplateUpdate,
) -> Any:
    """Update an email template."""
    template = session.get(EmailTemplate, template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    update_data = template_in.model_dump(exclude_unset=True)
    update_data["updated_at"] = datetime.now(timezone.utc)
    template.sqlmodel_update(update_data)
    session.add(template)
    session.commit()
    session.refresh(template)
    return template


@router.delete("/templates/{template_id}", response_model=Message)
def delete_template(template_id: uuid.UUID, session: SessionDep) -> Any:
    """Delete an email template."""
    template = session.get(EmailTemplate, template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    session.delete(template)
    session.commit()
    return Message(message="Template deleted successfully")


@router.post("/templates/{template_id}/duplicate", response_model=EmailTemplatePublic)
def duplicate_template(
    *,
    template_id: uuid.UUID,
    session: SessionDep,
    current_user: VerifiedUser,
) -> Any:
    """Duplicate an email template."""
    original = session.get(EmailTemplate, template_id)
    if not original:
        raise HTTPException(status_code=404, detail="Template not found")
    duplicate = EmailTemplate(
        name=f"{original.name} (Copy)",
        description=original.description,
        subject=original.subject,
        body=original.body,
        created_by=current_user.id,
    )
    session.add(duplicate)
    session.commit()
    session.refresh(duplicate)
    return duplicate


# ─────────────────────────────────────────────────────────────────────────────
# Recipients
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/recipients/count", response_model=RecipientCountResponse)
def preview_recipient_count(
    *,
    session: SessionDep,
    filter_in: RecipientFilter,
) -> Any:
    """Return the number of users that match the given filters."""
    count = count_recipients(session, filter_in.model_dump())
    return RecipientCountResponse(count=count)


# ─────────────────────────────────────────────────────────────────────────────
# User Search
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/users/search", response_model=UserSearchResults)
def search_users(
    *,
    session: SessionDep,
    q: str = Query(default="", min_length=0),
    limit: int = Query(default=20, le=100),
) -> Any:
    """Search users by name or email for recipient selection."""
    stmt = select(User).where(User.is_active == True)  # noqa: E712
    if q:
        pattern = f"%{q}%"
        stmt = stmt.where(
            or_(
                col(User.email).ilike(pattern),
                col(User.full_name).ilike(pattern),
            )
        )
    stmt = stmt.order_by(col(User.full_name)).limit(limit)
    users = session.exec(stmt).all()
    return UserSearchResults(
        data=[
            UserSearchResult(id=u.id, full_name=u.full_name, email=u.email)
            for u in users
        ]
    )


# ─────────────────────────────────────────────────────────────────────────────
# Email Campaigns
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/campaigns", response_model=EmailCampaignPublic)
def create_campaign(
    *,
    session: SessionDep,
    current_user: VerifiedUser,
    campaign_in: EmailCampaignCreate,
) -> Any:
    """Create a new email campaign (status=draft)."""
    campaign = EmailCampaign(
        subject=campaign_in.subject,
        body=campaign_in.body,
        filter_json=campaign_in.filter_json,
        status="draft",
        created_by=current_user.id,
    )
    session.add(campaign)
    session.commit()
    session.refresh(campaign)
    return campaign


@router.get("/campaigns", response_model=EmailCampaignsPublic)
def list_campaigns(
    session: SessionDep,
    skip: int = 0,
    limit: int = 100,
) -> Any:
    """List all campaigns (newest first)."""
    count = session.exec(select(func.count()).select_from(EmailCampaign)).one()
    campaigns = session.exec(
        select(EmailCampaign)
        .order_by(col(EmailCampaign.created_at).desc())
        .offset(skip)
        .limit(limit)
    ).all()
    return EmailCampaignsPublic(
        data=[EmailCampaignPublic.model_validate(c) for c in campaigns],
        count=count,
    )


@router.get("/campaigns/{campaign_id}", response_model=EmailCampaignPublic)
def get_campaign(campaign_id: uuid.UUID, session: SessionDep) -> Any:
    """Get a single campaign."""
    campaign = session.get(EmailCampaign, campaign_id)
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    return campaign


@router.patch("/campaigns/{campaign_id}", response_model=EmailCampaignPublic)
def update_campaign(
    *,
    campaign_id: uuid.UUID,
    session: SessionDep,
    campaign_in: EmailCampaignUpdate,
) -> Any:
    """Update a draft campaign."""
    campaign = session.get(EmailCampaign, campaign_id)
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    if campaign.status not in ("draft", "failed"):
        raise HTTPException(
            status_code=400,
            detail="Only draft or failed campaigns can be edited.",
        )
    update_data = campaign_in.model_dump(exclude_unset=True)
    campaign.sqlmodel_update(update_data)
    session.add(campaign)
    session.commit()
    session.refresh(campaign)
    return campaign


@router.post("/campaigns/{campaign_id}/send", response_model=EmailCampaignPublic)
def send_campaign(
    *,
    campaign_id: uuid.UUID,
    session: SessionDep,
) -> Any:
    """Queue a campaign for sending (non-blocking)."""
    campaign = session.get(EmailCampaign, campaign_id)
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    if campaign.status not in ("draft", "failed"):
        raise HTTPException(
            status_code=400,
            detail=f"Campaign cannot be sent from status '{campaign.status}'.",
        )

    # Dispatch in a background thread so the HTTP response returns immediately
    from app.services.email_blast_service import dispatch_campaign

    thread = threading.Thread(
        target=dispatch_campaign,
        args=(str(campaign.id),),
        daemon=True,
    )
    thread.start()

    # Optimistically update status
    campaign.status = "sending"
    session.add(campaign)
    session.commit()
    session.refresh(campaign)
    return campaign


@router.post("/campaigns/{campaign_id}/duplicate", response_model=EmailCampaignPublic)
def duplicate_campaign(
    *,
    campaign_id: uuid.UUID,
    session: SessionDep,
    current_user: VerifiedUser,
) -> Any:
    """Duplicate a campaign as a new draft."""
    original = session.get(EmailCampaign, campaign_id)
    if not original:
        raise HTTPException(status_code=404, detail="Campaign not found")
    duplicate = EmailCampaign(
        subject=original.subject,
        body=original.body,
        filter_json=original.filter_json,
        status="draft",
        created_by=current_user.id,
    )
    session.add(duplicate)
    session.commit()
    session.refresh(duplicate)
    return duplicate


@router.get("/campaigns/{campaign_id}/recipients", response_model=EmailCampaignRecipientsPublic)
def list_campaign_recipients(
    *,
    campaign_id: uuid.UUID,
    session: SessionDep,
    skip: int = 0,
    limit: int = 100,
    status: str | None = None,
) -> Any:
    """List recipients for a campaign, optionally filtered by status."""
    campaign = session.get(EmailCampaign, campaign_id)
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")

    stmt = select(EmailCampaignRecipient).where(
        EmailCampaignRecipient.campaign_id == campaign_id
    )
    if status:
        stmt = stmt.where(EmailCampaignRecipient.status == status)
    count_stmt = select(func.count()).select_from(
        stmt.subquery()  # type: ignore[arg-type]
    )
    count = session.exec(count_stmt).one()
    rows = session.exec(stmt.offset(skip).limit(limit)).all()
    return EmailCampaignRecipientsPublic(
        data=[EmailCampaignRecipientPublic.model_validate(r) for r in rows],
        count=count,
    )


# ─────────────────────────────────────────────────────────────────────────────
# Test email
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/test-email", response_model=Message)
def send_test_email(
    *,
    body_in: SendTestEmailRequest,
    current_user: VerifiedUser,
) -> Any:
    """Send a test email to any address (renders with current user's data)."""
    if not settings.emails_enabled:
        raise HTTPException(
            status_code=503,
            detail="Email sending is not configured on this server.",
        )
    personalised_body = replace_placeholders(body_in.body, current_user)
    email_data = render_campaign_email(body_in.subject, personalised_body)
    send_email(
        email_to=body_in.email_to,
        subject=f"[TEST] {email_data.subject}",
        html_content=email_data.html_content,
    )
    return Message(message=f"Test email sent to {body_in.email_to}")
