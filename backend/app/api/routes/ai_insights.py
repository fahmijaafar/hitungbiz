import json
import time
from collections import defaultdict
from datetime import date, datetime, timezone
from typing import Any, Literal, Optional

import httpx
from dateutil.relativedelta import relativedelta
from fastapi import APIRouter, HTTPException, Path, Query
from sqlmodel import and_, select

from app.api.deps import CurrentUser, SessionDep, VerifiedUser
from app.core.ai_logger import log_ai_request, validate_ai_prompt
from app.core.ai_security import safe_call_ai
from app.core.config import settings
from app.core.rate_limiter import check_tier4_ai_limit, limiter
from app.models import (
    AIFinancialSummary,
    AIKeyMetric,
    AIRecommendation,
    BankAccount,
    Company,
    CompanyAISummary,
    Product,
    Purchase,
    ReceiptParseRequest,
    ReceiptParseResult,
    Sale,
)
from app.services.entitlement_service import (
    LimitReachedException,
    check_entitlement,
    limit_reached_detail,
    record_entitled_usage,
)

router = APIRouter(prefix="/ai", tags=["ai"])


SYSTEM_PROMPT = """You are a senior financial analyst for a small/medium business \
accounting platform. You will be given a JSON "financial fact sheet" with \
pre-computed metrics for one company over a specific period. All figures are \
already calculated and correct — never recompute or invent numbers; only use \
values present in the JSON.

Rules:
- Base every statement strictly on the provided data. If something cannot be \
determined from the data, say so.
- Use the company's currency for all amounts.
- Be concise, concrete, and actionable. Avoid generic advice.
- Flag risks (negative trends, overdue payables, thin margins, high refund or \
discount rates, low stock).
- Do not give regulated tax, legal, or investment advice; frame suggestions as \
operational considerations.

Return ONLY a valid JSON object (no markdown, no code fences) with this exact \
structure:
{
  "headline": "one-sentence overall financial health verdict",
  "summary": "2-4 sentence plain-language overview for a non-accountant owner",
  "key_metrics": [ { "label": "...", "value": "...", "trend": "up|down|flat" } ],
  "strengths": ["..."],
  "concerns": ["..."],
  "recommendations": [
    { "title": "...", "rationale": "tied to a specific number", "priority": "high|medium|low" }
  ]
}"""


# Flat list of allowed expense categories (mirrors the frontend constant).
RECEIPT_CATEGORIES = [
    # Cost of Sales
    "Stock / Raw Materials",
    "Direct Labour",
    "Subcontractor Fees",
    "Freight In",

    # Employee Expenses
    "Salary & Wages",
    "EPF",
    "SOCSO & EIS",
    "Employee Medical Expenses",
    "Staff Claims",
    "Training",
    "Recruitment",

    # Premises & Utilities
    "Office / Premises Rent",
    "Equipment / Machinery Rental",
    "Utilities",
    "Telephone & Internet",
    "Repairs & Maintenance",

    # Office & Administrative
    "Office Supplies & Stationery",
    "Books & Publications",
    "Software & Subscriptions",
    "Domain & Hosting",
    "Postage & Courier",

    # Sales & Marketing
    "Marketing & Advertising",
    "Website & Social Media",
    "Sales Commission",
    "Promotion",
    "Entertainment",
    "Client Gifts",

    # Travel & Transportation
    "Business Travel",
    "Transportation",
    "Accommodation",
    "Mileage & Parking",
    "Tolls",

    # Professional & Compliance
    "Accounting Fees",
    "Audit Fees",
    "Legal Fees",
    "Tax Agent Fees",
    "Secretarial Fees",
    "Consultancy Fees",
    "Business Licence Renewal",

    # Insurance
    "Business Insurance",
    "Fire & Theft Insurance",
    "Other Business Insurance",

    # Financial Expenses
    "Bank Charges",
    "Interest Expense",
    "Business Financing Interest",
    "FX Loss",
    "Bad Debts",

    # Fixed Assets
    "Computer & ICT Equipment",
    "Office Equipment",
    "Furniture & Fittings",
    "Plant & Machinery",
    "Motor Vehicles",
    "Other Fixed Assets",
    "Small Value Assets",

    # Renovation & Improvements
    "Renovation",
    "Office Construction",
    "Premises Improvements",

    # Business Setup & Registration
    "Business Registration",
    "Initial Licence Fees",
    "Business Incorporation / Setup Costs",

    # Deposits & Prepayments
    "Rental Deposit",
    "Prepaid Rent",
    "Prepaid Insurance",
    "Other Deposits",
    "Other Prepayments",

    # Owner & Personal
    "Owner Salary / Wages",
    "Owner Drawings",
    "Personal Expenses",
    "Personal Travel",
    "Stock Withdrawn for Personal Use",

    # Tax & Non-Deductible
    "Income Tax",
    "Traffic Fines",
    "Penalties & Compounds",
    "Political Donations",
    "Religious / Other Donations",
    "Non-Deductible Legal Fees",

    # Other Expenses
    "Miscellaneous Business Expense",
    "Other Non-Deductible Expense",
]

