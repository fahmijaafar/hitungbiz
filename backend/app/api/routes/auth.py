"""
Authentication helpers: email verification and resend.

POST /auth/verify-email       — public (token from email link)
POST /auth/resend-verification — requires authentication (JWT)
"""
from __future__ import annotations

import hashlib
import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, HTTPException, status
from sqlmodel import select

from app.api.deps import CurrentUser, SessionDep
from app.core.config import settings
from app.models import (
    EmailVerificationToken,
    Message,
    User,
    VerifyEmailRequest,
)
from app.utils import generate_verification_email, send_email

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])

# How long a verification token is valid
EMAIL_VERIFY_TOKEN_EXPIRE_HOURS = 24

# Minimum seconds between resend requests (simple DB-side cooldown)
RESEND_COOLDOWN_SECONDS = 60


def _hash_token(raw_token: str) -> str:
    """Return the SHA-256 hex digest of a raw token string."""
    return hashlib.sha256(raw_token.encode()).hexdigest()


def _create_verification_token(session: Any, user: User) -> str:
    """Generate a secure token, hash it, persist only the hash, and return the raw token."""
    raw_token = secrets.token_urlsafe(32)
    token_hash = _hash_token(raw_token)
    expires_at = datetime.now(timezone.utc) + timedelta(hours=EMAIL_VERIFY_TOKEN_EXPIRE_HOURS)

    db_token = EmailVerificationToken(
        user_id=user.id,
        token_hash=token_hash,
        expires_at=expires_at,
    )
    session.add(db_token)
    # Caller is responsible for committing.
    return raw_token


def _invalidate_active_tokens(session: Any, user: User) -> None:
    """Mark all unused/unexpired tokens for a user as used (invalidate them)."""
    now = datetime.now(timezone.utc)
    statement = (
        select(EmailVerificationToken)
        .where(
            EmailVerificationToken.user_id == user.id,
            EmailVerificationToken.used_at.is_(None),  # type: ignore[attr-defined]
            EmailVerificationToken.expires_at > now,
        )
    )
    active_tokens = session.exec(statement).all()
    for token in active_tokens:
        token.used_at = now
        session.add(token)


@router.post("/verify-email", response_model=Message)
def verify_email(session: SessionDep, body: VerifyEmailRequest) -> Any:
    """
    Verify a user's email address using the token received in their verification email.

    The raw token is hashed (SHA-256) before being looked up. The token must:
    - exist in the database
    - not have been used already
    - not have expired
    """
    token_hash = _hash_token(body.token)
    now = datetime.now(timezone.utc)

    statement = select(EmailVerificationToken).where(
        EmailVerificationToken.token_hash == token_hash
    )
    db_token = session.exec(statement).first()

    # Unified error for not-found / used / expired — avoids token enumeration
    if (
        db_token is None
        or db_token.used_at is not None
        or db_token.expires_at < now
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This verification link is invalid or has expired.",
        )

    user = session.get(User, db_token.user_id)
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This verification link is invalid or has expired.",
        )

    if user.email_verified:
        # Already verified — mark token as used and return success gracefully
        db_token.used_at = now
        session.add(db_token)
        session.commit()
        return Message(message="Email address already verified.")

    # Atomically verify the user and consume the token
    user.email_verified = True
    user.email_verified_at = now
    db_token.used_at = now
    session.add(user)
    session.add(db_token)
    session.commit()

    logger.info("User %s verified their email address.", user.id)
    return Message(message="Email verified successfully.")


@router.post("/resend-verification", response_model=Message)
def resend_verification(session: SessionDep, current_user: CurrentUser) -> Any:
    """
    Resend the verification email to the currently authenticated user.

    Requires a valid JWT. Rate-limited to one resend per 60 seconds.
    """
    if current_user.email_verified:
        return Message(message="Your email address is already verified.")

    now = datetime.now(timezone.utc)

    # Rate limiting: check whether a token was created within the cooldown window
    cooldown_start = now - timedelta(seconds=RESEND_COOLDOWN_SECONDS)
    recent_statement = (
        select(EmailVerificationToken)
        .where(
            EmailVerificationToken.user_id == current_user.id,
            EmailVerificationToken.created_at > cooldown_start,
        )
        .order_by(EmailVerificationToken.created_at.desc())  # type: ignore[attr-defined]
        .limit(1)
    )
    recent_token = session.exec(recent_statement).first()
    if recent_token:
        wait_seconds = int(
            (recent_token.created_at + timedelta(seconds=RESEND_COOLDOWN_SECONDS) - now).total_seconds()
        )
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Please wait {max(wait_seconds, 1)} second(s) before requesting another verification email.",
        )

    # Invalidate any previous active tokens
    _invalidate_active_tokens(session, current_user)

    # Generate a fresh token
    raw_token = _create_verification_token(session, current_user)
    session.commit()

    # Send verification email (best-effort; log on failure)
    if settings.emails_enabled:
        try:
            email_data = generate_verification_email(
                email_to=current_user.email,
                token=raw_token,
            )
            send_email(
                email_to=current_user.email,
                subject=email_data.subject,
                html_content=email_data.html_content,
            )
        except Exception:
            logger.exception(
                "Failed to send verification email to user %s", current_user.id
            )

    logger.info("Verification email resent for user %s.", current_user.id)
    return Message(message="Verification email sent. Please check your inbox.")
