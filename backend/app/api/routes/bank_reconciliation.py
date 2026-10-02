import csv
import datetime as dt
import io
import json
import re
import uuid
import zipfile
from typing import Any
from xml.etree import ElementTree

import httpx
from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile
from sqlmodel import col, func, select

from app.api.deps import CurrentUser, SessionDep, VerifiedUser
from app.core.ai_security import safe_call_ai
from app.core.config import settings
from app.services.audit_logger import AuditAction, AuditLogger, AuditModule
from app.services.entitlement_service import (
    LimitReachedException,
    check_entitlement,
    limit_reached_detail,
    record_entitled_usage,
)
from app.models import (
    BankImportSession,
    BankImportSessionPublic,
    BankImportSessionsPublic,
    BankImportTransaction,
    BankImportTransactionPublic,
    BankReconciliationApplyRequest,
    BankReconciliationApplyResponse,
    BankReconciliationBulkUpdate,
    BankReconciliationSessionDetail,
    BankReconciliationSummary,
    BankReconciliationTransactionUpdate,
    BankReconciliationUploadResponse,
    Purchase,
    Sale,
    get_datetime_utc,
)

router = APIRouter(prefix="/bank-reconciliation", tags=["bank-reconciliation"])

DATE_HEADERS = {"date", "transaction date", "posting date", "value date"}
DESCRIPTION_HEADERS = {"description", "details", "narration", "transaction", "memo"}
REFERENCE_HEADERS = {"reference", "ref", "reference no", "cheque no", "transaction id"}
DEBIT_HEADERS = {"debit", "withdrawal", "withdrawals", "money out", "paid out"}
CREDIT_HEADERS = {"credit", "deposit", "deposits", "money in", "paid in"}
AMOUNT_HEADERS = {"amount", "transaction amount"}
BALANCE_HEADERS = {"balance", "running balance", "available balance"}

EXPENSE_CATEGORIES = {
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
}