AIInsightModuleType = Literal[
    "financial_summary",
]

FINANCIAL_SUMMARY_MODULE = "financial_summary"

AI_INSIGHT_MODULE_PROMPTS: dict[str, str] = {
    "financial_summary": (
        "Provide an executive overview of the company's financial performance, "
        "including key highlights, strengths, concerns, and actionable "
        "recommendations."
    ),
}


RECEIPT_SYSTEM_PROMPT = """You are an expert at reading messy OCR text from \
scanned purchase receipts and invoices, and turning it into structured expense \
data. The OCR text may contain noise, misread characters, and broken line \
breaks — use judgement to recover the correct values.

Extract these fields for a single expense/bill record:
- supplier_name: the merchant/vendor/supplier name (usually near the top).
- date: the transaction/invoice date in strict YYYY-MM-DD format. Resolve \
ambiguous formats sensibly; assume day-first (DD/MM/YYYY) unless clearly \
otherwise. Expand 2-digit years to 20YY.
- due_date: payment due date in YYYY-MM-DD if present, else null.
- invoice_no: the invoice/receipt/document number if present, else "".
- amount: the pre-tax subtotal as a number. If only a single grand total is \
shown with no separate tax, set amount to that total and tax to 0.
- tax: the tax/GST/SST/VAT amount as a number (not a percentage). 0 if none.
- category: choose EXACTLY ONE value from the allowed category list provided. \
Pick the best fit based on the supplier and line items. If unsure, use \
"Miscellaneous".
- description: a short note (max ~150 chars) summarising what was purchased.

Rules:
- Use only information present in the OCR text. Never invent a supplier, \
invoice number, or amount that is not supported by the text.
- Numbers must be plain numbers (e.g. 1234.50), no currency symbols or commas.
- If a field genuinely cannot be determined, use null (or "" for strings, 0 \
for amount/tax).
- category MUST be one of the allowed values, copied verbatim.

Return ONLY a valid JSON object (no markdown, no code fences) with this exact \
structure:
{
  "supplier_name": "string|null",
  "date": "YYYY-MM-DD|null",
  "due_date": "YYYY-MM-DD|null",
  "invoice_no": "string",
  "amount": number,
  "tax": number,
  "category": "one of the allowed categories",
  "description": "string"
}"""


def _resolve_range(period: str) -> tuple[Optional[datetime], Optional[datetime]]:
    now = datetime.now(timezone.utc)
    if period == "all_time":
        return None, None
    if period == "this_week":
        start = now.replace(hour=0, minute=0, second=0, microsecond=0) - relativedelta(
            days=now.weekday()
        )
        return start, now
    if period == "last_7_days":
        return now - relativedelta(days=7), now
    if period == "month_to_date":
        return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0), now
    if period == "year_to_date":
        return now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0), now
    if period == "last_12_months":
        return now - relativedelta(months=12), now
    # default last_6_months
    return now - relativedelta(months=6), now


def _sales_for(session: SessionDep, company_id, start, end) -> list[Sale]:
    conditions = []
    if company_id:
        conditions.append(Sale.company_id == company_id)
    if start and end:
        conditions.append(Sale.date >= start.date())
        conditions.append(Sale.date <= end.date())
    stmt = select(Sale).where(and_(*conditions)) if conditions else select(Sale)
    return list(session.exec(stmt).all())


def _purchases_for(session: SessionDep, company_id, start, end) -> list[Purchase]:
    conditions = []
    if company_id:
        conditions.append(Purchase.company_id == company_id)
    if start and end:
        conditions.append(Purchase.date >= start)
        conditions.append(Purchase.date <= end)
    stmt = select(Purchase).where(and_(*conditions)) if conditions else select(Purchase)
    return list(session.exec(stmt).all())


def _pct_change(current: float, previous: float) -> Optional[float]:
    if previous == 0:
        return None
    return round((current - previous) / previous * 100, 1)


