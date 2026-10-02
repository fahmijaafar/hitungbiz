import uuid
from typing import Any

from fastapi import APIRouter, HTTPException
from sqlmodel import col, func, select

from app.api.deps import CurrentUser, SessionDep, VerifiedUser
from app.models import (
    Integration,
    IntegrationCreate,
    IntegrationPublic,
    IntegrationsPublic,
    IntegrationUpdate,
    Message,
)

router = APIRouter(prefix="/integrations", tags=["integrations"])


@router.get("/", response_model=IntegrationsPublic)
def read_integrations(
    session: SessionDep,
    current_user: VerifiedUser,
    skip: int = 0,
    limit: int = 100,
    company_id: uuid.UUID | None = None,
) -> Any:
    """
    Retrieve integrations. Filter by company_id if provided, otherwise use current user's company.
    """
    active_company_id = company_id or current_user.company_id

    if active_company_id:
        count_statement = (
            select(func.count())
            .select_from(Integration)
            .where(col(Integration.company_id) == active_company_id)
        )
        count = session.exec(count_statement).one()
        statement = (
            select(Integration)
            .where(col(Integration.company_id) == active_company_id)
            .order_by(col(Integration.platform).asc())
            .offset(skip)
            .limit(limit)
        )
    else:
        count_statement = select(func.count()).select_from(Integration)
        count = session.exec(count_statement).one()
        statement = (
            select(Integration)
            .order_by(col(Integration.platform).asc())
            .offset(skip)
            .limit(limit)
        )

    integrations = session.exec(statement).all()
    integrations_public = [
        IntegrationPublic.model_validate(integration)
        for integration in integrations
    ]
    return IntegrationsPublic(data=integrations_public, count=count)


@router.get("/{id}", response_model=IntegrationPublic)
def read_integration(
    session: SessionDep, _current_user: VerifiedUser, id: uuid.UUID
) -> Any:
    """
    Get integration by ID.
    """
    integration = session.get(Integration, id)
    if not integration:
        raise HTTPException(status_code=404, detail="Integration not found")
    return integration


@router.post("/", response_model=IntegrationPublic)
def create_integration(
    *, session: SessionDep, _current_user: VerifiedUser, integration_in: IntegrationCreate
) -> Any:
    """
    Create new integration.
    """
    integration = Integration.model_validate(integration_in)
    session.add(integration)
    session.commit()
    session.refresh(integration)
    return integration


@router.put("/{id}", response_model=IntegrationPublic)
def update_integration(
    *,
    session: SessionDep,
    _current_user: VerifiedUser,
    id: uuid.UUID,
    integration_in: IntegrationUpdate,
) -> Any:
    """
    Update an integration.
    """
    integration = session.get(Integration, id)
    if not integration:
        raise HTTPException(status_code=404, detail="Integration not found")
    update_dict = integration_in.model_dump(exclude_unset=True)
    integration.sqlmodel_update(update_dict)
    session.add(integration)
    session.commit()
    session.refresh(integration)
    return integration


@router.delete("/{id}")
def delete_integration(
    session: SessionDep, _current_user: VerifiedUser, id: uuid.UUID
) -> Message:
    """
    Delete an integration.
    """
    integration = session.get(Integration, id)
    if not integration:
        raise HTTPException(status_code=404, detail="Integration not found")
    session.delete(integration)
    session.commit()
    return Message(message="Integration deleted successfully")
