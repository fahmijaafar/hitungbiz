import logging
import uuid
from enum import Enum
from typing import Any

from fastapi import Request
from sqlmodel import Session

from app.models import AuditLog

logger = logging.getLogger(__name__)


class AuditModule(str, Enum):
    DASHBOARD = "Dashboard"
    COMPANIES = "Companies"
    CLIENTS = "Clients"
    PRODUCTS = "Products"
    BANK_ACCOUNTS = "Bank Accounts"
    REVENUE = "Revenue"
    EXPENSES = "Expenses"
    TRANSACTIONS = "Transactions"
    DOCUMENTS = "Documents"
    RECURRING_INVOICES = "Recurring Invoices"
    IMPORTS = "Imports"
    BANK_RECONCILIATION = "Bank Reconciliation"
    FINANCIAL_REPORTS = "Financial Reports"
    LHDN_TAX_ADVISOR = "LHDN Tax Advisor"
    EMAIL_BLASTING = "Email Blasting"
    ADMIN = "Admin"
    AUTHENTICATION = "Authentication"
    SETTINGS = "Settings"
    SYSTEM = "System"


class AuditAction(str, Enum):
    CREATE = "CREATE"
    UPDATE = "UPDATE"
    DELETE = "DELETE"
    RESTORE = "RESTORE"
    STATUS_CHANGE = "STATUS_CHANGE"
    LOGIN = "LOGIN"
    LOGOUT = "LOGOUT"
    IMPORT = "IMPORT"
    EXPORT = "EXPORT"
    SEND = "SEND"
    DOWNLOAD = "DOWNLOAD"
    GENERATE = "GENERATE"
    PAYMENT = "PAYMENT"
    SYNC = "SYNC"
    AI_REQUEST = "AI_REQUEST"


def _normalize_val(val: Any) -> Any:
    """Recursively converts datetimes, UUIDs, Enums, SQLModel/Pydantic objects to JSON-serializable types."""
    if val is None:
        return None
    if isinstance(val, (str, int, float, bool)):
        return val
    if isinstance(val, uuid.UUID):
        return str(val)
    if hasattr(val, "isoformat"):
        return val.isoformat()
    if isinstance(val, Enum):
        return val.value
    if hasattr(val, "model_dump"):
        return _normalize_val(val.model_dump(mode="json"))
    if hasattr(val, "dict"):
        return _normalize_val(val.dict())
    if isinstance(val, dict):
        return {str(k): _normalize_val(v) for k, v in val.items()}
    if isinstance(val, (list, tuple, set)):
        return [_normalize_val(item) for item in val]
    return str(val)


def to_snapshot(obj: Any) -> dict[str, Any] | list[Any] | None:
    """Helper to convert any model instance, list or dict into a normalized snapshot."""
    if obj is None:
        return None
    normalized = _normalize_val(obj)
    if isinstance(normalized, (dict, list)):
        return normalized
    return {"value": normalized}


class AuditLogger:
    @staticmethod
    def log(
        db: Session,
        *,
        module: str,
        table_name: str,
        action: str,
        description: str,
        company_id: uuid.UUID | str | None = None,
        user_id: uuid.UUID | str | None = None,
        record_id: Any = None,
        entity_name: str | None = None,
        old_data: Any = None,
        new_data: Any = None,
        metadata: dict[str, Any] | None = None,
        ip_address: str | None = None,
        user_agent: str | None = None,
        request: Request | None = None,
    ) -> AuditLog | None:
        """
        Log an audit event to the audit_logs table.

        - Supports automatic change detection for UPDATE actions (skips insert if old_data == new_data).
        - Automatically extracts ip_address and user_agent from `request` if provided.
        - Never raises exceptions to caller (logs failure gracefully so business logic is not interrupted).
        """
        try:
            # Extract IP and User-Agent from FastAPI request if present
            if request is not None:
                if not ip_address:
                    ip_address = (
                        request.headers.get("x-forwarded-for")
                        or request.headers.get("x-real-ip")
                        or (request.client.host if request.client else None)
                    )
                    if ip_address and "," in ip_address:
                        ip_address = ip_address.split(",")[0].strip()
                if not user_agent:
                    user_agent = request.headers.get("user-agent")

            # Convert IDs
            comp_id = uuid.UUID(str(company_id)) if company_id else None
            usr_id = uuid.UUID(str(user_id)) if user_id else None
            rec_id_str = str(record_id) if record_id is not None else None

            # Convert data to clean snapshots
            old_snapshot = to_snapshot(old_data) if old_data is not None else None
            new_snapshot = to_snapshot(new_data) if new_data is not None else None
            meta_snapshot = _normalize_val(metadata) if metadata is not None else None

            mod_str = module.value if isinstance(module, Enum) else str(module)
            act_str = action.value if isinstance(action, Enum) else str(action)

            # AUTOMATIC CHANGE DETECTION:
            # UPDATE logs should only be created when actual values changed.
            # If nothing changed, do not insert an audit log.
            if act_str == AuditAction.UPDATE.value or act_str == "UPDATE":
                if old_snapshot is not None and new_snapshot is not None:
                    if old_snapshot == new_snapshot:
                        logger.debug("AuditLogger: Skipping UPDATE log because no data changed.")
                        return None

            audit_log = AuditLog(
                company_id=comp_id,
                user_id=usr_id,
                module=mod_str,
                table_name=str(table_name),
                record_id=rec_id_str,
                action=act_str,
                entity_name=entity_name[:255] if entity_name else None,
                description=description,
                old_data=old_snapshot,
                new_data=new_snapshot,
                log_metadata=meta_snapshot,
                ip_address=ip_address[:100] if ip_address else None,
                user_agent=user_agent,
            )

            db.add(audit_log)
            db.commit()
            db.refresh(audit_log)
            return audit_log
        except Exception as e:
            logger.error("AuditLogger.log failed: %s", e, exc_info=True)
            db.rollback()
            return None