CATEGORY_RULES: list[tuple[tuple[str, ...], str, str, str, int]] = [
    # Sales & Marketing
    (("facebook", "meta", "google ads", "tiktok ads", "advertisement", "marketing"), "Expense", "Marketing & Advertising", "Create Expense", 98),
    (("shopee", "lazada", "stripe", "senangpay", "ipay88", "settlement"), "Revenue", "Sales Income", "Create Revenue", 94),

    # Employee Expenses
    (("salary", "payroll", "gaji", "wages"), "Expense", "Salary & Wages", "Create Expense", 96),
    (("kwsp", "epf"), "Expense", "EPF", "Create Expense", 96),
    (("socso", "perkeso", "eis"), "Expense", "SOCSO & EIS", "Create Expense", 96),
    (("clinic", "klinik", "hospital", "doctor", "medical claim"), "Expense", "Employee Medical Expenses", "Create Expense", 92),
    (("training", "course", "workshop", "seminar"), "Expense", "Training", "Create Expense", 90),
    (("recruitment", "jobstreet", "linkedin ads", "headhunter"), "Expense", "Recruitment", "Create Expense", 90),

    # Travel & Transportation
    (("petronas", "shell", "bhp", "caltex", "fuel", "petrol"), "Expense", "Transportation", "Create Expense", 94),
    (("grab", "taxi", "bus", "train", "ktm", "lrt", "mrt"), "Expense", "Transportation", "Create Expense", 92),
    (("parking", "valet"), "Expense", "Mileage & Parking", "Create Expense", 92),
    (("touch n go", "tng", "toll", "plus toll"), "Expense", "Tolls", "Create Expense", 92),
    (("hotel", "airbnb", "agoda", "booking.com"), "Expense", "Accommodation", "Create Expense", 94),
    (("airasia", "malaysia airlines", "batik air", "flight"), "Expense", "Business Travel", "Create Expense", 94),

    # Premises & Utilities
    (("rent", "rental", "sewa"), "Expense", "Office / Premises Rent", "Create Expense", 95),
    (("tnb", "tenaga", "syabas", "air selangor", "utility", "utilities", "electricity", "water bill"), "Expense", "Utilities", "Create Expense", 95),
    (("unifi", "tm", "maxis", "digi", "celcom", "time dotcom", "umobile", "broadband", "internet"), "Expense", "Telephone & Internet", "Create Expense", 95),
    (("repairs", "maintenance", "servicing", "aircond service"), "Expense", "Repairs & Maintenance", "Create Expense", 90),

    # Office & Administrative
    (("software", "saas", "subscription", "aws", "github", "google cloud", "openai", "claude", "microsoft", "adobe", "zoom", "slack", "notion", "figma", "canva"), "Expense", "Software & Subscriptions", "Create Expense", 95),
    (("domain", "hosting", "godaddy", "namecheap", "exabytes"), "Expense", "Domain & Hosting", "Create Expense", 95),
    (("poslaju", "dhl", "fedex", "j&t", "ninja van", "courier", "postage"), "Expense", "Postage & Courier", "Create Expense", 94),
    (("stationery", "office supplies", "paper", "cartridge"), "Expense", "Office Supplies & Stationery", "Create Expense", 90),

    # Professional & Compliance
    (("audit", "auditor"), "Expense", "Audit Fees", "Create Expense", 95),
    (("accounting", "bookkeeping"), "Expense", "Accounting Fees", "Create Expense", 95),
    (("legal", "lawyer", "solicitor"), "Expense", "Legal Fees", "Create Expense", 92),
    (("tax agent", "lhdn fee"), "Expense", "Tax Agent Fees", "Create Expense", 92),
    (("secretarial", "company secretary", "sec fee"), "Expense", "Secretarial Fees", "Create Expense", 95),
    (("consultant", "consultancy", "advisory"), "Expense", "Consultancy Fees", "Create Expense", 90),
    (("ssm", "licence renewal", "license renewal", "majlis perbandaran", "mbpj", "mbsa", "dbkl"), "Expense", "Business Licence Renewal", "Create Expense", 92),

    # Insurance & Financial Expenses
    (("insurance", "takaful", "allianz", "etiqa", "tokio marine", "prudential", "great eastern"), "Expense", "Business Insurance", "Create Expense", 94),
    (("bank fee", "service charge", "charges", "fee"), "Bank Fee", "Bank Charges", "Create Expense", 97),
    (("interest expense", "loan interest", "financing interest"), "Expense", "Interest Expense", "Create Expense", 92),
    (("interest", "profit payment"), "Interest", "Interest Income", "Create Revenue", 92),

    # Fixed Assets & Renovation
    (("apple", "dell", "lenovo", "hp", "laptop", "computer"), "Expense", "Computer & ICT Equipment", "Create Expense", 88),
    (("renovation", "refurbishment"), "Expense", "Renovation", "Create Expense", 90),

    # Owner & Personal
    (("owner salary", "director salary"), "Expense", "Owner Salary / Wages", "Create Expense", 90),
    (("owner drawings", "director drawings"), "Expense", "Owner Drawings", "Create Expense", 88),
    (("owner", "director", "drawings"), "Owner Withdrawal", "Owner Drawings", "Review", 82),

    # Taxes & Fines
    (("traffic fine", "compound", "penalti", "penalty", "saman"), "Expense", "Traffic Fines", "Create Expense", 92),
    (("lhdn tax", "income tax", "cpt207", "cp204"), "Expense", "Income Tax", "Create Expense", 94),

    # Transfers, Loans, Capital
    (("loan", "financing"), "Loan", "Loan", "Review", 78),
    (("transfer", "duitnow", "ibg", "instant transfer"), "Transfer", "Bank Transfer", "Review", 82),
    (("capital", "investment"), "Capital Injection", "Capital Injection", "Review", 82),
]

BANK_STATEMENT_SYSTEM_PROMPT = """
You extract bank statement transactions from OCR text.
Return strict JSON only with this shape:
{
  "bank_name": string | null,
  "statement_start": "YYYY-MM-DD" | null,
  "statement_end": "YYYY-MM-DD" | null,
  "transactions": [
    {
      "date": "YYYY-MM-DD",
      "description": string,
      "reference": string | null,
      "debit": number | null,
      "credit": number | null,
      "amount": number | null,
      "balance": number | null
    }
  ]
}
Rules:
- Use debit for money out and credit for money in when columns are visible.
- If only one signed amount exists, put it in amount; negative means debit, positive means credit.
- Do not invent transactions, dates, references, balances, or bank names.
- Omit OCR headers, footers, page numbers, carried-forward rows, and summary totals unless they are real transactions.
- Normalize all dates to YYYY-MM-DD.
"""


def _normalize_header(value: str) -> str:
    return re.sub(r"\s+", " ", value.strip().lower())


