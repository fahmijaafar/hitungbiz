import json
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlmodel import col, func, select

from app import crud
from app.api.deps import (
    CurrentUser,
    SessionDep,
    get_current_active_superuser,
)
from app.core.config import settings
from app.core.security import get_password_hash, verify_password
from app.services.audit_logger import AuditAction, AuditLogger, AuditModule
from app.services.subscription_service import activate_subscription, get_current_subscription
from app.models import (
    Company,
    Message,
    UpdatePassword,
    User,
    UserCreate,
    UserPublic,
    UserRegister,
    UsersPublic,
    UserUpdate,
    UserUpdateMe,
)
from app.utils import generate_new_account_email, generate_verification_email, send_email

router = APIRouter(prefix="/users", tags=["users"])


def _build_user_public(session: SessionDep, user: User) -> UserPublic:
    sub = get_current_subscription(session, user.id)
    user_dict = user.model_dump()
    user_dict["plan"] = sub.plan if sub else "personal"
    user_dict["billing_period"] = sub.billing_period if sub else None
    return UserPublic.model_validate(user_dict)


@router.get(
    "/",
    dependencies=[Depends(get_current_active_superuser)],
    response_model=UsersPublic,
)
def read_users(session: SessionDep, skip: int = 0, limit: int = 100) -> Any:
    """
    Retrieve users.
    """

    count_statement = select(func.count()).select_from(User)
    count = session.exec(count_statement).one()

    statement = (
        select(User).order_by(col(User.created_at).desc()).offset(skip).limit(limit)
    )
    users = session.exec(statement).all()

    users_public = [_build_user_public(session, user) for user in users]
    return UsersPublic(data=users_public, count=count)


@router.post(
    "/", dependencies=[Depends(get_current_active_superuser)], response_model=UserPublic
)
def create_user(*, session: SessionDep, current_user: CurrentUser, user_in: UserCreate, request: Request) -> Any:
    """
    Create new user.
    """
    user = crud.get_user_by_email(session=session, email=user_in.email)
    if user:
        raise HTTPException(
            status_code=400,
            detail="The user with this email already exists in the system.",
        )

    user = crud.create_user(session=session, user_create=user_in)

    AuditLogger.log(
        session,
        company_id=user.company_id,
        user_id=current_user.id,
        module=AuditModule.ADMIN,
        table_name="user",
        record_id=user.id,
        action=AuditAction.CREATE,
        entity_name=user.email,
        description=f"Created User {user.email}",
        new_data=user,
        request=request,
    )

    if settings.emails_enabled and user_in.email:
        email_data = generate_new_account_email(
            email_to=user_in.email, username=user_in.email, password=user_in.password
        )
        send_email(
            email_to=user_in.email,
            subject=email_data.subject,
            html_content=email_data.html_content,
        )
    return user


@router.patch("/me", response_model=UserPublic)
def update_user_me(
    *, session: SessionDep, user_in: UserUpdateMe, current_user: CurrentUser, request: Request
) -> Any:
    """
    Update own user.
    """

    if user_in.email:
        existing_user = crud.get_user_by_email(session=session, email=user_in.email)
        if existing_user and existing_user.id != current_user.id:
            raise HTTPException(
                status_code=409, detail="User with this email already exists"
            )
    user_data = user_in.model_dump(exclude_unset=True)

    # If company_id is being set, verify it exists and is active, then add to companies array
    if "company_id" in user_data and user_data["company_id"] is not None:
        company = session.get(Company, user_data["company_id"])
        if not company or not company.is_active:
            raise HTTPException(status_code=404, detail="Company not found")

        try:
            company_ids = json.loads(current_user.companies or "[]")
        except json.JSONDecodeError:
            company_ids = []

        if not isinstance(company_ids, list):
            company_ids = []

        if not current_user.is_superuser:
            company_id_str = str(user_data["company_id"])
            if company_id_str not in company_ids:
                company_ids.append(company_id_str)

            current_user.companies = json.dumps(company_ids)

    old_user_dict = current_user.model_dump(mode="json")
    current_user.sqlmodel_update(user_data)
    session.add(current_user)
    session.commit()
    session.refresh(current_user)

    AuditLogger.log(
        session,
        company_id=current_user.company_id,
        user_id=current_user.id,
        module=AuditModule.SETTINGS,
        table_name="user",
        record_id=current_user.id,
        action=AuditAction.UPDATE,
        entity_name=current_user.email,
        description=f"Updated User Profile {current_user.email}",
        old_data=old_user_dict,
        new_data=current_user,
        request=request,
    )

    return current_user


