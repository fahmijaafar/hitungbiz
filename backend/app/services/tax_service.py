import uuid

from fastapi import HTTPException, status
from sqlmodel import Session, func, select

from app.models import (
    CapitalAllowanceDetail,
    CapitalAllowanceRule,
    Company,
    ExpenseCategoryDeduction,
    ExpenseTaxRule,
    Purchase,
    Sale,
    TaxAdvisorAnalysis,
    TaxBracketBreakdown,
    TaxPayment,
    TaxRateBracket,
    TaxRuleSet,
)

SME_GROSS_INCOME_LIMIT = 50_000_000.0

INDIVIDUAL_BUSINESS_COMPANY_TYPES = {
    "sole proprietorship",
    "enterprise",
    "partnership",
}

CORPORATE_COMPANY_TYPES = {
    "sdn bhd (private limited)",
    "bhd (public limited)",
    "llp (limited liability partnership)",
}


def resolve_taxpayer_type(company: Company, revenue: float) -> tuple[str, str | None]:
    """Map company profile data to the seeded tax rule set."""
    company_type = (company.company_type or "").strip().lower()

    if not company_type or company_type in INDIVIDUAL_BUSINESS_COMPANY_TYPES:
        return "individual_business", None

    if company_type in CORPORATE_COMPANY_TYPES:
        if revenue > SME_GROSS_INCOME_LIMIT:
            return "corporate_standard", None
        return (
            "corporate_sme",
            "Corporate SME tax rates assume paid-up capital, ownership, and group conditions are satisfied; "
            "the app currently only checks recorded gross business income against RM50 million.",
        )

    return (
        "corporate_standard",
        "Company type is not mapped to sole proprietorship/enterprise/partnership; standard corporate tax rates were used.",
    )


def get_available_tax_years(session: Session, company_id: uuid.UUID) -> list[int]:
    """Retrieve distinct years for which the company has transaction data (sales or purchases)."""
    # 1. Sales years
    sales_stmt = (
        select(func.extract("year", Sale.date))
        .where(
            Sale.company_id == company_id,
            Sale.status == "Completed",
        )
        .distinct()
    )
    sales_years = {int(y) for y in session.exec(sales_stmt).all() if y is not None}

    # 2. Purchases years
    purchases_stmt = (
        select(func.extract("year", Purchase.date))
        .where(
            Purchase.company_id == company_id,
            Purchase.status == "Paid",
        )
        .distinct()
    )
    purchases_years = {int(y) for y in session.exec(purchases_stmt).all() if y is not None}

    all_years = sorted(sales_years | purchases_years, reverse=True)
    return all_years


