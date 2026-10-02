from datetime import timedelta, timezone, datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse
from fastapi.security import OAuth2PasswordRequestForm

from app import crud
from app.api.deps import CurrentUser, SessionDep, get_current_active_superuser
from app.core import security
from app.core.config import settings
from app.core.rate_limiter import check_tier1_public_limit, get_client_ip, limiter
from app.models import Message, NewPassword, Token, UserPublic, UserUpdate
from app.services.audit_logger import AuditAction, AuditLogger, AuditModule
from app.utils import (
    generate_password_reset_token,
    generate_reset_password_email,
    send_email,
    verify_password_reset_token,
)

router = APIRouter(tags=["login"])


@router.post("/login/access-token", dependencies=[Depends(check_tier1_public_limit)])
def login_access_token(
    session: SessionDep,
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
    request: Request,
) -> Token:
    """
    OAuth2 compatible token login, get an access token for future requests
    """
    client_ip = get_client_ip(request)
    user = crud.authenticate(
        session=session, email=form_data.username, password=form_data.password
    )
    if not user:
        limiter.record_login_failure(client_ip)
        AuditLogger.log(
            session,
            module=AuditModule.AUTHENTICATION,
            table_name="user",
            action=AuditAction.LOGIN,
            description=f"Failed Login Attempt for {form_data.username}",
            metadata={"email": form_data.username, "status": "failed"},
            request=request,
        )
        raise HTTPException(status_code=400, detail="Incorrect email or password")
    elif not user.is_active:
        AuditLogger.log(
            session,
            user_id=user.id,
            company_id=user.company_id,
            module=AuditModule.AUTHENTICATION,
            table_name="user",
            record_id=user.id,
            action=AuditAction.LOGIN,
            entity_name=user.email,
            description=f"Failed Login Attempt (Inactive User) for {user.email}",
            metadata={"email": user.email, "status": "inactive"},
            request=request,
        )
        raise HTTPException(status_code=400, detail="Inactive user")

    # Track last login timestamp
    user.last_login_at = datetime.now(timezone.utc)
    session.add(user)
    session.commit()

    AuditLogger.log(
        session,
        company_id=user.company_id,
        user_id=user.id,
        module=AuditModule.AUTHENTICATION,
        table_name="user",
        record_id=user.id,
        action=AuditAction.LOGIN,
        entity_name=user.email,
        description=f"Successful Login for {user.email}",
        request=request,
    )

    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    return Token(
        access_token=security.create_access_token(
            user.id, expires_delta=access_token_expires
        )
    )


@router.post("/login/test-token", response_model=UserPublic)
def test_token(current_user: CurrentUser) -> Any:
    """
    Test access token
    """
    return current_user


@router.post("/password-recovery/{email}")
def recover_password(email: str, session: SessionDep) -> Message:
    """
    Password Recovery
    """
    user = crud.get_user_by_email(session=session, email=email)

    # Always return the same response to prevent email enumeration attacks
    # Only send email if user actually exists
    if user:
        password_reset_token = generate_password_reset_token(email=email)
        email_data = generate_reset_password_email(
            email_to=user.email, email=email, token=password_reset_token
        )
        send_email(
            email_to=user.email,
            subject=email_data.subject,
            html_content=email_data.html_content,
        )
    return Message(
        message="If that email is registered, we sent a password recovery link"
    )


@router.post("/reset-password/")
def reset_password(session: SessionDep, body: NewPassword) -> Message:
    """
    Reset password
    """
    email = verify_password_reset_token(token=body.token)
    if not email:
        raise HTTPException(status_code=400, detail="Invalid token")
    user = crud.get_user_by_email(session=session, email=email)
    if not user:
        # Don't reveal that the user doesn't exist - use same error as invalid token
        raise HTTPException(status_code=400, detail="Invalid token")
    elif not user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    user_in_update = UserUpdate(password=body.new_password)
    crud.update_user(
        session=session,
        db_user=user,
        user_in=user_in_update,
    )
    return Message(message="Password updated successfully")


@router.post(
    "/password-recovery-html-content/{email}",
    dependencies=[Depends(get_current_active_superuser)],
    response_class=HTMLResponse,
)
def recover_password_html_content(email: str, session: SessionDep) -> Any:
    """
    HTML Content for Password Recovery
    """
    user = crud.get_user_by_email(session=session, email=email)

    if not user:
        raise HTTPException(
            status_code=404,
            detail="The user with this username does not exist in the system.",
        )
    password_reset_token = generate_password_reset_token(email=email)
    email_data = generate_reset_password_email(
        email_to=user.email, email=email, token=password_reset_token
    )

    return HTMLResponse(
        content=email_data.html_content, headers={"subject:": email_data.subject}
    )