@router.patch("/me/password", response_model=Message)
def update_password_me(
    *, session: SessionDep, body: UpdatePassword, current_user: CurrentUser, request: Request
) -> Any:
    """
    Update own password.
    """
    verified, _ = verify_password(body.current_password, current_user.hashed_password)
    if not verified:
        raise HTTPException(status_code=400, detail="Incorrect password")
    if body.current_password == body.new_password:
        raise HTTPException(
            status_code=400, detail="New password cannot be the same as the current one"
        )
    hashed_password = get_password_hash(body.new_password)
    current_user.hashed_password = hashed_password
    session.add(current_user)
    session.commit()

    AuditLogger.log(
        session,
        company_id=current_user.company_id,
        user_id=current_user.id,
        module=AuditModule.SETTINGS,
        table_name="user",
        record_id=current_user.id,
        action=AuditAction.UPDATE,
        entity_name=current_user.email,
        description=f"Updated Password for {current_user.email}",
        request=request,
    )

    return Message(message="Password updated successfully")


@router.get("/me", response_model=UserPublic)
def read_user_me(current_user: CurrentUser) -> Any:
    """
    Get current user.
    """
    return current_user


@router.delete("/me", response_model=Message)
def delete_user_me(session: SessionDep, current_user: CurrentUser, request: Request) -> Any:
    """
    Delete own user.
    """
    if current_user.is_superuser:
        raise HTTPException(
            status_code=403, detail="Super users are not allowed to delete themselves"
        )
    old_user_dict = current_user.model_dump(mode="json")
    session.delete(current_user)
    session.commit()

    AuditLogger.log(
        session,
        company_id=current_user.company_id,
        user_id=current_user.id,
        module=AuditModule.SETTINGS,
        table_name="user",
        record_id=current_user.id,
        action=AuditAction.DELETE,
        entity_name=current_user.email,
        description=f"Deleted Account {current_user.email}",
        old_data=old_user_dict,
        request=request,
    )

    return Message(message="User deleted successfully")


@router.post("/signup", response_model=UserPublic)
def register_user(session: SessionDep, user_in: UserRegister, request: Request) -> Any:
    """
    Create new user without the need to be logged in.
    """
    import hashlib
    import secrets
    from datetime import datetime, timedelta, timezone

    from app.models import EmailVerificationToken

    user = crud.get_user_by_email(session=session, email=user_in.email)
    if user:
        raise HTTPException(
            status_code=400,
            detail="The user with this email already exists in the system",
        )
    user_create = UserCreate.model_validate(user_in)
    user = crud.create_user(session=session, user_create=user_create)

    # Generate and store a verification token (hash only — raw token goes to email)
    raw_token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
    expires_at = datetime.now(timezone.utc) + timedelta(hours=24)
    db_token = EmailVerificationToken(
        user_id=user.id,
        token_hash=token_hash,
        expires_at=expires_at,
    )
    session.add(db_token)
    session.commit()

    AuditLogger.log(
        session,
        company_id=user.company_id,
        user_id=user.id,
        module=AuditModule.AUTHENTICATION,
        table_name="user",
        record_id=user.id,
        action=AuditAction.CREATE,
        entity_name=user.email,
        description=f"User Self-Registered {user.email}",
        new_data=user,
        request=request,
    )

    # Send verification email (best-effort)
    if settings.emails_enabled:
        try:
            email_data = generate_verification_email(
                email_to=user.email,
                token=raw_token,
            )
            send_email(
                email_to=user.email,
                subject=email_data.subject,
                html_content=email_data.html_content,
            )
        except Exception:
            import logging
            logging.getLogger(__name__).exception(
                "Failed to send verification email for new user %s", user.id
            )

    return user


