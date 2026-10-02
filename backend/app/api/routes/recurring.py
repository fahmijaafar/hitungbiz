from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, HTTPException, Query, Request
from sqlmodel import Session, select

from app.api.deps import CurrentUser, SessionDep, VerifiedUser
from app.models import (
    Client,
    Company,
    Message,
    RecurringConfig,
    RecurringConfigPublic,
    RecurringDoc,
    RecurringDocPublic,
    RecurringScheduleCreate,
    RecurringScheduleUpdate,
    User,
)
from app.services.audit_logger import AuditAction, AuditLogger, AuditModule
from app.services.entitlement_service import (
    LimitReachedException,
    check_entitlement,
    limit_reached_detail,
)
from app.services.recurring_service import (
    create_recurring_schedule,
    delete_recurring_schedule,
    generate_recurring_schedule,
    pause_recurring_schedule,
    resume_recurring_schedule,
    update_recurring_schedule,
)

router = APIRouter(prefix="/recurring", tags=["recurring"])


def _get_company(session: Session, current_user: User) -> Company | None:
    if current_user.company_id:
        return session.get(Company, current_user.company_id)
    return None


def _template_customer_name(template: RecurringDoc | None, client: Client | None) -> str | None:
    if client:
        return client.name
    if not template or not isinstance(template.price_calculation, dict):
        return None
    client_details = template.price_calculation.get("client_details")
    if not isinstance(client_details, dict):
        return None
    name = client_details.get("name")
    return name.strip() if isinstance(name, str) and name.strip() else None


@router.get("/", response_model=dict[str, Any])
def read_recurring_configs(
    session: SessionDep,
    current_user: VerifiedUser,
    company_id: uuid.UUID | None = Query(None),
) -> Any:
    company = _get_company(session, current_user)
    cid = company_id or (company.id if company else None)
    statement = select(RecurringConfig)
    if cid:
        statement = statement.where(RecurringConfig.company_id == cid)
    statement = statement.order_by(RecurringConfig.created_at.desc())
    recurring_configs = session.exec(statement).all()
    if not recurring_configs:
        return {"data": [], "count": 0}

    config_ids = [r.id for r in recurring_configs]
    templates = session.exec(
        select(RecurringDoc).where(RecurringDoc.recurring_config_id.in_(config_ids))
    ).all()
    template_by_config_id = {t.recurring_config_id: t for t in templates}

    client_ids = [t.client_id for t in templates if t.client_id]
    clients_by_id: dict[uuid.UUID, Client] = {}
    if client_ids:
        clients = session.exec(select(Client).where(Client.id.in_(client_ids))).all()
        clients_by_id = {c.id: c for c in clients if c.id}

    data = []
    for recurring in recurring_configs:
        template = template_by_config_id.get(recurring.id)
        client = clients_by_id.get(template.client_id) if template and template.client_id else None
        data.append(
            {
                **RecurringConfigPublic.model_validate(recurring).model_dump(),
                "customer_name": _template_customer_name(template, client),
            }
        )
    return {"data": data, "count": len(data)}


@router.get("/{id}", response_model=dict[str, Any])
def read_recurring_config(session: SessionDep, current_user: VerifiedUser, id: uuid.UUID) -> Any:
    recurring = session.get(RecurringConfig, id)
    if not recurring:
        raise HTTPException(status_code=404, detail="Recurring schedule not found")
    if current_user.company_id and recurring.company_id != current_user.company_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    template = session.exec(
        select(RecurringDoc).where(RecurringDoc.recurring_config_id == recurring.id)
    ).first()
    return {
        "schedule": RecurringConfigPublic.model_validate(recurring).model_dump(),
        "template": RecurringDocPublic.model_validate(template).model_dump() if template else None,
    }


@router.post("/", response_model=dict[str, Any])
def create_recurring(
    *,
    session: SessionDep,
    current_user: VerifiedUser,
    recurring_in: RecurringScheduleCreate,
    request: Request,
) -> Any:
    company = _get_company(session, current_user)
    if not company:
        raise HTTPException(status_code=400, detail="User must belong to a company")
    if not current_user.is_superuser:
        try:
            check_entitlement(session, current_user, "recurring_invoices")
        except LimitReachedException as exc:
            raise HTTPException(status_code=403, detail=limit_reached_detail(exc)) from exc
    recurring = create_recurring_schedule(
        session=session,
        user=current_user,
        company=company,
        schedule_in=recurring_in.schedule.model_dump(),
        template_payload=recurring_in.template.model_dump(),
    )
    if recurring_in.generate_immediately:
        generate_recurring_schedule(session=session, recurring=recurring)
    template = session.exec(
        select(RecurringDoc).where(RecurringDoc.recurring_config_id == recurring.id)
    ).first()

    AuditLogger.log(
        session,
        company_id=recurring.company_id,
        user_id=current_user.id,
        module=AuditModule.RECURRING_INVOICES,
        table_name="recurringconfig",
        record_id=recurring.id,
        action=AuditAction.CREATE,
        entity_name=recurring.name,
        description=f"Created Recurring Invoice Schedule {recurring.name}",
        new_data=recurring,
        request=request,
    )

    return {
        "schedule": RecurringConfigPublic.model_validate(recurring).model_dump(),
        "template": RecurringDocPublic.model_validate(template).model_dump() if template else None,
    }