def _build_fact_sheet(
    session: SessionDep, company_id, period: str
) -> dict[str, Any]:
    start, end = _resolve_range(period)

    company = session.get(Company, company_id) if company_id else None
    currency = company.currency if company else ""
    company_name = company.company_name if company else ""

    # Build company profile dict; include optional fields only when set
    company_profile: dict[str, Any] = {
        "name": company_name,
        "currency": currency,
    }
    if company:
        company_profile["registration_number"] = company.registration_number
        company_profile["email"] = company.company_email
        company_profile["phone"] = company.phone_number
        company_profile["einvoice_required"] = company.einvoice_required
        # Optional fields — only include when the company has filled them in
        if company.company_url:
            company_profile["website"] = company.company_url
        if company.company_address:
            company_profile["address"] = company.company_address
        if company.business_industry:
            company_profile["business_industry"] = company.business_industry
        if company.company_type:
            company_profile["company_type"] = company.company_type
        if company.employee_size:
            company_profile["employee_size"] = company.employee_size
        if company.financial_year_end:
            company_profile["financial_year_end"] = company.financial_year_end
        if company.sst_registration_number:
            company_profile["sst_registration_number"] = company.sst_registration_number
        if getattr(company, "other_personal_taxable_income", None) is not None:
            company_profile["other_personal_taxable_income"] = float(company.other_personal_taxable_income)

    sales = _sales_for(session, company_id, start, end)
    purchases = _purchases_for(session, company_id, start, end)

    revenue = sum(float(s.final_amount) for s in sales)
    expenses = sum(float(p.final_amount) for p in purchases)
    net_profit = revenue - expenses
    gross_margin_pct = round(net_profit / revenue * 100, 1) if revenue else None

    gross = sum(float(s.gross_amount) for s in sales)
    discount = sum(float(s.discount) for s in sales)
    refund = sum(float(s.refund) for s in sales)
    cancel = sum(float(s.cancel_amount) for s in sales)
    discount_rate = round(discount / gross * 100, 1) if gross else 0.0
    refund_rate = round(refund / gross * 100, 1) if gross else 0.0

    # Previous comparable period (same length immediately before `start`)
    prev_revenue = prev_expenses = None
    if start and end:
        span = end - start
        prev_start = start - span
        prev_end = start
        prev_sales = _sales_for(session, company_id, prev_start, prev_end)
        prev_purchases = _purchases_for(session, company_id, prev_start, prev_end)
        prev_revenue = sum(float(s.final_amount) for s in prev_sales)
        prev_expenses = sum(float(p.final_amount) for p in prev_purchases)

    # Monthly trend
    sale_buckets: dict[str, float] = defaultdict(float)
    purchase_buckets: dict[str, float] = defaultdict(float)
    for s in sales:
        sale_buckets[s.date.strftime("%Y-%m")] += float(s.final_amount)
    for p in purchases:
        purchase_buckets[p.date.strftime("%Y-%m")] += float(p.final_amount)
    months = sorted(set(sale_buckets) | set(purchase_buckets))
    monthly = [
        {
            "month": m,
            "revenue": round(sale_buckets.get(m, 0), 2),
            "expenses": round(purchase_buckets.get(m, 0), 2),
        }
        for m in months
    ]

    # Sales by channel
    channel_buckets: dict[str, float] = defaultdict(float)
    for s in sales:
        channel_buckets[s.channel or "Unknown"] += float(s.final_amount)
    sales_by_channel = [
        {"channel": k, "total": round(v, 2)}
        for k, v in sorted(channel_buckets.items(), key=lambda x: x[1], reverse=True)
    ][:5]

    # Top expense categories & suppliers
    category_buckets: dict[str, float] = defaultdict(float)
    supplier_buckets: dict[str, float] = defaultdict(float)
    for p in purchases:
        category_buckets[p.category or "Uncategorized"] += float(p.final_amount)
        supplier_buckets[p.supplier_name or "Unknown"] += float(p.final_amount)
    top_expense_categories = [
        {"category": k, "total": round(v, 2)}
        for k, v in sorted(category_buckets.items(), key=lambda x: x[1], reverse=True)
    ][:5]
    top_suppliers = [
        {"supplier": k, "total": round(v, 2)}
        for k, v in sorted(supplier_buckets.items(), key=lambda x: x[1], reverse=True)
    ][:5]

    # Overdue / unpaid bills (across all time, not just the window)
    bill_conditions = [Purchase.company_id == company_id] if company_id else []
    all_bills_stmt = (
        select(Purchase).where(and_(*bill_conditions))
        if bill_conditions
        else select(Purchase)
    )
    all_bills = list(session.exec(all_bills_stmt).all())
    today = date.today()
    overdue = [
        b
        for b in all_bills
        if b.due_date
        and b.due_date < today
        and (b.status or "").lower() not in {"paid", "completed"}
    ]
    overdue_bills = {
        "count": len(overdue),
        "amount": round(sum(float(b.final_amount) for b in overdue), 2),
    }

    # Products: low stock & margins
    prod_conditions = [Product.company_id == company_id] if company_id else []
    prod_stmt = (
        select(Product).where(and_(*prod_conditions))
        if prod_conditions
        else select(Product)
    )
    products = list(session.exec(prod_stmt).all())
    low_stock = [
        {"name": p.product_name, "stock": round(float(p.stock_quantity), 2)}
        for p in products
        if float(p.stock_quantity) <= 5
    ][:10]

    # Cash position from bank accounts (opening balances)
    bank_conditions = [BankAccount.company_id == company_id] if company_id else []
    bank_stmt = (
        select(BankAccount).where(and_(*bank_conditions))
        if bank_conditions
        else select(BankAccount)
    )
    banks = list(session.exec(bank_stmt).all())
    cash_position = round(sum(float(b.opening_balance) for b in banks), 2)

    return {
        "company": company_profile,
        "period": {
            "label": period,
            "start": start.date().isoformat() if start else None,
            "end": end.date().isoformat() if end else None,
        },
        "totals": {
            "revenue": round(revenue, 2),
            "expenses": round(expenses, 2),
            "net_profit": round(net_profit, 2),
            "gross_margin_pct": gross_margin_pct,
        },
        "comparison_prev_period": {
            "revenue_change_pct": _pct_change(revenue, prev_revenue)
            if prev_revenue is not None
            else None,
            "expenses_change_pct": _pct_change(expenses, prev_expenses)
            if prev_expenses is not None
            else None,
        },
        "monthly": monthly,
        "sales_by_channel": sales_by_channel,
        "top_expense_categories": top_expense_categories,
        "top_suppliers": top_suppliers,
        "refund_rate_pct": refund_rate,
        "discount_rate_pct": discount_rate,
        "cancellation_amount": round(cancel, 2),
        "overdue_bills": overdue_bills,
        "low_stock_products": low_stock,
        "cash_position": cash_position,
        "counts": {"sales": len(sales), "purchases": len(purchases)},
    }


