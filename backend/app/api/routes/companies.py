import json
import uuid
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from sqlmodel import col, func, select

from app.api.deps import CurrentUser, SessionDep, VerifiedUser
from app.models import (
    CompaniesPublic,
    Company,
    CompanyCreate,
    CompanyPublic,
    CompanyUpdate,
    Message,
    StaffAdd,
    StaffMemberPublic,
    StaffPublic,
    User,
)
from app.services.audit_logger import AuditAction, AuditLogger, AuditModule
from app.services.entitlement_service import LimitReachedException, check_entitlement, get_staff_count

router = APIRouter(prefix="/companies", tags=["companies"])


def _add_company_access(companies: str | None, company_id: uuid.UUID) -> str:
    try:
        company_ids = json.loads(companies or "[]")
    except json.JSONDecodeError:
        company_ids = []

    if not isinstance(company_ids, list):
        company_ids = []

    company_id_str = str(company_id)
    if company_id_str not in company_ids:
        company_ids.append(company_id_str)

    return json.dumps(company_ids)


def _remove_company_access(companies: str | None, company_id: uuid.UUID) -> str:
    try:
        company_ids = json.loads(companies or "[]")
    except json.JSONDecodeError:
        company_ids = []

    if not isinstance(company_ids, list):
        company_ids = []

    company_id_str = str(company_id)
    company_ids = [cid for cid in company_ids if cid != company_id_str]

    return json.dumps(company_ids)


def _check_company_access(user: User, company: Company) -> bool:
    if user.is_superuser:
        return True
    try:
        accessible_company_ids = json.loads(user.companies or "[]")
    except json.JSONDecodeError:
        accessible_company_ids = []
    if str(company.id) in accessible_company_ids:
        return True
    if user.company_id and str(user.company_id) == str(company.id):
        return True
    if company.user_id and company.user_id == user.id:
        return True
    return False


def _is_company_owner(user: User, company: Company) -> bool:
    if user.is_superuser:
        return True
    return company.user_id == user.id



@router.get("/", response_model=CompaniesPublic)
def read_companies(
    session: SessionDep, current_user: VerifiedUser, skip: int = 0, limit: int = 100
) -> Any:
    """
    Retrieve companies. Returns companies the user has access to, or all if superuser.
    """
    if current_user.is_superuser:
        statement = (
            select(Company)
            .where(col(Company.is_active).is_(True))
            .order_by(col(Company.company_name))
            .offset(skip)
            .limit(limit)
        )
        companies = session.exec(statement).all()

        count_statement = (
            select(func.count())
            .select_from(Company)
            .where(col(Company.is_active).is_(True))
        )
        count = session.exec(count_statement).one()

        companies_public = [CompanyPublic.model_validate(company) for company in companies]
        return CompaniesPublic(data=companies_public, count=count)

    # Parse the user's accessible company IDs from the companies JSON array
    try:
        accessible_company_ids = json.loads(current_user.companies or "[]")
    except json.JSONDecodeError:
        accessible_company_ids = []

    # Also include user's primary company_id if not already in the list
    if current_user.company_id and str(current_user.company_id) not in accessible_company_ids:
        accessible_company_ids.append(str(current_user.company_id))

    if not isinstance(accessible_company_ids, list) or len(accessible_company_ids) == 0:
        return CompaniesPublic(data=[], count=0)

    # Convert string IDs to UUID objects for the query
    uuid_ids = []
    for cid in accessible_company_ids:
        try:
            uuid_ids.append(uuid.UUID(cid))
        except (ValueError, TypeError):
            continue

    if not uuid_ids:
        return CompaniesPublic(data=[], count=0)

    statement = (
        select(Company)
        .where(col(Company.id).in_(uuid_ids), col(Company.is_active).is_(True))
        .order_by(col(Company.company_name))
        .offset(skip)
        .limit(limit)
    )
    companies = session.exec(statement).all()

    count_statement = (
        select(func.count())
        .select_from(Company)
        .where(col(Company.id).in_(uuid_ids), col(Company.is_active).is_(True))
    )
    count = session.exec(count_statement).one()

    companies_public = [CompanyPublic.model_validate(company) for company in companies]
    return CompaniesPublic(data=companies_public, count=count)


@router.get("/{id}", response_model=CompanyPublic)
def read_company(session: SessionDep, current_user: VerifiedUser, id: uuid.UUID) -> Any:
    """
    Get company by ID. Only returns if user has access (or is superuser).
    """
    has_access = current_user.is_superuser
    if not has_access:
        try:
            accessible_company_ids = json.loads(current_user.companies or "[]")
        except json.JSONDecodeError:
            accessible_company_ids = []

        has_access = str(id) in accessible_company_ids
        if not has_access and current_user.company_id:
            has_access = str(current_user.company_id) == str(id)

    if not has_access:
        raise HTTPException(status_code=404, detail="Company not found")

    company = session.get(Company, id)
    if not company or not company.is_active:
        raise HTTPException(status_code=404, detail="Company not found")
    return company


