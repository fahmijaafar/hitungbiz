import datetime as dt
import time
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from sqlalchemy.exc import SQLAlchemyError
from sqlmodel import select

from app.api.deps import CurrentUser, SessionDep, VerifiedUser
from app.models import (
    Client,
    ImportBulkRequest,
    ImportBulkResponse,
    ImportBulkResult,
    ImportDraftRecord,
    ImportField,
    ImportFieldList,
    ImportValidatedRecord,
    ImportValidationRequest,
    ImportValidationResponse,
    Product,
    Purchase,
    Sale,
)
from app.services.audit_logger import AuditAction, AuditLogger, AuditModule

router = APIRouter(prefix="/transaction-imports", tags=["transaction-imports"])

REVENUE_STATUS_VALUES = ("Pending", "Completed", "Canceled")

REVENUE_FIELDS = [
    ImportField(
        key="date",
        label="Date",
        type="date",
        required=True,
        aliases=["date", "sale date", "transaction date", "invoice date"],
    ),
    ImportField(
        key="channel",
        label="Channel",
        type="string",
        required=True,
        aliases=["channel", "source", "platform", "customer", "client"],
    ),
    ImportField(
        key="notes",
        label="Notes",
        type="string",
        aliases=["notes", "remarks", "remark", "description", "memo"],
        default="",
    ),
    ImportField(
        key="gross_amount",
        label="Gross Amount",
        type="number",
        required=True,
        aliases=["gross amount", "gross", "amount", "total", "total amount", "sales"],
    ),
    ImportField(
        key="discount",
        label="Discount",
        type="number",
        aliases=["discount", "discount amount"],
        default=0,
    ),
    ImportField(
        key="net_sales",
        label="Net Sales",
        type="number",
        aliases=["net sales", "net amount", "subtotal", "sub total"],
    ),
    ImportField(
        key="cancel_amount",
        label="Cancel Amount",
        type="number",
        aliases=["cancel amount", "cancellation", "void amount"],
        default=0,
    ),
    ImportField(
        key="short_over",
        label="Short/Over",
        type="number",
        aliases=["short over", "short/over", "variance", "rounding"],
        default=0,
    ),
    ImportField(
        key="refund",
        label="Refund",
        type="number",
        aliases=["refund", "refund amount"],
        default=0,
    ),
    ImportField(
        key="final_amount",
        label="Final Amount",
        type="number",
        aliases=["final amount", "paid amount", "received amount", "grand total"],
    ),
    ImportField(
        key="status",
        label="Status",
        type="string",
        aliases=["status", "payment status"],
        default="Completed",
    ),
]

EXPENSE_FIELDS = [
    ImportField(
        key="date",
        label="Date",
        type="datetime",
        required=True,
        aliases=["date", "expense date", "transaction date", "invoice date", "bill date"],
    ),
    ImportField(
        key="due_date",
        label="Due Date",
        type="date",
        aliases=["due date", "payment due", "due"],
    ),
    ImportField(
        key="supplier_name",
        label="Supplier",
        type="string",
        required=True,
        aliases=["supplier", "supplier name", "vendor", "vendor name", "merchant"],
    ),
    ImportField(
        key="category",
        label="Category",
        type="string",
        required=True,
        aliases=["category", "expense category", "type"],
    ),
    ImportField(
        key="invoice_no",
        label="Invoice Number",
        type="string",
        aliases=[
            "invoice no",
            "invoice number",
            "invoice #",
            "inv no",
            "inv number",
            "bill no",
            "receipt no",
            "reference",
        ],
    ),
    ImportField(
        key="amount",
        label="Amount",
        type="number",
        required=True,
        aliases=["amount", "subtotal", "sub total", "net amount", "before tax"],
    ),
    ImportField(
        key="tax",
        label="Tax",
        type="number",
        aliases=["tax", "tax amount", "sst", "vat", "gst"],
        default=0,
    ),
    ImportField(
        key="final_amount",
        label="Final Amount",
        type="number",
        aliases=["final amount", "total", "total amount", "grand total"],
    ),
    ImportField(
        key="status",
        label="Status",
        type="string",
        aliases=["status", "payment status"],
        default="Paid",
    ),
    ImportField(
        key="notes",
        label="Notes",
        type="string",
        aliases=["notes", "remarks", "remark", "description", "memo"],
        default="",
    ),
]