async def _call_deepseek(
    messages: list[dict[str, str]],
    user_id: str = "system",
    company_id: str | None = None,
    endpoint: str = "/api/v1/ai/insight",
) -> dict[str, Any]:
    """Delegates AI calls to centralized, secure safe_call_ai service."""
    return await safe_call_ai(
        messages=messages,
        user_id=user_id,
        company_id=company_id,
        endpoint=endpoint,
        temperature=0.2,
        response_format={"type": "json_object"},
    )


@router.get("/financial-summary", response_model=AIFinancialSummary)
def read_financial_summary(
    session: SessionDep,
    current_user: VerifiedUser,
) -> Any:
    """
    Return the stored, company-level AI financial summary (the single latest
    record shared by all users of the company). Returns 404 if none has been
    generated yet, so the frontend can show the initial "Generate" state.
    """
    record = session.exec(
        select(CompanyAISummary).where(
            CompanyAISummary.company_id == current_user.company_id,
            CompanyAISummary.module_type == FINANCIAL_SUMMARY_MODULE,
        )
    ).first()
    if not record:
        raise HTTPException(
            status_code=404,
            detail="No financial summary has been generated yet.",
        )
    return AIFinancialSummary.model_validate(record.data)


async def _generate_ai_insight(
    session: SessionDep,
    company_id: str,
    module_type: str,
    period: str,
    user_id: str = "system",
) -> AIFinancialSummary:
    if not settings.ai_summary_enabled:
        raise HTTPException(
            status_code=503,
            detail="AI summary is not configured. Set DEEPSEEK_API_KEY.",
        )

    fact_sheet = _build_fact_sheet(session, company_id, period)

    if not AI_INSIGHT_MODULE_PROMPTS.get(module_type):
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported module_type '{module_type}'.",
        )

    prompt = AI_INSIGHT_MODULE_PROMPTS.get(
        module_type, AI_INSIGHT_MODULE_PROMPTS[FINANCIAL_SUMMARY_MODULE]
    )

    parsed = await _call_deepseek(
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": (
                    "Analyze this financial fact sheet:\n"
                    + json.dumps(fact_sheet, ensure_ascii=False)
                    + "\n\nFocus on: "
                    + prompt
                ),
            },
        ],
        user_id=user_id,
        company_id=company_id,
        endpoint=f"/api/v1/ai/insight/{module_type}",
    )

    return AIFinancialSummary(
        headline=str(parsed.get("headline", "")),
        summary=str(parsed.get("summary", "")),
        period=period,
        key_metrics=[
            AIKeyMetric(
                label=str(m.get("label", "")),
                value=str(m.get("value", "")),
                trend=str(m.get("trend", "flat")),
            )
            for m in parsed.get("key_metrics", [])
            if isinstance(m, dict)
        ],
        strengths=[str(s) for s in parsed.get("strengths", [])],
        concerns=[str(c) for c in parsed.get("concerns", [])],
        recommendations=[
            AIRecommendation(
                title=str(r.get("title", "")),
                rationale=str(r.get("rationale", "")),
                priority=str(r.get("priority", "medium")),
            )
            for r in parsed.get("recommendations", [])
            if isinstance(r, dict)
        ],
        fact_sheet=fact_sheet,
        generated_at=datetime.now(timezone.utc),
    )