@router.post("/", response_model=CompanyPublic)
def create_company(
    *, session: SessionDep, current_user: VerifiedUser, company_in: CompanyCreate, request: Request
) -> Any:
    """
    Create new company.

    Entitlement check runs before creation. Superusers bypass plan limits.
    Returns 403 with error=LIMIT_REACHED when the user's company limit is hit.
    """
    # --- Entitlement check ---------------------------------------------------
    if not current_user.is_superuser:
        try:
            check_entitlement(session, current_user, "companies")
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
    # --- Create company ------------------------------------------------------
    company = Company.model_validate(company_in, update={"user_id": current_user.id})
    session.add(company)
    session.commit()
    session.refresh(company)
    user_updated = False
    if not current_user.is_superuser:
        current_user.companies = _add_company_access(current_user.companies, company.id)
        user_updated = True
    if current_user.company_id is None:
        current_user.company_id = company.id
        user_updated = True
    if user_updated:
        session.add(current_user)
        session.commit()
        session.refresh(current_user)

    AuditLogger.log(
        session,
        company_id=company.id,
        user_id=current_user.id,
        module=AuditModule.COMPANIES,
        table_name="company",
        record_id=company.id,
        action=AuditAction.CREATE,
        entity_name=company.company_name,
        description=f"Created Company {company.company_name}",
        new_data=company,
        request=request,
    )

    return company


@router.put("/{id}", response_model=CompanyPublic)
def update_company(
    *,
    session: SessionDep,
    current_user: VerifiedUser,
    id: uuid.UUID,
    company_in: CompanyUpdate,
    request: Request,
) -> Any:
    """
    Update a company.
    """
    has_access = current_user.is_superuser
    if not has_access:
        try:
            accessible_company_ids = json.loads(current_user.companies or "[]")
        except json.JSONDecodeError:
            accessible_company_ids = []

        has_access = str(id) in accessible_company_ids
        if not has_access and current_user.company_id:
            has_access = str(current_user.company_id) == str(id)

    if not has_access:
        raise HTTPException(status_code=404, detail="Company not found")

    company = session.get(Company, id)
    if not company or not company.is_active:
        raise HTTPException(status_code=404, detail="Company not found")
    old_company_dict = company.model_dump(mode="json")
    update_dict = company_in.model_dump(exclude_unset=True)
    company.sqlmodel_update(update_dict)
    session.add(company)
    session.commit()
    session.refresh(company)

    AuditLogger.log(
        session,
        company_id=company.id,
        user_id=current_user.id,
        module=AuditModule.COMPANIES,
        table_name="company",
        record_id=company.id,
        action=AuditAction.UPDATE,
        entity_name=company.company_name,
        description=f"Updated Company {company.company_name}",
        old_data=old_company_dict,
        new_data=company,
        request=request,
    )

    return company


@router.delete("/{id}")
def delete_company(
    session: SessionDep, current_user: VerifiedUser, id: uuid.UUID, request: Request
) -> Message:
    """
    Delete a company.
    """
    has_access = current_user.is_superuser
    if not has_access:
        try:
            accessible_company_ids = json.loads(current_user.companies or "[]")
        except json.JSONDecodeError:
            accessible_company_ids = []

        has_access = str(id) in accessible_company_ids
        if not has_access and current_user.company_id:
            has_access = str(current_user.company_id) == str(id)

    if not has_access:
        raise HTTPException(status_code=404, detail="Company not found")

    company = session.get(Company, id)
    if not company or not company.is_active:
        raise HTTPException(status_code=404, detail="Company not found")

    if not current_user.is_superuser and company.user_id != current_user.id:
        raise HTTPException(
            status_code=403, detail="Not enough permissions to delete this company"
        )

    if current_user.company_id and str(current_user.company_id) == str(id):
        raise HTTPException(
            status_code=400,
            detail="Cannot delete your current active company. Please select another active company first or create a new company.",
        )

    old_company_dict = company.model_dump(mode="json")
    company.is_active = False
    session.add(company)
    current_user.companies = _remove_company_access(current_user.companies, company.id)
    session.add(current_user)
    session.commit()
    session.refresh(company)

    AuditLogger.log(
        session,
        company_id=company.id,
        user_id=current_user.id,
        module=AuditModule.COMPANIES,
        table_name="company",
        record_id=company.id,
        action=AuditAction.DELETE,
        entity_name=company.company_name,
        description=f"Deleted Company {company.company_name}",
        old_data=old_company_dict,
        request=request,
    )

    return Message(message="Company deactivated successfully")


# Staff Endpoints