CLIENT_FIELDS = [
    ImportField(
        key="name",
        label="Name",
        type="string",
        required=True,
        aliases=["name", "client name", "customer name", "client", "customer", "full name"],
    ),
    ImportField(
        key="email",
        label="Email",
        type="string",
        aliases=["email", "email address", "mail"],
        default="",
    ),
    ImportField(
        key="phone_number",
        label="Phone Number",
        type="string",
        aliases=["phone number", "phone", "mobile", "tel", "contact", "contact number"],
        default="",
    ),
    ImportField(
        key="company_name",
        label="Company Name",
        type="string",
        aliases=["company name", "company", "organization", "business name"],
        default="",
    ),
    ImportField(
        key="customer_type",
        label="Customer Type",
        type="string",
        aliases=["customer type", "client type", "type"],
        default="individual",
    ),
    ImportField(
        key="reg_number",
        label="Registration Number",
        type="string",
        aliases=["registration number", "reg number", "company reg no", "business reg no", "ic number", "ic/passport"],
        default="",
    ),
    ImportField(
        key="billing_address",
        label="Billing Address",
        type="string",
        aliases=["billing address", "address", "street address"],
        default="",
    ),
]

PRODUCT_FIELDS = [
    ImportField(
        key="product_name",
        label="Product Name",
        type="string",
        required=True,
        aliases=["product name", "product", "item name", "item", "title", "name"],
    ),
    ImportField(
        key="description",
        label="Description",
        type="string",
        aliases=["description", "details", "summary", "notes"],
        default="",
    ),
    ImportField(
        key="sku",
        label="SKU",
        type="string",
        aliases=["sku", "product code", "item code", "code", "barcode"],
        default="",
    ),
    ImportField(
        key="category",
        label="Category",
        type="string",
        aliases=["category", "product category", "type"],
        default="",
    ),
    ImportField(
        key="cost_price",
        label="Cost Price",
        type="number",
        aliases=["cost price", "cost", "buy price", "purchase price"],
        default=0,
    ),
    ImportField(
        key="sell_price",
        label="Sell Price",
        type="number",
        aliases=["sell price", "price", "unit price", "sale price"],
        default=0,
    ),
    ImportField(
        key="supplier",
        label="Supplier",
        type="string",
        aliases=["supplier", "vendor", "supplier name"],
        default="",
    ),
    ImportField(
        key="stock_quantity",
        label="Stock Quantity",
        type="number",
        aliases=["stock quantity", "stock", "quantity", "qty"],
        default=0,
    ),
    ImportField(
        key="unit_type",
        label="Unit Type",
        type="string",
        aliases=["unit type", "unit", "uom"],
        default="pcs",
    ),
]

FIELD_SETS = {
    "revenue": REVENUE_FIELDS,
    "expenses": EXPENSE_FIELDS,
    "clients": CLIENT_FIELDS,
    "products": PRODUCT_FIELDS,
}


def _fields_for(import_type: str) -> list[ImportField]:
    fields = FIELD_SETS.get(import_type)
    if not fields:
        raise HTTPException(status_code=400, detail="Unsupported import type")
    return fields


def _parse_number(value: Any, field: ImportField, errors: list[str]) -> float:
    if value is None or value == "":
        if field.default is not None:
            return float(field.default)
        if field.required:
            errors.append(f"{field.label} is required")
        return 0
    try:
        cleaned = str(value).strip().replace(",", "")
        if cleaned.startswith("(") and cleaned.endswith(")"):
            cleaned = f"-{cleaned[1:-1]}"
        number = float(cleaned)
    except ValueError:
        errors.append(f"{field.label} must be a valid number")
        return 0
    if field.key in {"gross_amount", "discount", "cancel_amount", "refund", "amount", "tax", "final_amount", "cost_price", "sell_price", "stock_quantity"} and number < 0:
        errors.append(f"{field.label} cannot be negative")
    return number