def _parse_number(value: Any) -> float | None:
    if value is None:
        return None
    raw = str(value).strip()
    if not raw:
        return None
    raw = raw.replace(",", "").replace("RM", "").replace("MYR", "").strip()
    negative = raw.startswith("(") and raw.endswith(")")
    raw = raw.strip("()")
    try:
        number = float(raw)
    except ValueError:
        return None
    return -number if negative else number


def _parse_date(value: Any) -> dt.date | None:
    if value is None:
        return None
    raw = str(value).strip()
    if not raw:
        return None
    formats = (
        "%Y-%m-%d",
        "%d/%m/%Y",
        "%m/%d/%Y",
        "%d-%m-%Y",
        "%m-%d-%Y",
        "%d.%m.%Y",
        "%Y/%m/%d",
        "%d %b %Y",
        "%d %B %Y",
    )
    for date_format in formats:
        try:
            return dt.datetime.strptime(raw, date_format).date()
        except ValueError:
            continue
    try:
        return dt.datetime.fromisoformat(raw.replace("Z", "+00:00")).date()
    except ValueError:
        return None


def _pick(row: dict[str, Any], accepted: set[str]) -> Any:
    for key, value in row.items():
        if _normalize_header(key) in accepted:
            return value
    return None


def _extract_rows_from_csv(content: bytes) -> list[dict[str, Any]]:
    text = content.decode("utf-8-sig")
    sample = text[:2048]
    dialect = csv.Sniffer().sniff(sample, delimiters=",;\t|")
    reader = csv.DictReader(io.StringIO(text), dialect=dialect)
    return [dict(row) for row in reader]


