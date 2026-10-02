import uuid
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from sqlmodel import func, select

from app.api.deps import CurrentUser, SessionDep, VerifiedUser
from app.models import (
    Message,
    Purchase,
    PurchaseCreate,
    PurchasePublic,
    PurchasesPublic,
    PurchasesSuppliersPublic,
    PurchaseUpdate,
)
from app.services.audit_logger import AuditAction, AuditLogger, AuditModule

router = APIRouter(prefix="/purchases", tags=["purchases"])


@router.get("/", response_model=PurchasesPublic)
def read_purchases(
    session: SessionDep,
    current_user: VerifiedUser,
    skip: int = 0,
    limit: int = 100,
    company_id: uuid.UUID | None = None,
) -> Any:
    """
    Retrieve purchases. Filter by company_id if provided, otherwise use current user's company.
    """
    # Use provided company_id, or fall back to the current user's company_id
    active_company_id = company_id or current_user.company_id

    if active_company_id:
        count_statement = (
            select(func.count())
            .select_from(Purchase)
            .where(Purchase.company_id == active_company_id)
        )
        count = session.exec(count_statement).one()
        statement = (
            select(Purchase)
            .where(Purchase.company_id == active_company_id)
            .order_by(Purchase.date.desc())
            .offset(skip)
            .limit(limit)
        )
    else:
        count_statement = select(func.count()).select_from(Purchase)
        count = session.exec(count_statement).one()
        statement = select(Purchase).order_by(Purchase.date.desc()).offset(skip).limit(limit)

    purchases = session.exec(statement).all()
    purchases_public = [PurchasePublic.model_validate(purchase) for purchase in purchases]
    return PurchasesPublic(data=purchases_public, count=count)


@router.get("/suppliers", response_model=PurchasesSuppliersPublic)
def read_purchases_suppliers(
    session: SessionDep,
    current_user: VerifiedUser,
    company_id: uuid.UUID | None = None,
) -> PurchasesSuppliersPublic:
    """
    Retrieve distinct expense suppliers for the active company.
    """
    active_company_id = company_id or current_user.company_id
    statement = (
        select(Purchase.supplier_name)
        .where(Purchase.supplier_name != "")
        .distinct()
    )
    if active_company_id:
        statement = statement.where(Purchase.company_id == active_company_id)

    seen: dict[str, str] = {}
    for raw_supplier in session.exec(statement).all():
        if not raw_supplier:
            continue
        trimmed = str(raw_supplier).strip()
        if not trimmed:
            continue
        key = trimmed.lower()
        if key not in seen:
            seen[key] = trimmed
        elif not trimmed.islower() and seen[key].islower():
            seen[key] = trimmed

    suppliers = sorted(seen.values(), key=str.lower)
    return PurchasesSuppliersPublic(data=suppliers)


@router.get("/{id}", response_model=PurchasePublic)
def read_purchase(
    session: SessionDep, _current_user: VerifiedUser, id: uuid.UUID
) -> Any:
    """
    Get purchase by ID.
    """
    purchase = session.get(Purchase, id)
    if not purchase:
        raise HTTPException(status_code=404, detail="Purchase not found")
    return purchase


@router.post("/", response_model=PurchasePublic)
def create_purchase(
    *, session: SessionDep, current_user: VerifiedUser, purchase_in: PurchaseCreate, request: Request
) -> Any:
    """
    Create new purchase.
    """
    if purchase_in.supplier_name:
        purchase_in.supplier_name = purchase_in.supplier_name.strip()
    purchase = Purchase.model_validate(
        purchase_in,
        update={
            "user_id": current_user.id,
            "company_id": current_user.company_id,
        },
    )
    session.add(purchase)
    session.commit()
    session.refresh(purchase)

    entity_label = purchase.supplier_name or f"Expense Entry #{str(purchase.id)[:8]}"
    AuditLogger.log(
        session,
        company_id=purchase.company_id,
        user_id=current_user.id,
        module=AuditModule.EXPENSES,
        table_name="purchase",
        record_id=purchase.id,
        action=AuditAction.CREATE,
        entity_name=entity_label,
        description=f"Created Expense Entry {entity_label}",
        new_data=purchase,
        request=request,
    )

    return purchase


@router.put("/{id}", response_model=PurchasePublic)
def update_purchase(
    *,
    session: SessionDep,
    current_user: VerifiedUser,
    id: uuid.UUID,
    purchase_in: PurchaseUpdate,
    request: Request,
) -> Any:
    """
    Update a purchase.
    """
    purchase = session.get(Purchase, id)
    if not purchase:
        raise HTTPException(status_code=404, detail="Purchase not found")
    old_purchase_dict = purchase.model_dump(mode="json")
    if purchase_in.supplier_name is not None:
        purchase_in.supplier_name = purchase_in.supplier_name.strip()
    update_dict = purchase_in.model_dump(exclude_unset=True)
    purchase.sqlmodel_update(update_dict)
    session.add(purchase)
    session.commit()
    session.refresh(purchase)

    entity_label = purchase.supplier_name or f"Expense Entry #{str(purchase.id)[:8]}"
    AuditLogger.log(
        session,
        company_id=purchase.company_id,
        user_id=current_user.id,
        module=AuditModule.EXPENSES,
        table_name="purchase",
        record_id=purchase.id,
        action=AuditAction.UPDATE,
        entity_name=entity_label,
        description=f"Updated Expense Entry {entity_label}",
        old_data=old_purchase_dict,
        new_data=purchase,
        request=request,
    )

    return purchase


@router.delete("/{id}")
def delete_purchase(
    session: SessionDep, current_user: VerifiedUser, id: uuid.UUID, request: Request
) -> Message:
    """
    Delete a purchase.
    """
    purchase = session.get(Purchase, id)
    if not purchase:
        raise HTTPException(status_code=404, detail="Purchase not found")
    old_purchase_dict = purchase.model_dump(mode="json")
    entity_label = purchase.supplier_name or f"Expense Entry #{str(purchase.id)[:8]}"
    session.delete(purchase)
    session.commit()

    AuditLogger.log(
        session,
        company_id=purchase.company_id,
        user_id=current_user.id,
        module=AuditModule.EXPENSES,
        table_name="purchase",
        record_id=purchase.id,
        action=AuditAction.DELETE,
        entity_name=entity_label,
        description=f"Deleted Expense Entry {entity_label}",
        old_data=old_purchase_dict,
        request=request,
    )

    return Message(message="Purchase deleted successfully")