@router.get("/{company_id}/staff", response_model=StaffPublic)
def read_company_staff(
    session: SessionDep, current_user: VerifiedUser, company_id: uuid.UUID
) -> Any:
    """
    Retrieve staff members belonging to a company.
    """
    company = session.get(Company, company_id)
    if not company or not company.is_active:
        raise HTTPException(status_code=404, detail="Company not found")

    if not _check_company_access(current_user, company):
        raise HTTPException(status_code=404, detail="Company not found")

    users = session.exec(select(User)).all()
    staff_members: list[StaffMemberPublic] = []
    company_id_str = str(company_id)

    for user in users:
        is_owner = company.user_id is not None and user.id == company.user_id

        user_companies = []
        try:
            user_companies = json.loads(user.companies or "[]")
        except json.JSONDecodeError:
            pass
        if not isinstance(user_companies, list):
            user_companies = []

        is_member = (
            company_id_str in user_companies
            or (user.company_id is not None and str(user.company_id) == company_id_str)
        )

        if is_owner or is_member:
            membership_type = "owner" if is_owner else "member"
            staff_members.append(
                StaffMemberPublic(
                    id=user.id,
                    name=user.full_name,
                    email=user.email,
                    phone_number=user.phone_number,
                    avatar=None,
                    membership_type=membership_type,
                )
            )

    staff_members.sort(key=lambda s: 0 if s.membership_type == "owner" else 1)

    return StaffPublic(data=staff_members, count=len(staff_members))


@router.post("/{company_id}/staff", response_model=StaffMemberPublic)
def add_company_staff(
    *,
    session: SessionDep,
    current_user: VerifiedUser,
    company_id: uuid.UUID,
    staff_in: StaffAdd,
    request: Request,
) -> Any:
    """
    Add a user to company staff by email (owner only).

    Entitlement check runs before the staff member is added.
    Superusers bypass plan limits.
    Returns 403 with error=LIMIT_REACHED when the staff limit is hit.
    """
    company = session.get(Company, company_id)
    if not company or not company.is_active:
        raise HTTPException(status_code=404, detail="Company not found")

    if not _is_company_owner(current_user, company):
        raise HTTPException(
            status_code=403, detail="You do not have permission to perform this action."
        )

    # --- Entitlement check ---------------------------------------------------
    if not current_user.is_superuser:
        try:
            check_entitlement(session, current_user, "staff", company_id=company_id)
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

    target_email = staff_in.email.strip().lower()
    statement = select(User).where(func.lower(col(User.email)) == target_email)
    target_user = session.exec(statement).first()

    if not target_user:
        raise HTTPException(
            status_code=400,
            detail=f"User with this email does not exist. Share the company id for the user to enter once he is registered. Company ID : {company_id}",
        )

    company_id_str = str(company_id)
    is_owner = company.user_id is not None and target_user.id == company.user_id

    user_companies = []
    try:
        user_companies = json.loads(target_user.companies or "[]")
    except json.JSONDecodeError:
        pass
    if not isinstance(user_companies, list):
        user_companies = []

    already_belongs = (
        is_owner
        or company_id_str in user_companies
        or (target_user.company_id is not None and str(target_user.company_id) == company_id_str)
    )

    if already_belongs:
        raise HTTPException(
            status_code=400, detail="This user is already a member of this company."
        )

    target_user.companies = _add_company_access(target_user.companies, company_id)
    if not target_user.company_id:
        target_user.company_id = company_id

    session.add(target_user)
    session.commit()
    session.refresh(target_user)

    AuditLogger.log(
        session,
        company_id=company.id,
        user_id=current_user.id,
        module=AuditModule.COMPANIES,
        table_name="user",
        record_id=target_user.id,
        action=AuditAction.UPDATE,
        entity_name=target_user.email,
        description=f"Added staff member {target_user.email} to company {company.company_name}",
        request=request,
    )

    return StaffMemberPublic(
        id=target_user.id,
        name=target_user.full_name,
        email=target_user.email,
        phone_number=target_user.phone_number,
        avatar=None,
        membership_type="member",
    )



@router.delete("/{company_id}/staff/{user_id}", response_model=Message)
def remove_company_staff(
    *,
    session: SessionDep,
    current_user: VerifiedUser,
    company_id: uuid.UUID,
    user_id: uuid.UUID,
    request: Request,
) -> Message:
    """
    Remove a staff member from company (owner only).
    """
    company = session.get(Company, company_id)
    if not company or not company.is_active:
        raise HTTPException(status_code=404, detail="Company not found")

    if not _is_company_owner(current_user, company):
        raise HTTPException(
            status_code=403, detail="You do not have permission to perform this action."
        )

    if company.user_id and user_id == company.user_id:
        raise HTTPException(
            status_code=400, detail="The company owner cannot be removed."
        )

    if user_id == current_user.id:
        raise HTTPException(
            status_code=400, detail="You do not have permission to perform this action."
        )

    target_user = session.get(User, user_id)
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")

    target_user.companies = _remove_company_access(target_user.companies, company_id)
    if target_user.company_id and str(target_user.company_id) == str(company_id):
        target_user.company_id = None

    session.add(target_user)
    session.commit()
    session.refresh(target_user)

    AuditLogger.log(
        session,
        company_id=company.id,
        user_id=current_user.id,
        module=AuditModule.COMPANIES,
        table_name="user",
        record_id=target_user.id,
        action=AuditAction.UPDATE,
        entity_name=target_user.email,
        description=f"Removed staff member {target_user.email} from company {company.company_name}",
        request=request,
    )

    return Message(message="Staff member removed successfully.")