def _xlsx_shared_strings(zip_file: zipfile.ZipFile) -> list[str]:
    try:
        xml = zip_file.read("xl/sharedStrings.xml")
    except KeyError:
        return []
    root = ElementTree.fromstring(xml)
    ns = {"x": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    strings: list[str] = []
    for item in root.findall("x:si", ns):
        strings.append("".join(node.text or "" for node in item.findall(".//x:t", ns)))
    return strings


def _column_index(cell_ref: str) -> int:
    letters = "".join(ch for ch in cell_ref if ch.isalpha())
    index = 0
    for char in letters:
        index = index * 26 + (ord(char.upper()) - ord("A") + 1)
    return index - 1


def _extract_rows_from_xlsx(content: bytes) -> list[dict[str, Any]]:
    with zipfile.ZipFile(io.BytesIO(content)) as archive:
        shared_strings = _xlsx_shared_strings(archive)
        sheet_xml = archive.read("xl/worksheets/sheet1.xml")
    root = ElementTree.fromstring(sheet_xml)
    ns = {"x": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    rows: list[list[str]] = []
    for row in root.findall(".//x:sheetData/x:row", ns):
        values: list[str] = []
        for cell in row.findall("x:c", ns):
            index = _column_index(cell.attrib.get("r", "A1"))
            while len(values) <= index:
                values.append("")
            raw_value = cell.findtext("x:v", default="", namespaces=ns)
            if cell.attrib.get("t") == "s" and raw_value:
                values[index] = shared_strings[int(raw_value)]
            else:
                values[index] = raw_value
        if any(value.strip() for value in values):
            rows.append(values)
    if not rows:
        return []
    headers = rows[0]
    return [dict(zip(headers, row, strict=False)) for row in rows[1:]]


def _extract_rows_from_pdf_text(content: bytes) -> list[dict[str, Any]]:
    text = content.decode("latin-1", errors="ignore")
    pattern = re.compile(
        r"(?P<date>\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\s+"
        r"(?P<description>.*?)\s+"
        r"(?P<amount>-?\(?\d[\d,]*\.\d{2}\)?)"
        r"(?:\s+(?P<balance>-?\(?\d[\d,]*\.\d{2}\)?))?$"
    )
    rows: list[dict[str, Any]] = []
    for line in text.splitlines():
        match = pattern.search(" ".join(line.split()))
        if match:
            rows.append(match.groupdict())
    return rows


def _clean_ai_transaction(row: dict[str, Any]) -> dict[str, Any] | None:
    parsed_date = _parse_date(row.get("date"))
    if not parsed_date:
        return None
    description = str(row.get("description") or "").strip()
    if not description:
        return None
    debit = _parse_number(row.get("debit")) or 0.0
    credit = _parse_number(row.get("credit")) or 0.0
    amount = _parse_number(row.get("amount"))
    if amount is None:
        amount = credit - debit
    return {
        "date": parsed_date.isoformat(),
        "description": description,
        "reference": row.get("reference"),
        "debit": debit,
        "credit": credit,
        "amount": amount,
        "balance": _parse_number(row.get("balance")),
    }


async def _extract_rows_from_ai_ocr_text(
    text: str,
    user_id: str = "system",
    company_id: str | None = None,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    if not settings.ai_summary_enabled:
        return [], {}

    try:
        parsed = await safe_call_ai(
            messages=[
                {"role": "system", "content": BANK_STATEMENT_SYSTEM_PROMPT},
                {"role": "user", "content": f"Bank statement OCR text:\n{text.strip()}"},
            ],
            user_id=user_id,
            company_id=company_id,
            endpoint="/api/v1/bank-reconciliation/ai-ocr",
            temperature=0.1,
            response_format={"type": "json_object"},
        )
    except Exception:
        return [], {}

    transactions = []
    for row in parsed.get("transactions") or []:
        if isinstance(row, dict):
            cleaned = _clean_ai_transaction(row)
            if cleaned:
                transactions.append(cleaned)
    return transactions, parsed


def _rows_to_transactions(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    transactions: list[dict[str, Any]] = []
    for row in rows:
        parsed_date = _parse_date(_pick(row, DATE_HEADERS) or row.get("date"))
        if not parsed_date:
            continue
        description = str(_pick(row, DESCRIPTION_HEADERS) or row.get("description") or "").strip()
        if not description:
            description = "Bank transaction"
        reference = _pick(row, REFERENCE_HEADERS)
        debit = _parse_number(_pick(row, DEBIT_HEADERS)) or 0.0
        credit = _parse_number(_pick(row, CREDIT_HEADERS)) or 0.0
        amount = _parse_number(_pick(row, AMOUNT_HEADERS))
        if amount is None:
            amount = credit - debit
        elif debit == 0 and credit == 0:
            if amount < 0:
                debit = abs(amount)
            else:
                credit = amount
        transactions.append(
            {
                "date": parsed_date,
                "description": description,
                "reference": None if reference is None else str(reference).strip() or None,
                "amount": amount,
                "debit": abs(debit),
                "credit": abs(credit),
                "balance": _parse_number(_pick(row, BALANCE_HEADERS) or row.get("balance")),
                "raw_data": row,
            }
        )
    return transactions


def _detect_bank(file_name: str, rows: list[dict[str, Any]]) -> str | None:
    haystack = f"{file_name} {' '.join(str(row) for row in rows[:5])}".lower()
    for bank in ("Maybank", "CIMB", "RHB", "Public Bank", "Hong Leong", "GXBank", "Wise"):
        if bank.lower().replace(" ", "") in haystack.replace(" ", ""):
            return bank
    return None


def _classify(description: str, amount: float) -> tuple[str, str, str, int, str]:
    haystack = description.lower()
    for keywords, tx_type, category, action, confidence in CATEGORY_RULES:
        if any(keyword in haystack for keyword in keywords):
            reason = f"Matched keyword pattern for {category}."
            return tx_type, category, action, confidence, reason
    if amount > 0:
        return "Revenue", "Sales Income", "Create Revenue", 84, "Positive bank movement without an existing match."
    if amount < 0:
        return "Expense", "Miscellaneous Business Expense", "Create Expense", 82, "Negative bank movement without an existing match."
    return "Unknown", "Uncategorised", "Review", 40, "No amount direction or known keyword was found."


def _clean_expense_category(value: str | None) -> str:
    if value in EXPENSE_CATEGORIES:
        return value
    return "Miscellaneous Business Expense"


def _is_ignored(transaction: BankImportTransaction) -> bool:
    return (
        transaction.reconciliation_status == "Ignored"
        or transaction.final_action == "Ignore"
    )


def _match_existing_record(
    session: SessionDep,
    company_id: uuid.UUID | None,
    transaction: dict[str, Any],
) -> tuple[str | None, uuid.UUID | None, int | None, str | None]:
    tx_date: dt.date = transaction["date"]
    amount = abs(float(transaction["amount"]))
    start = tx_date - dt.timedelta(days=3)
    end = tx_date + dt.timedelta(days=3)

    purchase_statement = select(Purchase).where(Purchase.date >= start, Purchase.date <= end)
    sale_statement = select(Sale).where(Sale.date >= start, Sale.date <= end)
    if company_id:
        purchase_statement = purchase_statement.where(Purchase.company_id == company_id)
        sale_statement = sale_statement.where(Sale.company_id == company_id)

    best: tuple[str | None, uuid.UUID | None, int | None, str | None] = (None, None, None, None)
    for purchase in session.exec(purchase_statement).all():
        if abs(abs(float(purchase.final_amount)) - amount) <= 0.01:
            return ("Purchase", purchase.id, 96, "Amount and date match an existing expense.")
    for sale in session.exec(sale_statement).all():
        if abs(abs(float(sale.final_amount)) - amount) <= 0.01:
            best = ("Sale", sale.id, 96, "Amount and date match an existing revenue.")
    return best


def _find_duplicate(
    session: SessionDep,
    company_id: uuid.UUID | None,
    transaction: dict[str, Any],
    session_id: uuid.UUID,
) -> uuid.UUID | None:
    statement = (
        select(BankImportTransaction)
        .where(BankImportTransaction.session_id != session_id)
        .where(BankImportTransaction.date == transaction["date"])
        .where(BankImportTransaction.amount == transaction["amount"])
    )
    if company_id:
        statement = statement.where(BankImportTransaction.company_id == company_id)
    for existing in session.exec(statement).all():
        reference_matches = existing.reference and existing.reference == transaction["reference"]
        description_matches = existing.description.strip().lower() == transaction["description"].strip().lower()
        balance_matches = existing.balance == transaction["balance"] and existing.balance is not None
        if reference_matches or description_matches or balance_matches:
            return existing.id
    return None


def _summary(transactions: list[BankImportTransaction]) -> BankReconciliationSummary:
    return BankReconciliationSummary(
        total=len(transactions),
        matched=len([tx for tx in transactions if tx.reconciliation_status == "Matched"]),
        needs_review=len([tx for tx in transactions if tx.reconciliation_status == "Needs Review"]),
        suggested_expenses=len([tx for tx in transactions if tx.reconciliation_status == "Suggested Expense"]),
        suggested_revenues=len([tx for tx in transactions if tx.reconciliation_status == "Suggested Revenue"]),
        duplicates=len([tx for tx in transactions if tx.reconciliation_status == "Duplicate"]),
        ignored=len([tx for tx in transactions if tx.reconciliation_status == "Ignored"]),
        applied=len([tx for tx in transactions if tx.reconciliation_status == "Applied"]),
    )


def _session_detail(
    session: SessionDep,
    bank_session: BankImportSession,
) -> BankReconciliationSessionDetail:
    transactions = session.exec(
        select(BankImportTransaction)
        .where(BankImportTransaction.session_id == bank_session.id)
        .order_by(col(BankImportTransaction.date), col(BankImportTransaction.created_at))
    ).all()
    return BankReconciliationSessionDetail(
        session=BankImportSessionPublic.model_validate(bank_session),
        transactions=[BankImportTransactionPublic.model_validate(tx) for tx in transactions],
        summary=_summary(list(transactions)),
    )


@router.get("/sessions", response_model=BankImportSessionsPublic)
def read_bank_import_sessions(
    session: SessionDep,
    current_user: VerifiedUser,
    skip: int = 0,
    limit: int = 50,
    company_id: uuid.UUID | None = None,
) -> BankImportSessionsPublic:
    active_company_id = company_id or current_user.company_id
    statement = select(BankImportSession).order_by(col(BankImportSession.created_at).desc()).offset(skip).limit(limit)
    count_statement = select(func.count()).select_from(BankImportSession)
    if active_company_id:
        statement = statement.where(BankImportSession.company_id == active_company_id)
        count_statement = count_statement.where(BankImportSession.company_id == active_company_id)
    sessions = session.exec(statement).all()
    return BankImportSessionsPublic(
        data=[BankImportSessionPublic.model_validate(item) for item in sessions],
        count=session.exec(count_statement).one(),
    )


@router.get("/sessions/{session_id}", response_model=BankReconciliationSessionDetail)
def read_bank_import_session(
    session: SessionDep,
    current_user: VerifiedUser,
    session_id: uuid.UUID,
) -> BankReconciliationSessionDetail:
    bank_session = session.get(BankImportSession, session_id)
    if not bank_session or (current_user.company_id and bank_session.company_id != current_user.company_id):
        raise HTTPException(status_code=404, detail="Bank reconciliation session not found")
    return _session_detail(session, bank_session)


@router.post("/upload", response_model=BankReconciliationUploadResponse)
async def upload_bank_statement(
    *,
    session: SessionDep,
    current_user: VerifiedUser,
    file: UploadFile = File(...),
    ocr_text: str | None = Form(default=None),
    company_id: uuid.UUID | None = None,
    request: Request,
) -> BankReconciliationUploadResponse:
    file_name = file.filename or "bank-statement"
    extension = file_name.lower().rsplit(".", 1)[-1] if "." in file_name else ""
    if extension not in {"csv", "xlsx", "pdf"}:
        raise HTTPException(status_code=400, detail="Upload a PDF, CSV, or XLSX bank statement.")

    content = await file.read()
    ai_metadata: dict[str, Any] = {}
    try:
        if extension == "csv":
            rows = _extract_rows_from_csv(content)
        elif extension == "xlsx":
            rows = _extract_rows_from_xlsx(content)
        else:
            rows = _extract_rows_from_pdf_text(content)
            if not rows and ocr_text and ocr_text.strip():
                if not current_user.is_superuser:
                    try:
                        check_entitlement(session, current_user, "ocr")
                    except LimitReachedException as exc:
                        raise HTTPException(status_code=403, detail=limit_reached_detail(exc)) from exc
                rows, ai_metadata = await _extract_rows_from_ai_ocr_text(
                    ocr_text,
                    user_id=str(current_user.id),
                    company_id=str(company_id or current_user.company_id),
                )
                if rows and not current_user.is_superuser:
                    try:
                        record_entitled_usage(session, current_user, feature="ocr")
                    except LimitReachedException as exc:
                        session.rollback()
                        raise HTTPException(status_code=403, detail=limit_reached_detail(exc)) from exc
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Could not parse bank statement: {exc}") from exc

    parsed = _rows_to_transactions(rows)
    active_company_id = company_id or current_user.company_id
    statement_dates = [item["date"] for item in parsed]
    bank_session = BankImportSession(
        company_id=active_company_id,
        user_id=current_user.id,
        source_type="upload",
        file_name=file_name,
        bank_name=ai_metadata.get("bank_name") or _detect_bank(file_name, rows),
        statement_start=min(statement_dates) if statement_dates else None,
        statement_end=max(statement_dates) if statement_dates else None,
        status="Processing",
        transaction_count=len(parsed),
    )
    session.add(bank_session)
    session.commit()
    session.refresh(bank_session)

    duplicate_count = 0
    for item in parsed:
        tx_type, category, action, confidence, reason = _classify(item["description"], item["amount"])
        matched_type, matched_id, match_confidence, match_reason = _match_existing_record(session, active_company_id, item)
        duplicate_id = _find_duplicate(session, active_company_id, item, bank_session.id)
        is_duplicate = duplicate_id is not None
        duplicate_count += 1 if is_duplicate else 0

        if is_duplicate:
            reconciliation_status = "Duplicate"
            selected = False
            final_action = "Ignore"
        elif matched_id:
            reconciliation_status = "Matched"
            selected = True
            final_action = "Match Existing"
        elif confidence >= 80 and action == "Create Expense":
            reconciliation_status = "Suggested Expense"
            selected = confidence >= 80
            final_action = "Create Expense"
        elif confidence >= 80 and action == "Create Revenue":
            reconciliation_status = "Suggested Revenue"
            selected = confidence >= 80
            final_action = "Create Revenue"
        else:
            reconciliation_status = "Needs Review"
            selected = False
            final_action = "Review"

        session.add(
            BankImportTransaction(
                session_id=bank_session.id,
                company_id=active_company_id,
                date=item["date"],
                description=item["description"],
                reference=item["reference"],
                amount=item["amount"],
                debit=item["debit"],
                credit=item["credit"],
                balance=item["balance"],
                raw_data=item["raw_data"],
                ai_transaction_type=tx_type,
                ai_category=category,
                ai_confidence=confidence,
                ai_reason=reason,
                ai_suggested_action=action,
                reconciliation_status=reconciliation_status,
                selected=selected,
                final_action=final_action,
                final_category=category,
                matched_record_type=matched_type,
                matched_record_id=matched_id,
                match_confidence=match_confidence,
                match_reason=match_reason,
                is_duplicate=is_duplicate,
                duplicate_of_transaction_id=duplicate_id,
            )
        )

    bank_session.status = "Ready"
    bank_session.duplicate_count = duplicate_count
    bank_session.updated_at = get_datetime_utc()
    session.add(bank_session)
    session.commit()
    session.refresh(bank_session)

    AuditLogger.log(
        session,
        company_id=active_company_id,
        user_id=current_user.id,
        module=AuditModule.BANK_RECONCILIATION,
        table_name="bankimportsession",
        record_id=bank_session.id,
        action=AuditAction.IMPORT,
        entity_name=file_name,
        description=f"Uploaded Bank Statement {file_name} ({len(parsed)} transactions)",
        metadata={"filename": file_name, "count": len(parsed)},
        request=request,
    )

    detail = _session_detail(session, bank_session)
    warnings = []
    if duplicate_count:
        warnings.append("Some transactions appear to have been imported previously.")
    if extension == "pdf" and not parsed:
        warnings.append("No transactions were extracted from this PDF. Please try a clearer statement scan.")
    return BankReconciliationUploadResponse(**detail.model_dump(), warnings=warnings)


@router.patch("/transactions/{transaction_id}", response_model=BankImportTransactionPublic)
def update_bank_transaction(
    *,
    session: SessionDep,
    current_user: VerifiedUser,
    transaction_id: uuid.UUID,
    payload: BankReconciliationTransactionUpdate,
    request: Request,
) -> BankImportTransactionPublic:
    transaction = session.get(BankImportTransaction, transaction_id)
    if not transaction or (current_user.company_id and transaction.company_id != current_user.company_id):
        raise HTTPException(status_code=404, detail="Bank transaction not found")
    old_tx_dict = transaction.model_dump(mode="json")
    update = payload.model_dump(exclude_unset=True)
    for key, value in update.items():
        setattr(transaction, key, value)
    if payload.final_category:
        transaction.final_category = payload.final_category
    if transaction.final_action == "Create Expense":
        transaction.final_category = _clean_expense_category(transaction.final_category)
    if _is_ignored(transaction):
        transaction.selected = False
    session.add(transaction)
    session.commit()
    session.refresh(transaction)

    AuditLogger.log(
        session,
        company_id=transaction.company_id,
        user_id=current_user.id,
        module=AuditModule.BANK_RECONCILIATION,
        table_name="bankimporttransaction",
        record_id=transaction.id,
        action=AuditAction.UPDATE,
        entity_name=transaction.description,
        description=f"Updated Bank Transaction {transaction.description}",
        old_data=old_tx_dict,
        new_data=transaction,
        request=request,
    )

    return BankImportTransactionPublic.model_validate(transaction)


@router.patch("/sessions/{session_id}/bulk", response_model=BankReconciliationSessionDetail)
def bulk_update_bank_transactions(
    *,
    session: SessionDep,
    current_user: VerifiedUser,
    session_id: uuid.UUID,
    payload: BankReconciliationBulkUpdate,
    request: Request,
) -> BankReconciliationSessionDetail:
    bank_session = session.get(BankImportSession, session_id)
    if not bank_session or (current_user.company_id and bank_session.company_id != current_user.company_id):
        raise HTTPException(status_code=404, detail="Bank reconciliation session not found")
    statement = select(BankImportTransaction).where(BankImportTransaction.session_id == session_id)
    if payload.transaction_ids:
        statement = statement.where(col(BankImportTransaction.id).in_(payload.transaction_ids))
    updates = payload.model_dump(exclude={"transaction_ids"}, exclude_unset=True)
    for transaction in session.exec(statement).all():
        for key, value in updates.items():
            setattr(transaction, key, value)
        if transaction.final_action == "Create Expense":
            transaction.final_category = _clean_expense_category(transaction.final_category)
        if _is_ignored(transaction):
            transaction.selected = False
        session.add(transaction)
    session.commit()
    session.refresh(bank_session)

    AuditLogger.log(
        session,
        company_id=bank_session.company_id,
        user_id=current_user.id,
        module=AuditModule.BANK_RECONCILIATION,
        table_name="bankimportsession",
        record_id=bank_session.id,
        action=AuditAction.UPDATE,
        entity_name=bank_session.file_name,
        description=f"Bulk Updated Bank Reconciliation Session {bank_session.file_name}",
        metadata={"session_id": str(session_id), "count": len(payload.transaction_ids or [])},
        request=request,
    )

    return _session_detail(session, bank_session)


@router.post("/sessions/{session_id}/apply", response_model=BankReconciliationApplyResponse)
def apply_bank_reconciliation(
    *,
    session: SessionDep,
    current_user: VerifiedUser,
    session_id: uuid.UUID,
    payload: BankReconciliationApplyRequest,
    request: Request,
) -> BankReconciliationApplyResponse:
    bank_session = session.get(BankImportSession, session_id)
    if not bank_session or (current_user.company_id and bank_session.company_id != current_user.company_id):
        raise HTTPException(status_code=404, detail="Bank reconciliation session not found")

    statement = select(BankImportTransaction).where(BankImportTransaction.session_id == session_id)
    if payload.transaction_ids:
        statement = statement.where(col(BankImportTransaction.id).in_(payload.transaction_ids))
    transactions = session.exec(statement).all()
    response = BankReconciliationApplyResponse()
    now = get_datetime_utc()

    for transaction in transactions:
        if transaction.applied_at:
            response.skipped += 1
            continue
        if transaction.reconciliation_status == "Ignored" or transaction.final_action == "Ignore":
            transaction.applied_by = current_user.id
            transaction.applied_at = now
            response.ignored += 1
        elif transaction.final_action == "Match Existing" or transaction.reconciliation_status == "Matched":
            transaction.applied_by = current_user.id
            transaction.applied_at = now
            response.matched += 1
        elif transaction.selected and transaction.final_action == "Create Expense":
            amount = abs(transaction.amount)
            category = _clean_expense_category(
                transaction.final_category or transaction.ai_category
            )
            purchase = Purchase(
                date=dt.datetime.combine(transaction.date, dt.time.min, tzinfo=dt.timezone.utc),
                supplier_name=transaction.description[:255],
                category=category[:255],
                company_id=bank_session.company_id,
                user_id=current_user.id,
                amount=amount,
                tax=0,
                final_amount=amount,
                status="Paid",
                invoice_no=(transaction.reference or f"BR-{transaction.id}")[:255],
                notes=f"Created from bank reconciliation session {bank_session.id}. AI reason: {transaction.ai_reason}",
            )
            session.add(purchase)
            session.flush()
            transaction.created_record_type = "Purchase"
            transaction.created_record_id = purchase.id
            transaction.applied_by = current_user.id
            transaction.applied_at = now
            transaction.reconciliation_status = "Applied"
            response.created_expenses += 1
        elif transaction.selected and transaction.final_action == "Create Revenue":
            amount = abs(transaction.amount)
            sale = Sale(
                date=transaction.date,
                channel=(transaction.final_category or transaction.ai_category or "Bank Deposit")[:255],
                notes=f"{transaction.description}\nCreated from bank reconciliation session {bank_session.id}. AI reason: {transaction.ai_reason}",
                company_id=bank_session.company_id,
                user_id=current_user.id,
                gross_amount=amount,
                discount=0,
                net_sales=amount,
                cancel_amount=0,
                short_over=0,
                refund=0,
                final_amount=amount,
                status="Completed",
            )
            session.add(sale)
            session.flush()
            transaction.created_record_type = "Sale"
            transaction.created_record_id = sale.id
            transaction.applied_by = current_user.id
            transaction.applied_at = now
            transaction.reconciliation_status = "Applied"
            response.created_revenues += 1
        else:
            response.skipped += 1
        session.add(transaction)

    bank_session.status = "Completed"
    bank_session.completed_at = now
    bank_session.updated_at = now
    session.add(bank_session)
    session.commit()

    AuditLogger.log(
        session,
        company_id=bank_session.company_id,
        user_id=current_user.id,
        module=AuditModule.BANK_RECONCILIATION,
        table_name="bankimportsession",
        record_id=bank_session.id,
        action=AuditAction.SYNC,
        entity_name=bank_session.file_name,
        description=f"Applied Bank Reconciliation for Session {bank_session.file_name} (Created: {response.created_expenses + response.created_revenues}, Matched: {response.matched}, Ignored: {response.ignored})",
        metadata={
            "created_expenses": response.created_expenses,
            "created_revenues": response.created_revenues,
            "matched": response.matched,
            "ignored": response.ignored,
        },
        request=request,
    )

    return response