@router.put("/{id}", response_model=dict[str, Any])
def update_recurring(
    *,
    session: SessionDep,
    current_user: VerifiedUser,
    id: uuid.UUID,
    recurring_in: RecurringScheduleUpdate,
    request: Request,
) -> Any:
    recurring = session.get(RecurringConfig, id)
    if not recurring:
        raise HTTPException(status_code=404, detail="Recurring schedule not found")
    if current_user.company_id and recurring.company_id != current_user.company_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    old_recurring_dict = recurring.model_dump(mode="json")
    recurring, template = update_recurring_schedule(
        session=session,
        recurring=recurring,
        schedule_in=recurring_in.schedule.model_dump(exclude_unset=True) if recurring_in.schedule else None,
        template_in=recurring_in.template.model_dump(exclude_unset=True) if recurring_in.template else None,
    )

    AuditLogger.log(
        session,
        company_id=recurring.company_id,
        user_id=current_user.id,
        module=AuditModule.RECURRING_INVOICES,
        table_name="recurringconfig",
        record_id=recurring.id,
        action=AuditAction.UPDATE,
        entity_name=recurring.name,
        description=f"Updated Recurring Invoice Schedule {recurring.name}",
        old_data=old_recurring_dict,
        new_data=recurring,
        request=request,
    )

    return {
        "schedule": RecurringConfigPublic.model_validate(recurring).model_dump(),
        "template": RecurringDocPublic.model_validate(template).model_dump() if template else None,
    }


@router.delete("/{id}", response_model=Message)
def delete_recurring(session: SessionDep, current_user: VerifiedUser, id: uuid.UUID, request: Request) -> Message:
    recurring = session.get(RecurringConfig, id)
    if not recurring:
        raise HTTPException(status_code=404, detail="Recurring schedule not found")
    if current_user.company_id and recurring.company_id != current_user.company_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    old_recurring_dict = recurring.model_dump(mode="json")
    schedule_name = recurring.name
    comp_id = recurring.company_id
    delete_recurring_schedule(session=session, recurring=recurring)

    AuditLogger.log(
        session,
        company_id=comp_id,
        user_id=current_user.id,
        module=AuditModule.RECURRING_INVOICES,
        table_name="recurringconfig",
        record_id=id,
        action=AuditAction.DELETE,
        entity_name=schedule_name,
        description=f"Deleted Recurring Invoice Schedule {schedule_name}",
        old_data=old_recurring_dict,
        request=request,
    )

    return Message(message="Recurring schedule deleted successfully")


@router.post("/{id}/pause", response_model=RecurringConfigPublic)
def pause_recurring(session: SessionDep, current_user: VerifiedUser, id: uuid.UUID, request: Request) -> RecurringConfigPublic:
    recurring = session.get(RecurringConfig, id)
    if not recurring:
        raise HTTPException(status_code=404, detail="Recurring schedule not found")
    if current_user.company_id and recurring.company_id != current_user.company_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    old_recurring_dict = recurring.model_dump(mode="json")
    recurring = pause_recurring_schedule(session=session, recurring=recurring)

    AuditLogger.log(
        session,
        company_id=recurring.company_id,
        user_id=current_user.id,
        module=AuditModule.RECURRING_INVOICES,
        table_name="recurringconfig",
        record_id=recurring.id,
        action=AuditAction.STATUS_CHANGE,
        entity_name=recurring.name,
        description=f"Paused Recurring Invoice Schedule {recurring.name}",
        old_data=old_recurring_dict,
        new_data=recurring,
        request=request,
    )

    return RecurringConfigPublic.model_validate(recurring)


@router.post("/{id}/resume", response_model=RecurringConfigPublic)
def resume_recurring(session: SessionDep, current_user: VerifiedUser, id: uuid.UUID, request: Request) -> RecurringConfigPublic:
    recurring = session.get(RecurringConfig, id)
    if not recurring:
        raise HTTPException(status_code=404, detail="Recurring schedule not found")
    if current_user.company_id and recurring.company_id != current_user.company_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    old_recurring_dict = recurring.model_dump(mode="json")
    recurring = resume_recurring_schedule(session=session, recurring=recurring)

    AuditLogger.log(
        session,
        company_id=recurring.company_id,
        user_id=current_user.id,
        module=AuditModule.RECURRING_INVOICES,
        table_name="recurringconfig",
        record_id=recurring.id,
        action=AuditAction.STATUS_CHANGE,
        entity_name=recurring.name,
        description=f"Resumed Recurring Invoice Schedule {recurring.name}",
        old_data=old_recurring_dict,
        new_data=recurring,
        request=request,
    )

    return RecurringConfigPublic.model_validate(recurring)


@router.post("/{id}/generate", response_model=dict[str, Any])
def generate_now(session: SessionDep, current_user: VerifiedUser, id: uuid.UUID, request: Request) -> dict[str, Any]:
    recurring = session.get(RecurringConfig, id)
    if not recurring:
        raise HTTPException(status_code=404, detail="Recurring schedule not found")
    if current_user.company_id and recurring.company_id != current_user.company_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    generated = generate_recurring_schedule(session=session, recurring=recurring)

    AuditLogger.log(
        session,
        company_id=recurring.company_id,
        user_id=current_user.id,
        module=AuditModule.RECURRING_INVOICES,
        table_name="recurringconfig",
        record_id=recurring.id,
        action=AuditAction.GENERATE,
        entity_name=recurring.name,
        description=f"Generated Invoice from Recurring Schedule {recurring.name}",
        metadata={"generated_invoice_no": generated.docno if hasattr(generated, "docno") else None},
        request=request,
    )

    return {"generated": generated}
