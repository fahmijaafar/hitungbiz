import uuid
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from sqlmodel import func, select

from app.api.deps import CurrentUser, SessionDep, VerifiedUser
from app.models import (
    Client,
    ClientCreate,
    ClientPublic,
    ClientsPublic,
    ClientUpdate,
    Message,
)
from app.services.audit_logger import AuditAction, AuditLogger, AuditModule
from app.services.entitlement_service import LimitReachedException, check_entitlement

router = APIRouter(prefix="/clients", tags=["clients"])


@router.get("/", response_model=ClientsPublic)
def read_clients(
    session: SessionDep,
    current_user: VerifiedUser,
    skip: int = 0,
    limit: int = 100,
    company_id: uuid.UUID | None = None,
) -> Any:
    """
    Retrieve clients. Filter by company_id if provided, otherwise use current user's company.
    """
    active_company_id = company_id or current_user.company_id

    if active_company_id:
        count_statement = (
            select(func.count())
            .select_from(Client)
            .where(Client.company_id == active_company_id)
        )
        count = session.exec(count_statement).one()
        statement = (
            select(Client)
            .where(Client.company_id == active_company_id)
            .order_by(Client.name.asc())
            .offset(skip)
            .limit(limit)
        )
    else:
        count_statement = select(func.count()).select_from(Client)
        count = session.exec(count_statement).one()
        statement = select(Client).order_by(Client.name.asc()).offset(skip).limit(limit)

    clients = session.exec(statement).all()
    clients_public = [ClientPublic.model_validate(client) for client in clients]
    return ClientsPublic(data=clients_public, count=count)


@router.get("/{id}", response_model=ClientPublic)
def read_client(session: SessionDep, _current_user: VerifiedUser, id: uuid.UUID) -> Any:
    """
    Get client by ID.
    """
    client = session.get(Client, id)
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    return client


@router.post("/", response_model=ClientPublic)
def create_client(
    *, session: SessionDep, current_user: VerifiedUser, client_in: ClientCreate, request: Request
) -> Any:
    """
    Create new client.

    Entitlement check runs before creation. Superusers bypass plan limits.
    Returns 403 with error=LIMIT_REACHED when the customer limit is hit.
    """
    # --- Entitlement check ---------------------------------------------------
    if not current_user.is_superuser:
        try:
            check_entitlement(
                session, current_user, "customers", company_id=current_user.company_id
            )
        except LimitReachedException as exc:
            raise HTTPException(
                status_code=403,
                detail={
                    "error": "LIMIT_REACHED",
                    "feature": exc.feature,
                    "plan": exc.plan,
                    "limit": exc.limit,
                    "current_usage": exc.current_usage,
                    "upgrade_required": True,
                    "next_plan": exc.next_plan,
                },
            )
    # --- Create client -------------------------------------------------------
    client = Client.model_validate(
        client_in,
        update={
            "user_id": current_user.id,
            "company_id": current_user.company_id,
        },
    )
    session.add(client)
    session.commit()
    session.refresh(client)

    AuditLogger.log(
        session,
        company_id=client.company_id,
        user_id=current_user.id,
        module=AuditModule.CLIENTS,
        table_name="client",
        record_id=client.id,
        action=AuditAction.CREATE,
        entity_name=client.name,
        description=f"Created Client {client.name}",
        new_data=client,
        request=request,
    )

    return client


@router.put("/{id}", response_model=ClientPublic)
def update_client(
    *, session: SessionDep, current_user: VerifiedUser, id: uuid.UUID, client_in: ClientUpdate, request: Request
) -> Any:
    """
    Update a client.
    """
    client = session.get(Client, id)
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    old_client_dict = client.model_dump(mode="json")
    update_dict = client_in.model_dump(exclude_unset=True)
    client.sqlmodel_update(update_dict)
    session.add(client)
    session.commit()
    session.refresh(client)

    AuditLogger.log(
        session,
        company_id=client.company_id,
        user_id=current_user.id,
        module=AuditModule.CLIENTS,
        table_name="client",
        record_id=client.id,
        action=AuditAction.UPDATE,
        entity_name=client.name,
        description=f"Updated Client {client.name}",
        old_data=old_client_dict,
        new_data=client,
        request=request,
    )

    return client


@router.delete("/{id}")
def delete_client(session: SessionDep, current_user: VerifiedUser, id: uuid.UUID, request: Request) -> Message:
    """
    Delete a client.
    """
    client = session.get(Client, id)
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    old_client_dict = client.model_dump(mode="json")
    session.delete(client)
    session.commit()

    AuditLogger.log(
        session,
        company_id=client.company_id,
        user_id=current_user.id,
        module=AuditModule.CLIENTS,
        table_name="client",
        record_id=client.id,
        action=AuditAction.DELETE,
        entity_name=client.name,
        description=f"Deleted Client {client.name}",
        old_data=old_client_dict,
        request=request,
    )

    return Message(message="Client deleted successfully")