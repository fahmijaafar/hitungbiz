import uuid
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from sqlmodel import col, func, select

from app.api.deps import CurrentUser, SessionDep, VerifiedUser
from app.models import (
    BankAccount,
    BankAccountCreate,
    BankAccountPublic,
    BankAccountsPublic,
    BankAccountUpdate,
    Message,
)
from app.services.audit_logger import AuditAction, AuditLogger, AuditModule

router = APIRouter(prefix="/bank_accounts", tags=["bank_accounts"])


@router.get("/", response_model=BankAccountsPublic)
def read_bank_accounts(
    session: SessionDep,
    current_user: VerifiedUser,
    skip: int = 0,
    limit: int = 100,
    company_id: uuid.UUID | None = None,
) -> Any:
    """
    Retrieve bank accounts. Filter by company_id if provided, otherwise use current user's company.
    """
    active_company_id = company_id or current_user.company_id

    if active_company_id:
        count_statement = (
            select(func.count())
            .select_from(BankAccount)
            .where(col(BankAccount.company_id) == active_company_id)
        )
        count = session.exec(count_statement).one()
        statement = (
            select(BankAccount)
            .where(col(BankAccount.company_id) == active_company_id)
            .order_by(col(BankAccount.account_name).asc())
            .offset(skip)
            .limit(limit)
        )
    else:
        count_statement = select(func.count()).select_from(BankAccount)
        count = session.exec(count_statement).one()
        statement = select(BankAccount).order_by(col(BankAccount.account_name).asc()).offset(skip).limit(limit)

    bank_accounts = session.exec(statement).all()
    return BankAccountsPublic(
        data=[BankAccountPublic.model_validate(ba) for ba in bank_accounts],
        count=count,
    )


@router.get("/{id}", response_model=BankAccountPublic)
def read_bank_account(session: SessionDep, _current_user: VerifiedUser, id: uuid.UUID) -> Any:
    """
    Get bank account by ID.
    """
    bank_account = session.get(BankAccount, id)
    if not bank_account:
        raise HTTPException(status_code=404, detail="Bank account not found")
    return bank_account


@router.post("/", response_model=BankAccountPublic)
def create_bank_account(
    *, session: SessionDep, current_user: VerifiedUser, bank_account_in: BankAccountCreate, request: Request
) -> Any:
    """
    Create new bank account.
    """
    bank_account = BankAccount.model_validate(
        bank_account_in,
        update={
            "user_id": current_user.id,
            "company_id": current_user.company_id,
        },
    )
    session.add(bank_account)
    session.commit()
    session.refresh(bank_account)

    AuditLogger.log(
        session,
        company_id=bank_account.company_id,
        user_id=current_user.id,
        module=AuditModule.BANK_ACCOUNTS,
        table_name="bankaccount",
        record_id=bank_account.id,
        action=AuditAction.CREATE,
        entity_name=bank_account.account_name,
        description=f"Created Bank Account {bank_account.account_name}",
        new_data=bank_account,
        request=request,
    )

    return bank_account


@router.put("/{id}", response_model=BankAccountPublic)
def update_bank_account(
    *, session: SessionDep, current_user: VerifiedUser, id: uuid.UUID, bank_account_in: BankAccountUpdate, request: Request
) -> Any:
    """
    Update a bank account.
    """
    bank_account = session.get(BankAccount, id)
    if not bank_account:
        raise HTTPException(status_code=404, detail="Bank account not found")
    old_bank_account_dict = bank_account.model_dump(mode="json")
    update_dict = bank_account_in.model_dump(exclude_unset=True)
    bank_account.sqlmodel_update(update_dict)
    session.add(bank_account)
    session.commit()
    session.refresh(bank_account)

    AuditLogger.log(
        session,
        company_id=bank_account.company_id,
        user_id=current_user.id,
        module=AuditModule.BANK_ACCOUNTS,
        table_name="bankaccount",
        record_id=bank_account.id,
        action=AuditAction.UPDATE,
        entity_name=bank_account.account_name,
        description=f"Updated Bank Account {bank_account.account_name}",
        old_data=old_bank_account_dict,
        new_data=bank_account,
        request=request,
    )

    return bank_account


@router.delete("/{id}")
def delete_bank_account(session: SessionDep, current_user: VerifiedUser, id: uuid.UUID, request: Request) -> Message:
    """
    Delete a bank account.
    """
    bank_account = session.get(BankAccount, id)
    if not bank_account:
        raise HTTPException(status_code=404, detail="Bank account not found")
    old_bank_account_dict = bank_account.model_dump(mode="json")
    session.delete(bank_account)
    session.commit()

    AuditLogger.log(
        session,
        company_id=bank_account.company_id,
        user_id=current_user.id,
        module=AuditModule.BANK_ACCOUNTS,
        table_name="bankaccount",
        record_id=bank_account.id,
        action=AuditAction.DELETE,
        entity_name=bank_account.account_name,
        description=f"Deleted Bank Account {bank_account.account_name}",
        old_data=old_bank_account_dict,
        request=request,
    )

    return Message(message="Bank account deleted successfully")