def calculate_tax_position(
    session: Session,
    company_id: uuid.UUID,
    tax_year: int,
) -> TaxAdvisorAnalysis:
    """Calculate the estimated Malaysian LHDN income tax position for a given company and year."""
    # 1. Verify company exists
    company = session.get(Company, company_id)
    if not company:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Company not found",
        )

    # 2. Query sales (Revenue)
    sales_stmt = select(Sale).where(
        Sale.company_id == company_id,
        Sale.status == "Completed",
        func.extract("year", Sale.date) == tax_year,
    )
    sales = session.exec(sales_stmt).all()
    revenue = sum(float(s.final_amount) for s in sales)

    # 3. Query purchases (Accounting Expenses)
    purchases_stmt = select(Purchase).where(
        Purchase.company_id == company_id,
        Purchase.status == "Paid",
        func.extract("year", Purchase.date) == tax_year,
    )
    purchases = session.exec(purchases_stmt).all()
    expenses = sum(float(p.final_amount) for p in purchases)

    # 4. Profit Before Tax
    profit_before_tax = revenue - expenses
    taxpayer_type, taxpayer_type_warning = resolve_taxpayer_type(company, revenue)

    # 5. Fetch TaxRuleSet for tax_year
    rule_set_stmt = select(TaxRuleSet).where(
        TaxRuleSet.tax_year == tax_year,
        TaxRuleSet.taxpayer_type == taxpayer_type,
        TaxRuleSet.country == "MY",
        TaxRuleSet.is_active == True,  # noqa: E712
    )
    rule_set = session.exec(rule_set_stmt).first()
    if not rule_set:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Tax rules for year {tax_year} and taxpayer type '{taxpayer_type}' are not configured.",
        )

    # 6. Fetch ExpenseTaxRules & CapitalAllowanceRules
    expense_rules = session.exec(
        select(ExpenseTaxRule).where(ExpenseTaxRule.tax_rule_set_id == rule_set.id)
    ).all()
    rule_map = {r.category.strip().lower(): r for r in expense_rules}

    ca_rules = session.exec(
        select(CapitalAllowanceRule).where(CapitalAllowanceRule.tax_rule_set_id == rule_set.id)
    ).all()
    ca_rule_map = {r.asset_class: r for r in ca_rules}

    # 7. Group purchases by category and apply tax rules
    purchases_by_category: dict[str, list[Purchase]] = {}
    uncategorized_count = 0
    for p in purchases:
        cat = (p.category or "").strip()
        if not cat or cat.lower() == "uncategorized":
            uncategorized_count += 1
            cat = "Miscellaneous Business Expense"
        purchases_by_category.setdefault(cat, []).append(p)

    deductions_by_category: list[ExpenseCategoryDeduction] = []
    capital_allowance_details: list[CapitalAllowanceDetail] = []
    requires_review_items: list[str] = []
    warnings: list[str] = []

    if taxpayer_type_warning:
        warnings.append(taxpayer_type_warning)

    if uncategorized_count > 0:
        warnings.append(f"{uncategorized_count} transaction(s) are uncategorized and mapped to conditional review.")

    total_deductible = 0.0
    total_conditional = 0.0
    total_non_deductible = 0.0
    total_ca_purchase_cost = 0.0
    total_prepayments = 0.0
    total_deposits = 0.0
    total_owner_drawings = 0.0

    for cat_name, cat_purchases in purchases_by_category.items():
        cat_total = sum(float(p.final_amount) for p in cat_purchases)
        rule = rule_map.get(cat_name.strip().lower())

        if not rule:
            # Fallback for unknown categories: conditional (requires review)
            treatment = "conditional"
            ca_class = None
            notes = "Unrecognized category - requires manual tax review."
        else:
            treatment = rule.tax_treatment
            ca_class = rule.capital_allowance_class
            notes = rule.notes

        est_deductible = 0.0
        req_review = False

        if treatment == "deductible":
            est_deductible = cat_total
            total_deductible += cat_total
        elif treatment == "conditional":
            req_review = True
            total_conditional += cat_total
            requires_review_items.append(f"{cat_name} (RM{cat_total:,.2f}) requires tax treatment review.")
        elif treatment == "non_deductible":
            total_non_deductible += cat_total
        elif treatment == "capital_allowance":
            total_ca_purchase_cost += cat_total
            asset_cls = ca_class or "other_assets"
            ca_rule = ca_rule_map.get(asset_cls) or ca_rule_map.get("other_assets")
            ia_rate = ca_rule.initial_allowance_rate if ca_rule else 20.0
            aa_rate = ca_rule.annual_allowance_rate if ca_rule else 10.0

            for p in cat_purchases:
                p_cost = float(p.final_amount)
                p_date_str = p.date.strftime("%Y-%m-%d") if p.date else ""
                ia_amount = p_cost * (ia_rate / 100.0)
                aa_amount = p_cost * (aa_rate / 100.0)
                tot_allowance = min(p_cost, ia_amount + aa_amount)
                rem_exp = max(0.0, p_cost - tot_allowance)

                capital_allowance_details.append(
                    CapitalAllowanceDetail(
                        purchase_id=p.id,
                        asset=f"{p.supplier_name} - {p.invoice_no or cat_name}",
                        purchase_date=p_date_str,
                        purchase_cost=p_cost,
                        asset_class=asset_cls,
                        initial_allowance_rate=ia_rate,
                        annual_allowance_rate=aa_rate,
                        initial_allowance=round(ia_amount, 2),
                        annual_allowance=round(aa_amount, 2),
                        total_allowance=round(tot_allowance, 2),
                        remaining_qualifying_expenditure=round(rem_exp, 2),
                    )
                )
            # Estimated deductible shown in category table for fixed asset is total allowance for those purchases
            cat_ca_total = sum(
                min(float(p.final_amount), float(p.final_amount) * ((ia_rate + aa_rate) / 100.0))
                for p in cat_purchases
            )
            est_deductible = round(cat_ca_total, 2)
            if not notes:
                notes = f"{ia_rate:.0f}% IA + {aa_rate:.0f}% AA"
        elif treatment == "prepayment":
            total_prepayments += cat_total
            if not notes:
                notes = "Prepaid expense - balance sheet asset."
        elif treatment == "deposit":
            total_deposits += cat_total
            if not notes:
                notes = "Rental/Other deposit - balance sheet asset."
        elif treatment == "owner_drawing":
            total_owner_drawings += cat_total
            if not notes:
                notes = "Personal drawing - non-business deduction."

        deductions_by_category.append(
            ExpenseCategoryDeduction(
                category=cat_name,
                total_recorded=round(cat_total, 2),
                tax_treatment=treatment,
                estimated_deductible=round(est_deductible, 2),
                requires_review=req_review,
                notes=notes,
            )
        )

    # Calculate Total Capital Allowance
    total_capital_allowance = sum(ca.total_allowance for ca in capital_allowance_details)

    # 8. Tax Reconciliation to Estimated Chargeable Income
    # Profit Before Tax = Revenue - Expenses (where Expenses includes ALL recorded purchases).
    # Tax Add-backs (expenses subtracted in PBT that are NOT allowable tax deductions in current year):
    # + Non-Deductible Expenses
    # + Conditional Expenses (until reviewed)
    # + Fixed Asset Purchase Costs (capitalized for tax, replaced by Capital Allowance)
    # + Prepayments / Deposits / Owner Drawings
    tax_addbacks = (
        total_non_deductible
        + total_conditional
        + total_ca_purchase_cost
        + total_prepayments
        + total_deposits
        + total_owner_drawings
    )

    # Net Tax Adjustments = Tax Addbacks - Capital Allowance
    tax_adjustments = tax_addbacks - total_capital_allowance

    chargeable_income = max(0.0, profit_before_tax + tax_adjustments)

    if taxpayer_type == "individual_business":
        other_personal_taxable_income = float(getattr(company, "other_personal_taxable_income", 0.0) or 0.0)
    else:
        other_personal_taxable_income = 0.0

    combined_taxable_income = chargeable_income + other_personal_taxable_income

    # 9. Progressive Tax Payable Calculation
    brackets_stmt = (
        select(TaxRateBracket)
        .where(TaxRateBracket.tax_rule_set_id == rule_set.id)
        .order_by(TaxRateBracket.sequence)
    )
    brackets = session.exec(brackets_stmt).all()

    tax_brackets_breakdown: list[TaxBracketBreakdown] = []
    estimated_tax_payable = 0.0
    marginal_tax_rate = 0.0
    rem_income = combined_taxable_income

    for b in brackets:
        min_amt = float(b.min_amount)
        max_amt = float(b.max_amount) if b.max_amount is not None else None
        rate = float(b.rate)

        if combined_taxable_income > min_amt:
            if max_amt is not None:
                bracket_capacity = max_amt - min_amt
                taxable_in_bracket = min(rem_income, bracket_capacity)
            else:
                taxable_in_bracket = rem_income

            taxable_in_bracket = max(0.0, taxable_in_bracket)
            bracket_tax = taxable_in_bracket * (rate / 100.0)

            if taxable_in_bracket > 0:
                marginal_tax_rate = rate
                rem_income -= taxable_in_bracket

            estimated_tax_payable += bracket_tax

            tax_brackets_breakdown.append(
                TaxBracketBreakdown(
                    bracket=b.description,
                    min_amount=min_amt,
                    max_amount=max_amt,
                    taxable_amount=round(taxable_in_bracket, 2),
                    rate=rate,
                    tax=round(bracket_tax, 2),
                )
            )
        else:
            # Bracket not reached
            tax_brackets_breakdown.append(
                TaxBracketBreakdown(
                    bracket=b.description,
                    min_amount=min_amt,
                    max_amount=max_amt,
                    taxable_amount=0.0,
                    rate=rate,
                    tax=0.0,
                )
            )

    effective_tax_rate = (
        (estimated_tax_payable / combined_taxable_income * 100.0) if combined_taxable_income > 0 else 0.0
    )

    # 10. Query Tax Payments
    payments_stmt = select(TaxPayment).where(
        TaxPayment.company_id == company_id,
        TaxPayment.tax_year == tax_year,
    )
    payments = session.exec(payments_stmt).all()
    tax_paid = sum(float(p.amount) for p in payments)

    if estimated_tax_payable >= tax_paid:
        tax_remaining = estimated_tax_payable - tax_paid
        overpaid_amount = 0.0
    else:
        tax_remaining = 0.0
        overpaid_amount = tax_paid - estimated_tax_payable

    if len(payments) == 0:
        warnings.append(f"No tax payments have been recorded for {tax_year}.")

    return TaxAdvisorAnalysis(
        company_id=company_id,
        tax_year=tax_year,
        taxpayer_type=taxpayer_type,
        revenue=round(revenue, 2),
        expenses=round(expenses, 2),
        profit_before_tax=round(profit_before_tax, 2),
        deductible_expenses=round(total_deductible, 2),
        conditional_expenses=round(total_conditional, 2),
        non_deductible_expenses=round(total_non_deductible, 2),
        capital_allowance=round(total_capital_allowance, 2),
        tax_adjustments=round(tax_adjustments, 2),
        chargeable_income=round(chargeable_income, 2),
        other_personal_taxable_income=round(other_personal_taxable_income, 2),
        combined_taxable_income=round(combined_taxable_income, 2),
        estimated_tax_payable=round(estimated_tax_payable, 2),
        effective_tax_rate=round(effective_tax_rate, 2),
        marginal_tax_rate=round(marginal_tax_rate, 2),
        tax_paid=round(tax_paid, 2),
        tax_remaining=round(tax_remaining, 2),
        overpaid_amount=round(overpaid_amount, 2),
        tax_brackets=tax_brackets_breakdown,
        deductions_by_category=deductions_by_category,
        capital_allowance_details=capital_allowance_details,
        requires_review=requires_review_items,
        warnings=warnings,
    )