@router.get("/{user_id}", response_model=UserPublic)
def read_user_by_id(
    user_id: uuid.UUID, session: SessionDep, current_user: CurrentUser
) -> Any:
    """
    Get a specific user by id.
    """
    user = session.get(User, user_id)
    if user == current_user:
        return _build_user_public(session, user)
    if not current_user.is_superuser:
        raise HTTPException(
            status_code=403,
            detail="The user doesn't have enough privileges",
        )
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return _build_user_public(session, user)


@router.patch(
    "/{user_id}",
    dependencies=[Depends(get_current_active_superuser)],
    response_model=UserPublic,
)
def update_user(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    user_id: uuid.UUID,
    user_in: UserUpdate,
    request: Request,
) -> Any:
    """
    Update a user.
    """

    db_user = session.get(User, user_id)
    if not db_user:
        raise HTTPException(
            status_code=404,
            detail="The user with this id does not exist in the system",
        )
    if user_in.email:
        existing_user = crud.get_user_by_email(session=session, email=user_in.email)
        if existing_user and existing_user.id != user_id:
            raise HTTPException(
                status_code=409, detail="User with this email already exists"
            )

    old_user_dict = db_user.model_dump(mode="json")
    db_user = crud.update_user(session=session, db_user=db_user, user_in=user_in)

    # Handle subscription update if plan is provided by superuser
    if user_in.plan is not None:
        if user_in.plan not in ("personal", "pro", "max"):
            raise HTTPException(
                status_code=400,
                detail="Invalid plan. Must be 'personal', 'pro', or 'max'.",
            )
        if user_in.plan in ("pro", "max") and user_in.billing_period not in ("monthly", "yearly"):
            raise HTTPException(
                status_code=400,
                detail="Paid plans require billing_period to be 'monthly' or 'yearly'.",
            )
        activate_subscription(
            session=session,
            user_id=db_user.id,
            plan=user_in.plan,
            billing_period=user_in.billing_period if user_in.plan != "personal" else None,
        )
        session.commit()

    # Ensure the company ID in companies array if company_id is set
    if db_user.company_id and not db_user.is_superuser:
        company = session.get(Company, db_user.company_id)
        if not company or not company.is_active:
            raise HTTPException(status_code=404, detail="Company not found")

        try:
            company_ids = json.loads(db_user.companies or "[]")
        except json.JSONDecodeError:
            company_ids = []

        if not isinstance(company_ids, list):
            company_ids = []

        company_id_str = str(db_user.company_id)
        if company_id_str not in company_ids:
            company_ids.append(company_id_str)

        db_user.companies = json.dumps(company_ids)
        session.add(db_user)
        session.commit()
        session.refresh(db_user)

    AuditLogger.log(
        session,
        company_id=db_user.company_id,
        user_id=current_user.id,
        module=AuditModule.ADMIN,
        table_name="user",
        record_id=db_user.id,
        action=AuditAction.UPDATE,
        entity_name=db_user.email,
        description=f"Updated User Role / Details / Subscription for {db_user.email}",
        old_data=old_user_dict,
        new_data=db_user,
        request=request,
    )

    return _build_user_public(session, db_user)


@router.delete("/{user_id}", dependencies=[Depends(get_current_active_superuser)])
def delete_user(
    session: SessionDep, current_user: CurrentUser, user_id: uuid.UUID, request: Request
) -> Message:
    """
    Delete a user.
    """
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user == current_user:
        raise HTTPException(
            status_code=403, detail="Super users are not allowed to delete themselves"
        )
    old_user_dict = user.model_dump(mode="json")
    session.delete(user)
    session.commit()

    AuditLogger.log(
        session,
        company_id=user.company_id,
        user_id=current_user.id,
        module=AuditModule.ADMIN,
        table_name="user",
        record_id=user.id,
        action=AuditAction.DELETE,
        entity_name=user.email,
        description=f"Deleted User {user.email}",
        old_data=old_user_dict,
        request=request,
    )

    return Message(message="User deleted successfully")