def _parse_date(value: Any, field: ImportField, errors: list[str]) -> dt.date | None:
    if value is None or value == "":
        if field.required:
            errors.append(f"{field.label} is required")
        return None
    raw = str(value).strip()
    formats = [
        "%Y-%m-%d",
        "%d/%m/%Y",
        "%m/%d/%Y",
        "%d-%m-%Y",
        "%m-%d-%Y",
        "%d.%m.%Y",
        "%Y/%m/%d",
    ]
    for date_format in formats:
        try:
            return dt.datetime.strptime(raw, date_format).date()
        except ValueError:
            continue
    try:
        return dt.datetime.fromisoformat(raw.replace("Z", "+00:00")).date()
    except ValueError:
        errors.append(f"{field.label} must be a valid date")
        return None


def _coerce_record(import_type: str, record: ImportDraftRecord) -> tuple[dict[str, Any], list[str]]:
    errors: list[str] = []
    fields = _fields_for(import_type)
    data = dict(record.data)
    coerced: dict[str, Any] = {}

    for field in fields:
        value = data.get(field.key)
        if field.type == "number":
            coerced[field.key] = _parse_number(value, field, errors)
        elif field.type in {"date", "datetime"}:
            parsed = _parse_date(value, field, errors)
            if parsed is not None:
                coerced[field.key] = (
                    dt.datetime.combine(parsed, dt.time.min)
                    if field.type == "datetime"
                    else parsed
                )
        else:
            text = "" if value is None else str(value).strip()
            if not text and field.default is not None:
                text = str(field.default)
            if not text and field.required:
                errors.append(f"{field.label} is required")
            coerced[field.key] = (
                text if text else (field.default if field.default is not None else None)
            )

    if import_type == "revenue":
        status = str(coerced.get("status", "")).strip()
        if status not in REVENUE_STATUS_VALUES:
            accepted = ", ".join(REVENUE_STATUS_VALUES)
            errors.append(
                f"Status must be one of: {accepted}. Update the CSV value before importing."
            )

        gross = float(coerced.get("gross_amount", 0))
        discount = float(coerced.get("discount", 0))
        cancel_amount = float(coerced.get("cancel_amount", 0))
        short_over = float(coerced.get("short_over", 0))
        refund = float(coerced.get("refund", 0))
        if not data.get("net_sales"):
            coerced["net_sales"] = gross - discount - cancel_amount + short_over
        if not data.get("final_amount"):
            coerced["final_amount"] = float(coerced["net_sales"]) - refund
    elif import_type == "expenses":
        amount = float(coerced.get("amount", 0))
        tax = float(coerced.get("tax", 0))
        if not data.get("final_amount"):
            coerced["final_amount"] = amount + tax
    elif import_type == "clients":
        if not coerced.get("customer_type"):
            coerced["customer_type"] = "individual"
    elif import_type == "products":
        if not coerced.get("unit_type"):
            coerced["unit_type"] = "pcs"

    return coerced, errors


def _validate_records(
    *,
    session: SessionDep,
    import_type: str,
    company_id: Any,
    records: list[ImportDraftRecord],
) -> list[ImportValidatedRecord]:
    seen_invoice_numbers: set[str] = set()
    existing_invoice_numbers: set[str] = set()
    if import_type == "expenses":
        statement = select(Purchase.invoice_no)
        if company_id:
            statement = statement.where(Purchase.company_id == company_id)
        existing_invoice_numbers = set(session.exec(statement).all())

    validated: list[ImportValidatedRecord] = []
    for record in records:
        data, errors = _coerce_record(import_type, record)
        if import_type == "expenses":
            invoice_no = str(data.get("invoice_no", "")).strip()
            if invoice_no:
                if invoice_no in seen_invoice_numbers:
                    errors.append("Invoice Number is duplicated in this import")
                if invoice_no in existing_invoice_numbers:
                    errors.append("Invoice Number already exists")
                seen_invoice_numbers.add(invoice_no)

        validated.append(
            ImportValidatedRecord(
                row_number=record.row_number,
                selected=record.selected,
                status="invalid" if errors else "valid",
                errors=errors,
                original_row=record.original_row,
                data=data,
            )
        )
    return validated