@router.post("/financial-summary", response_model=AIFinancialSummary)
async def generate_financial_summary(
    session: SessionDep,
    current_user: VerifiedUser,
    period: str = Query(
        "last_6_months",
        description=(
            "Preset period: this_week, last_7_days, month_to_date, "
            "year_to_date, last_6_months, last_12_months, all_time"
        ),
    ),
) -> Any:
    """
    Generate (or regenerate) the AI financial summary for the current user's
    company and persist it as the company-wide latest summary.

    Metrics are aggregated deterministically in Python, then passed to the
    DeepSeek model purely for interpretation and recommendations.
    """
    if not current_user.is_superuser:
        try:
            check_entitlement(session, current_user, "ai_summary")
        except LimitReachedException as exc:
            raise HTTPException(status_code=403, detail=limit_reached_detail(exc)) from exc

    summary = await _generate_ai_insight(
        session,
        str(current_user.company_id),
        FINANCIAL_SUMMARY_MODULE,
        period,
        user_id=str(current_user.id),
    )

    payload = summary.model_dump(mode="json")
    record = session.exec(
        select(CompanyAISummary).where(
            CompanyAISummary.company_id == current_user.company_id,
            CompanyAISummary.module_type == FINANCIAL_SUMMARY_MODULE,
        )
    ).first()
    if record:
        record.data = payload
        record.period = period
        record.updated_at = summary.generated_at
        session.add(record)
    else:
        record = CompanyAISummary(
            company_id=current_user.company_id,
            module_type=FINANCIAL_SUMMARY_MODULE,
            period=period,
            data=payload,
            updated_at=summary.generated_at,
        )
        session.add(record)
    if not current_user.is_superuser:
        try:
            record_entitled_usage(session, current_user, feature="ai_summary")
        except LimitReachedException as exc:
            session.rollback()
            raise HTTPException(status_code=403, detail=limit_reached_detail(exc)) from exc
    session.commit()

    return summary


@router.get("/insights/{module_type}", response_model=AIFinancialSummary)
def read_ai_insight(
    session: SessionDep,
    current_user: VerifiedUser,
    module_type: AIInsightModuleType = Path(...),
) -> Any:
    """
    Return the stored, company-level AI insight for the requested module.
    Returns 404 if none has been generated yet.
    """
    record = session.exec(
        select(CompanyAISummary).where(
            CompanyAISummary.company_id == current_user.company_id,
            CompanyAISummary.module_type == module_type,
        )
    ).first()
    if not record:
        raise HTTPException(
            status_code=404,
            detail="No AI insight has been generated for this module yet.",
        )
    return AIFinancialSummary.model_validate(record.data)


