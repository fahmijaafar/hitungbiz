import uuid
from datetime import date, datetime, time, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import col, func, or_, select

from app.api.deps import CurrentUser, SessionDep, get_current_active_superuser
from app.models import AuditLog, AuditLogPublic, AuditLogsPublic, Company, User

router = APIRouter(prefix="/admin/audit-logs", tags=["audit-logs"])


@router.get("", response_model=AuditLogsPublic, dependencies=[Depends(get_current_active_superuser)])
@router.get("/", response_model=AuditLogsPublic, dependencies=[Depends(get_current_active_superuser)])
def read_audit_logs(
    session: SessionDep,
    current_user: CurrentUser,
    company_id: uuid.UUID | None = None,
    user_id: uuid.UUID | None = None,
    module: str | None = None,
    action: str | None = None,
    table_name: str | None = None,
    record_id: str | None = None,
    keyword: str | None = None,
    start_date: datetime | date | None = None,
    end_date: datetime | date | None = None,
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=500),
) -> Any:
    """
    Retrieve audit logs with filtering and pagination. Super users only.
    """
    if not current_user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="The user doesn't have enough privileges",
        )

    # Base query
    statement = (
        select(AuditLog, User.email, User.full_name, Company.company_name)
        .outerjoin(User, col(AuditLog.user_id) == col(User.id))
        .outerjoin(Company, col(AuditLog.company_id) == col(Company.id))
    )

    count_statement = (
        select(func.count())
        .select_from(AuditLog)
        .outerjoin(User, col(AuditLog.user_id) == col(User.id))
        .outerjoin(Company, col(AuditLog.company_id) == col(Company.id))
    )

    conditions = []

    if company_id:
        conditions.append(col(AuditLog.company_id) == company_id)

    if user_id:
        conditions.append(col(AuditLog.user_id) == user_id)

    if module:
        conditions.append(col(AuditLog.module) == module)

    if action:
        conditions.append(col(AuditLog.action) == action)

    if table_name:
        conditions.append(col(AuditLog.table_name) == table_name)

    if record_id:
        conditions.append(col(AuditLog.record_id) == str(record_id))

    if start_date:
        if isinstance(start_date, date) and not isinstance(start_date, datetime):
            start_dt = datetime.combine(start_date, time.min, tzinfo=timezone.utc)
        else:
            start_dt = start_date
        conditions.append(col(AuditLog.created_at) >= start_dt)

    if end_date:
        if isinstance(end_date, date) and not isinstance(end_date, datetime):
            end_dt = datetime.combine(end_date, time.max, tzinfo=timezone.utc)
        else:
            end_dt = end_date
        conditions.append(col(AuditLog.created_at) <= end_dt)

    if keyword:
        kw = f"%{keyword}%"
        conditions.append(
            or_(
                col(AuditLog.description).ilike(kw),
                col(AuditLog.entity_name).ilike(kw),
                col(AuditLog.module).ilike(kw),
                col(AuditLog.action).ilike(kw),
                col(AuditLog.table_name).ilike(kw),
                col(AuditLog.record_id).ilike(kw),
                col(AuditLog.ip_address).ilike(kw),
                col(User.email).ilike(kw),
                col(User.full_name).ilike(kw),
                col(Company.company_name).ilike(kw),
            )
        )

    if conditions:
        for cond in conditions:
            statement = statement.where(cond)
            count_statement = count_statement.where(cond)

    # Count
    count = session.exec(count_statement).one()

    # Pagination & Sorting (Newest first)
    statement = statement.order_by(col(AuditLog.created_at).desc()).offset(skip).limit(limit)
    results = session.exec(statement).all()

    items = []
    for log_item, u_email, u_name, c_name in results:
        pub = AuditLogPublic.model_validate(log_item)
        pub.user_email = u_email
        pub.user_full_name = u_name
        pub.company_name = c_name
        items.append(pub)

    return AuditLogsPublic(data=items, count=count)


@router.get("/{id}", response_model=AuditLogPublic, dependencies=[Depends(get_current_active_superuser)])
def read_audit_log_by_id(
    id: int,
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    """
    Get audit log by ID. Super users only.
    """
    if not current_user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="The user doesn't have enough privileges",
        )

    statement = (
        select(AuditLog, User.email, User.full_name, Company.company_name)
        .outerjoin(User, col(AuditLog.user_id) == col(User.id))
        .outerjoin(Company, col(AuditLog.company_id) == col(Company.id))
        .where(col(AuditLog.id) == id)
    )
    result = session.exec(statement).first()

    if not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Audit log not found")

    log_item, u_email, u_name, c_name = result
    pub = AuditLogPublic.model_validate(log_item)
    pub.user_email = u_email
    pub.user_full_name = u_name
    pub.company_name = c_name
    return pub