@router.get("/fields/{import_type}", response_model=ImportFieldList)
def read_import_fields(import_type: str) -> ImportFieldList:
    return ImportFieldList(import_type=import_type, fields=_fields_for(import_type))


@router.post("/validate", response_model=ImportValidationResponse)
def validate_import_records(
    *,
    session: SessionDep,
    current_user: VerifiedUser,
    payload: ImportValidationRequest,
) -> ImportValidationResponse:
    company_id = payload.company_id or current_user.company_id
    records = _validate_records(
        session=session,
        import_type=payload.import_type,
        company_id=company_id,
        records=payload.records,
    )
    invalid_rows = len([record for record in records if record.status == "invalid"])
    return ImportValidationResponse(
        records=records,
        total_rows=len(records),
        valid_rows=len(records) - invalid_rows,
        invalid_rows=invalid_rows,
    )


@router.post("/bulk-insert", response_model=ImportBulkResponse)
def bulk_insert_import_records(
    *,
    session: SessionDep,
    current_user: VerifiedUser,
    payload: ImportBulkRequest,
    request: Request,
) -> ImportBulkResponse:
    started_at = time.perf_counter()
    company_id = payload.company_id or current_user.company_id
    validated = _validate_records(
        session=session,
        import_type=payload.import_type,
        company_id=company_id,
        records=payload.records,
    )
    results: list[ImportBulkResult] = []
    insertable = [record for record in validated if record.selected and record.status == "valid"]
    skipped = len([record for record in validated if not record.selected])

    for record in validated:
        if not record.selected:
            results.append(ImportBulkResult(row_number=record.row_number, status="skipped"))
        elif record.status != "valid":
            results.append(
                ImportBulkResult(
                    row_number=record.row_number,
                    status="failed",
                    errors=record.errors,
                )
            )

    imported = 0
    failed = len([record for record in validated if record.selected and record.status != "valid"])
    for index in range(0, len(insertable), payload.batch_size):
        batch = insertable[index : index + payload.batch_size]
        try:
            for record in batch:
                if payload.import_type == "revenue":
                    session.add(
                        Sale.model_validate(
                            record.data,
                            update={"company_id": company_id, "user_id": current_user.id},
                        )
                    )
                elif payload.import_type == "expenses":
                    session.add(
                        Purchase.model_validate(
                            record.data,
                            update={"company_id": company_id, "user_id": current_user.id},
                        )
                    )
                elif payload.import_type == "clients":
                    session.add(
                        Client.model_validate(
                            record.data,
                            update={"company_id": company_id, "user_id": current_user.id},
                        )
                    )
                elif payload.import_type == "products":
                    session.add(
                        Product.model_validate(
                            record.data,
                            update={"company_id": company_id, "user_id": current_user.id},
                        )
                    )
                else:
                    raise HTTPException(status_code=400, detail="Unsupported import type")
            session.commit()
            imported += len(batch)
            results.extend(
                [
                    ImportBulkResult(row_number=record.row_number, status="imported")
                    for record in batch
                ]
            )
        except (SQLAlchemyError, ValueError) as exc:
            session.rollback()
            failed += len(batch)
            results.extend(
                [
                    ImportBulkResult(
                        row_number=record.row_number,
                        status="failed",
                        errors=[f"Batch insert failed: {exc}"],
                    )
                    for record in batch
                ]
            )

    processing_time_ms = int((time.perf_counter() - started_at) * 1000)

    AuditLogger.log(
        session,
        company_id=company_id,
        user_id=current_user.id,
        module=AuditModule.IMPORTS,
        table_name=payload.import_type,
        action=AuditAction.IMPORT,
        entity_name=payload.import_type.capitalize(),
        description=f"Bulk Imported {imported} {payload.import_type} records (Failed: {failed}, Skipped: {skipped})",
        metadata={
            "import_type": payload.import_type,
            "imported": imported,
            "failed": failed,
            "skipped": skipped,
            "processing_time_ms": processing_time_ms,
        },
        request=request,
    )

    return ImportBulkResponse(
        imported=imported,
        failed=failed,
        skipped=skipped,
        processing_time_ms=processing_time_ms,
        results=sorted(results, key=lambda result: result.row_number),
    )

