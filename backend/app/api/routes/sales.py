import uuid
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from sqlmodel import col, func, select

from app.api.deps import CurrentUser, SessionDep, VerifiedUser
from app.models import (
    Message,
    Sale,
    SaleCreate,
    SalePublic,
    SalesChannelsPublic,
    SalesPublic,
    SaleUpdate,
)
from app.services.audit_logger import AuditAction, AuditLogger, AuditModule

router = APIRouter(prefix="/sales", tags=["sales"])


@router.get("/", response_model=SalesPublic)
def read_sales(
    session: SessionDep,
    current_user: VerifiedUser,
    skip: int = 0,
    limit: int = 100,
    company_id: uuid.UUID | None = None,
) -> Any:
    """
    Retrieve sales. Filter by company_id if provided, otherwise use current user's company.
    """
    # Use provided company_id, or fall back to the current user's company_id
    active_company_id = company_id or current_user.company_id

    if active_company_id:
        count_statement = (
            select(func.count())
            .select_from(Sale)
            .where(Sale.company_id == active_company_id)
        )
        count = session.exec(count_statement).one()
        statement = (
            select(Sale)
            .where(Sale.company_id == active_company_id)
            .order_by(col(Sale.date).desc())
            .offset(skip)
            .limit(limit)
        )
    else:
        count_statement = select(func.count()).select_from(Sale)
        count = session.exec(count_statement).one()
        statement = select(Sale).order_by(col(Sale.date).desc()).offset(skip).limit(limit)

    sales = session.exec(statement).all()
    sales_public = [SalePublic.model_validate(sale) for sale in sales]
    return SalesPublic(data=sales_public, count=count)


@router.get("/channels", response_model=SalesChannelsPublic)
def read_sales_channels(
    session: SessionDep,
    current_user: VerifiedUser,
    company_id: uuid.UUID | None = None,
) -> SalesChannelsPublic:
    """
    Retrieve distinct revenue channels for the active company.
    """
    active_company_id = company_id or current_user.company_id
    statement = select(Sale.channel).where(Sale.channel != "").distinct()
    if active_company_id:
        statement = statement.where(Sale.company_id == active_company_id)
    seen: dict[str, str] = {}
    for raw_channel in session.exec(statement).all():
        if not raw_channel:
            continue
        trimmed = str(raw_channel).strip()
        if not trimmed:
            continue
        key = trimmed.lower()
        if key not in seen:
            seen[key] = trimmed
        elif not trimmed.islower() and seen[key].islower():
            seen[key] = trimmed

    channels = sorted(seen.values(), key=str.lower)
    return SalesChannelsPublic(data=channels)


@router.get("/{id}", response_model=SalePublic)
def read_sale(session: SessionDep, _current_user: VerifiedUser, id: uuid.UUID) -> Any:
    """
    Get sale by ID.
    """
    sale = session.get(Sale, id)
    if not sale:
        raise HTTPException(status_code=404, detail="Sale not found")
    return sale


@router.post("/", response_model=SalePublic)
def create_sale(
    *, session: SessionDep, current_user: VerifiedUser, sale_in: SaleCreate, request: Request
) -> Any:
    """
    Create new sale.
    """
    if sale_in.channel:
        sale_in.channel = sale_in.channel.strip()
    sale = Sale.model_validate(
        sale_in,
        update={
            "user_id": current_user.id,
            "company_id": current_user.company_id,
        },
    )
    session.add(sale)
    session.commit()
    session.refresh(sale)

    entity_label = sale.channel or f"Revenue Entry #{str(sale.id)[:8]}"
    AuditLogger.log(
        session,
        company_id=sale.company_id,
        user_id=current_user.id,
        module=AuditModule.REVENUE,
        table_name="sale",
        record_id=sale.id,
        action=AuditAction.CREATE,
        entity_name=entity_label,
        description=f"Created Revenue Entry {entity_label}",
        new_data=sale,
        request=request,
    )

    return sale


@router.put("/{id}", response_model=SalePublic)
def update_sale(
    *, session: SessionDep, current_user: VerifiedUser, id: uuid.UUID, sale_in: SaleUpdate, request: Request
) -> Any:
    """
    Update a sale.
    """
    sale = session.get(Sale, id)
    if not sale:
        raise HTTPException(status_code=404, detail="Sale not found")
    old_sale_dict = sale.model_dump(mode="json")
    if sale_in.channel is not None:
        sale_in.channel = sale_in.channel.strip()
    update_dict = sale_in.model_dump(exclude_unset=True)
    sale.sqlmodel_update(update_dict)
    session.add(sale)
    session.commit()
    session.refresh(sale)

    entity_label = sale.channel or f"Revenue Entry #{str(sale.id)[:8]}"
    AuditLogger.log(
        session,
        company_id=sale.company_id,
        user_id=current_user.id,
        module=AuditModule.REVENUE,
        table_name="sale",
        record_id=sale.id,
        action=AuditAction.UPDATE,
        entity_name=entity_label,
        description=f"Updated Revenue Entry {entity_label}",
        old_data=old_sale_dict,
        new_data=sale,
        request=request,
    )

    return sale


@router.delete("/{id}")
def delete_sale(session: SessionDep, current_user: VerifiedUser, id: uuid.UUID, request: Request) -> Message:
    """
    Delete a sale.
    """
    sale = session.get(Sale, id)
    if not sale:
        raise HTTPException(status_code=404, detail="Sale not found")
    old_sale_dict = sale.model_dump(mode="json")
    entity_label = sale.channel or f"Revenue Entry #{str(sale.id)[:8]}"
    session.delete(sale)
    session.commit()

    AuditLogger.log(
        session,
        company_id=sale.company_id,
        user_id=current_user.id,
        module=AuditModule.REVENUE,
        table_name="sale",
        record_id=sale.id,
        action=AuditAction.DELETE,
        entity_name=entity_label,
        description=f"Deleted Revenue Entry {entity_label}",
        old_data=old_sale_dict,
        request=request,
    )

    return Message(message="Sale deleted successfully")