@router.post("/insights/{module_type}", response_model=AIFinancialSummary)
async def generate_ai_insight_route(
    session: SessionDep,
    current_user: VerifiedUser,
    module_type: AIInsightModuleType = Path(...),
    period: str = Query(
        "last_6_months",
        description=(
            "Preset period: this_week, last_7_days, month_to_date, "
            "year_to_date, last_6_months, last_12_months, all_time"
        ),
    ),
) -> Any:
    """
    Generate or regenerate an AI insight for the requested module.
    """
    if not current_user.is_superuser and module_type == FINANCIAL_SUMMARY_MODULE:
        try:
            check_entitlement(session, current_user, "ai_summary")
        except LimitReachedException as exc:
            raise HTTPException(status_code=403, detail=limit_reached_detail(exc)) from exc

    summary = await _generate_ai_insight(
        session, current_user.company_id, module_type, period
    )

    payload = summary.model_dump(mode="json")
    record = session.exec(
        select(CompanyAISummary).where(
            CompanyAISummary.company_id == current_user.company_id,
            CompanyAISummary.module_type == module_type,
        )
    ).first()
    if record:
        record.data = payload
        record.period = period
        record.updated_at = summary.generated_at
        session.add(record)
    else:
        record = CompanyAISummary(
            company_id=current_user.company_id,
            module_type=module_type,
            period=period,
            data=payload,
            updated_at=summary.generated_at,
        )
        session.add(record)
    if not current_user.is_superuser and module_type == FINANCIAL_SUMMARY_MODULE:
        try:
            record_entitled_usage(session, current_user, feature="ai_summary")
        except LimitReachedException as exc:
            session.rollback()
            raise HTTPException(status_code=403, detail=limit_reached_detail(exc)) from exc
    session.commit()

    return summary


def _clean_date(value: Any) -> Optional[str]:
    """Validate an AI-supplied date is real and normalized to YYYY-MM-DD."""
    if not value or not isinstance(value, str):
        return None
    try:
        return date.fromisoformat(value.strip()).isoformat()
    except ValueError:
        return None


def _clean_number(value: Any) -> Optional[float]:
    if value is None or value == "":
        return None
    try:
        return round(float(value), 2)
    except (TypeError, ValueError):
        return None


def _clean_category(value: Any) -> Optional[str]:
    if not value or not isinstance(value, str):
        return None
    candidate = value.strip()
    if candidate in RECEIPT_CATEGORIES:
        return candidate
            # Case-insensitive match as a tolerant fallback.
    lowered = candidate.lower()
    for allowed in RECEIPT_CATEGORIES:
        if allowed.lower() == lowered:
            return allowed
    return None


@router.post("/parse-receipt", response_model=ReceiptParseResult)
async def parse_receipt(
    body: ReceiptParseRequest,
    session: SessionDep,
    current_user: VerifiedUser,
) -> Any:
    """
    Turn raw OCR receipt text into structured expense fields using DeepSeek.

    The model is constrained to a strict schema aligned with the Purchase
    model; the response is validated server-side before being returned so the
    frontend only ever receives clean, well-typed suggestions.
    """
    if not settings.ai_summary_enabled:
        raise HTTPException(
            status_code=503,
            detail="AI receipt parsing is not configured. Set DEEPSEEK_API_KEY.",
        )
    if not current_user.is_superuser:
        try:
            check_entitlement(session, current_user, "ocr")
        except LimitReachedException as exc:
            raise HTTPException(status_code=403, detail=limit_reached_detail(exc)) from exc

    user_id_str = str(current_user.id)
    company_id_str = str(current_user.company_id)

    parsed = await _call_deepseek(
        [
            {"role": "system", "content": RECEIPT_SYSTEM_PROMPT},
            {
                "role": "user",
                "content": (
                    "Allowed categories (choose exactly one): "
                    + json.dumps(RECEIPT_CATEGORIES, ensure_ascii=False)
                    + "\n\nReceipt OCR text:\n"
                    + body.text
                ),
            },
        ],
        user_id=user_id_str,
        company_id=company_id_str,
        endpoint="/api/v1/ai/parse-receipt",
    )

    supplier = parsed.get("supplier_name")
    invoice_no = parsed.get("invoice_no")
    description = parsed.get("description")

    result = ReceiptParseResult(
        supplier_name=str(supplier).strip() if supplier else None,
        date=_clean_date(parsed.get("date")),
        due_date=_clean_date(parsed.get("due_date")),
        category=_clean_category(parsed.get("category")),
        invoice_no=str(invoice_no).strip() if invoice_no else None,
        amount=_clean_number(parsed.get("amount")),
        tax=_clean_number(parsed.get("tax")),
        description=str(description).strip()[:200] if description else None,
    )
    if not current_user.is_superuser:
        try:
            record_entitled_usage(session, current_user, feature="ocr")
        except LimitReachedException as exc:
            session.rollback()
            raise HTTPException(status_code=403, detail=limit_reached_detail(exc)) from exc
        session.commit()
    return result
