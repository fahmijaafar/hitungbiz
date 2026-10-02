import json
import uuid
from typing import Any

from fastapi import APIRouter, HTTPException, status
from sqlmodel import select

from app.api.deps import SessionDep, VerifiedUser
from app.models import (
    Company,
    Message,
    TaxAdvisorAnalysis,
    TaxPayment,
    TaxPaymentCreate,
    TaxPaymentPublic,
    TaxPaymentsPublic,
    TaxRateBracket,
    TaxRateBracketPublic,
    TaxRuleSet,
)
from app.services.tax_service import (
    calculate_tax_position,
    get_available_tax_years,
    resolve_taxpayer_type,
)

router = APIRouter(prefix="/companies", tags=["tax-advisor"])


def _verify_company_access(session: SessionDep, current_user: VerifiedUser, company_id: uuid.UUID) -> Company:
    has_access = current_user.is_superuser
    if not has_access:
        try:
            accessible_company_ids = json.loads(current_user.companies or "[]")
        except json.JSONDecodeError:
            accessible_company_ids = []

        has_access = str(company_id) in accessible_company_ids
        if not has_access and current_user.company_id:
            has_access = str(current_user.company_id) == str(company_id)

    if not has_access:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Company not found",
        )

    company = session.get(Company, company_id)
    if not company or not company.is_active:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Company not found",
        )

    return company


@router.get("/{company_id}/tax-advisor/years", response_model=list[int])
def read_tax_advisor_years(
    company_id: uuid.UUID,
    session: SessionDep,
    current_user: VerifiedUser,
) -> Any:
    """Get years for which the company has recorded transaction data."""
    _verify_company_access(session, current_user, company_id)
    return get_available_tax_years(session, company_id)


@router.get("/{company_id}/tax-advisor/{year}", response_model=TaxAdvisorAnalysis)
def read_tax_advisor_analysis(
    company_id: uuid.UUID,
    year: int,
    session: SessionDep,
    current_user: VerifiedUser,
) -> Any:
    """Get the full LHDN Tax Advisor calculation and reconciliation analysis for a specific year."""
    _verify_company_access(session, current_user, company_id)
    return calculate_tax_position(session, company_id, year)


@router.get("/{company_id}/tax-advisor/{year}/brackets", response_model=list[TaxRateBracketPublic])
def read_tax_rate_brackets(
    company_id: uuid.UUID,
    year: int,
    session: SessionDep,
    current_user: VerifiedUser,
) -> Any:
    """Get the tax rate brackets reference for a specific year."""
    company = _verify_company_access(session, current_user, company_id)
    analysis = calculate_tax_position(session, company_id, year)
    taxpayer_type, _ = resolve_taxpayer_type(company, analysis.revenue)

    rule_set = session.exec(
        select(TaxRuleSet).where(
            TaxRuleSet.tax_year == year,
            TaxRuleSet.taxpayer_type == taxpayer_type,
            TaxRuleSet.country == "MY",
        )
    ).first()

    if not rule_set:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Tax rules for year {year} not found",
        )

    brackets = session.exec(
        select(TaxRateBracket)
        .where(TaxRateBracket.tax_rule_set_id == rule_set.id)
        .order_by(TaxRateBracket.sequence)
    ).all()

    return [TaxRateBracketPublic.model_validate(b) for b in brackets]


@router.get("/{company_id}/tax-advisor/{year}/payments", response_model=TaxPaymentsPublic)
def read_tax_payments(
    company_id: uuid.UUID,
    year: int,
    session: SessionDep,
    current_user: VerifiedUser,
) -> Any:
    """Get all recorded tax payments for a company in a specific year."""
    _verify_company_access(session, current_user, company_id)

    payments = session.exec(
        select(TaxPayment)
        .where(
            TaxPayment.company_id == company_id,
            TaxPayment.tax_year == year,
        )
        .order_by(TaxPayment.payment_date.desc())
    ).all()

    public_payments = [TaxPaymentPublic.model_validate(p) for p in payments]
    return TaxPaymentsPublic(data=public_payments, count=len(public_payments))


@router.post("/{company_id}/tax-advisor/{year}/payments", response_model=TaxPaymentPublic)
def create_tax_payment(
    company_id: uuid.UUID,
    year: int,
    payment_in: TaxPaymentCreate,
    session: SessionDep,
    current_user: VerifiedUser,
) -> Any:
    """Record a tax payment for a company."""
    _verify_company_access(session, current_user, company_id)

    payment = TaxPayment.model_validate(
        payment_in,
        update={
            "company_id": company_id,
            "user_id": current_user.id,
            "tax_year": year,
        },
    )
    session.add(payment)
    session.commit()
    session.refresh(payment)
    return TaxPaymentPublic.model_validate(payment)


@router.delete("/{company_id}/tax-advisor/{year}/payments/{payment_id}")
def delete_tax_payment(
    company_id: uuid.UUID,
    year: int,
    payment_id: uuid.UUID,
    session: SessionDep,
    current_user: VerifiedUser,
) -> Message:
    """Delete a recorded tax payment."""
    _verify_company_access(session, current_user, company_id)

    payment = session.get(TaxPayment, payment_id)
    if not payment or payment.company_id != company_id or payment.tax_year != year:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tax payment record not found",
        )

    session.delete(payment)
    session.commit()
    return Message(message="Tax payment record deleted successfully")
