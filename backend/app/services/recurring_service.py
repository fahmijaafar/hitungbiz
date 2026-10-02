from __future__ import annotations

import calendar
from datetime import date, datetime, timedelta, timezone
from typing import Any

from fastapi import FastAPI
from sqlmodel import Session, select

try:
    from apscheduler.schedulers.background import BackgroundScheduler
    from apscheduler.triggers.interval import IntervalTrigger
except ImportError:  # pragma: no cover - optional dependency for local environments
    BackgroundScheduler = None  # type: ignore[assignment]
    IntervalTrigger = None  # type: ignore[assignment]

from app.core.db import engine
from app.models import (
    Company,
    Document,
    DocumentCreate,
    RecurringConfig,
    RecurringDoc,
    User,
)
from app.services.document_service import create_document


class RecurringGenerationError(Exception):
    pass


def _next_run_date_for(schedule: RecurringConfig, current_time: datetime | None = None) -> datetime:
    base_time = current_time or datetime.now(timezone.utc)
    if schedule.frequency == "daily":
        return base_time + timedelta(days=schedule.interval)
    if schedule.frequency == "weekly":
        return base_time + timedelta(weeks=schedule.interval)
    if schedule.frequency == "monthly":
        month = base_time.month - 1 + schedule.interval
        year = base_time.year + (month // 12)
        month = (month % 12) + 1
        day = min(base_time.day, calendar.monthrange(year, month)[1])
        return datetime(
            year,
            month,
            day,
            base_time.hour,
            base_time.minute,
            base_time.second,
            tzinfo=base_time.tzinfo,
        )
    if schedule.frequency == "yearly":
        year = base_time.year + schedule.interval
        day = min(base_time.day, calendar.monthrange(year, base_time.month)[1])
        return datetime(
            year,
            base_time.month,
            day,
            base_time.hour,
            base_time.minute,
            base_time.second,
            tzinfo=base_time.tzinfo,
        )
    return base_time + timedelta(days=schedule.interval)


def _format_document_number(company: Company, doctype: str) -> str:
    running_numbers = company.document_running_numbers or {}
    next_number = int(running_numbers.get(doctype, 1))
    prefix = "INV" if doctype == "invoice" else doctype.upper()[:3]
    return f"{prefix}{str(next_number).zfill(5)}"


def _build_document_payload(
    template: RecurringDoc,
    schedule: RecurringConfig,
    invoice_date: date,
    company: Company,
) -> DocumentCreate:
    due_date = invoice_date + timedelta(days=schedule.due_after_days)
    payload = {
        "company_id": template.company_id,
        "user_id": template.user_id,
        "docno": _format_document_number(company, template.doctype),
        "doctype": template.doctype,
        "client_id": template.client_id,
        "date": invoice_date,
        "title": template.title,
        "item": template.item,
        "price_calculation": template.price_calculation,
        "remark": template.remark,
        "status": template.status,
        "validity": template.validity,
        "duedate": due_date,
    }
    return DocumentCreate.model_validate(payload)


def _generate_single_schedule(*, session: Session, recurring: RecurringConfig) -> bool:
    statement = (
        select(RecurringConfig)
        .where(RecurringConfig.id == recurring.id)
        .with_for_update(skip_locked=True)
    )
    locked_schedule = session.exec(statement).one()
    if locked_schedule.status != "Active":
        return False
    if (
        locked_schedule.end_date
        and locked_schedule.next_run_date.date() > locked_schedule.end_date
    ):
        locked_schedule.status = "COMPLETED"
        locked_schedule.updated_at = datetime.now(timezone.utc)
        session.add(locked_schedule)
        session.commit()
        return False
    if (
        locked_schedule.max_occurrences is not None
        and locked_schedule.generated_count >= locked_schedule.max_occurrences
    ):
        locked_schedule.status = "COMPLETED"
        locked_schedule.updated_at = datetime.now(timezone.utc)
        session.add(locked_schedule)
        session.commit()
        return False

    template = session.exec(
        select(RecurringDoc).where(RecurringDoc.recurring_config_id == locked_schedule.id)
    ).first()
    if not template:
        return False

    company = session.get(Company, template.company_id)
    if not company:
        return False

    invoice_date = date.today()
    payload = _build_document_payload(template, locked_schedule, invoice_date, company)
    company.document_running_numbers = {
        **(company.document_running_numbers or {}),
        template.doctype: (company.document_running_numbers or {}).get(template.doctype, 1) + 1,
    }
    session.add(company)

    create_document(
        session=session,
        document_in=payload,
        user_id=template.user_id,
        generated_from_recurring_id=locked_schedule.id,
    )

    locked_schedule.last_run_date = datetime.now(timezone.utc)
    locked_schedule.generated_count = (locked_schedule.generated_count or 0) + 1
    locked_schedule.next_run_date = _next_run_date_for(
        locked_schedule,
        locked_schedule.next_run_date,
    )
    if (
        locked_schedule.end_date
        and locked_schedule.next_run_date.date() > locked_schedule.end_date
    ):
        locked_schedule.status = "COMPLETED"
    locked_schedule.updated_at = locked_schedule.last_run_date
    session.add(locked_schedule)
    session.commit()
    return True


def process_due_recurring_schedules(*, session: Session | None = None) -> int:
    if session is None:
        with Session(engine) as db_session:
            return process_due_recurring_schedules(session=db_session)

    now = datetime.now(timezone.utc)
    statement = (
        select(RecurringConfig)
        .where(RecurringConfig.status == "Active")
        .where(RecurringConfig.next_run_date <= now)
        .order_by(RecurringConfig.next_run_date)
    )

    due_schedules = session.exec(statement).all()
    generated = 0

    for schedule in due_schedules:
        if not schedule.id:
            continue
        if _generate_single_schedule(session=session, recurring=schedule):
            generated += 1

    return generated


def create_recurring_schedule(
    *,
    session: Session,
    user: User,
    company: Company,
    schedule_in: dict[str, Any],
    template_payload: dict[str, Any],
) -> RecurringConfig:
    start_date_val = schedule_in.get("start_date") or date.today()
    if isinstance(start_date_val, str):
        start_date_val = date.fromisoformat(start_date_val)
    start_datetime = datetime.combine(start_date_val, datetime.min.time(), timezone.utc)

    recurring = RecurringConfig.model_validate(
        {
            **schedule_in,
            "company_id": company.id,
            "user_id": user.id,
            "start_date": start_date_val,
            "next_run_date": start_datetime,
            "status": schedule_in.get("status", "Active"),
        }
    )
    session.add(recurring)
    session.commit()
    session.refresh(recurring)

    template = RecurringDoc.model_validate(
        {
            **template_payload,
            "company_id": company.id,
            "user_id": user.id,
            "recurring_config_id": recurring.id,
        }
    )
    session.add(template)
    session.commit()
    session.refresh(template)
    return recurring


def update_recurring_schedule(
    *,
    session: Session,
    recurring: RecurringConfig,
    schedule_in: dict[str, Any] | None,
    template_in: dict[str, Any] | None,
) -> tuple[RecurringConfig, RecurringDoc | None]:
    if schedule_in:
        start_date_val = schedule_in.get("start_date")
        if start_date_val is not None:
            if isinstance(start_date_val, str):
                start_date_val = date.fromisoformat(start_date_val)
            schedule_in["start_date"] = start_date_val
            if recurring.generated_count == 0 and "next_run_date" not in schedule_in:
                schedule_in["next_run_date"] = datetime.combine(
                    start_date_val, datetime.min.time(), timezone.utc
                )
        recurring.sqlmodel_update(schedule_in)
        recurring.updated_at = datetime.now(timezone.utc)
        session.add(recurring)

    template = session.exec(
        select(RecurringDoc).where(RecurringDoc.recurring_config_id == recurring.id)
    ).first()
    if template and template_in:
        template.sqlmodel_update(template_in)
        session.add(template)
    elif template_in and not template:
        template = RecurringDoc.model_validate(
            {
                **template_in,
                "company_id": recurring.company_id,
                "user_id": recurring.user_id,
                "recurring_config_id": recurring.id,
            }
        )
        session.add(template)

    session.commit()
    session.refresh(recurring)
    if template:
        session.refresh(template)
    return recurring, template


def delete_recurring_schedule(*, session: Session, recurring: RecurringConfig) -> None:
    # Set generated_from_recurring_id to None for all documents generated from this schedule
    documents = session.exec(
        select(Document).where(Document.generated_from_recurring_id == recurring.id)
    ).all()
    for doc in documents:
        doc.generated_from_recurring_id = None
        session.add(doc)

    # Delete all templates referencing the recurring schedule
    templates = session.exec(
        select(RecurringDoc).where(RecurringDoc.recurring_config_id == recurring.id)
    ).all()
    for template in templates:
        session.delete(template)
    
    # Flush changes to database to avoid constraint violation when deleting parent
    session.flush()

    session.delete(recurring)
    session.commit()


def pause_recurring_schedule(*, session: Session, recurring: RecurringConfig) -> RecurringConfig:
    recurring.status = "Paused"
    recurring.updated_at = datetime.now(timezone.utc)
    session.add(recurring)
    session.commit()
    session.refresh(recurring)
    return recurring


def resume_recurring_schedule(*, session: Session, recurring: RecurringConfig) -> RecurringConfig:
    recurring.status = "Active"
    recurring.updated_at = datetime.now(timezone.utc)
    session.add(recurring)
    session.commit()
    session.refresh(recurring)
    return recurring


def generate_recurring_schedule(*, session: Session, recurring: RecurringConfig) -> int:
    if recurring.status != "Active":
        recurring.status = "Active"
        recurring.updated_at = datetime.now(timezone.utc)
        session.add(recurring)
        session.commit()
        session.refresh(recurring)
    return 1 if _generate_single_schedule(session=session, recurring=recurring) else 0


def process_due_subscription_renewals_job() -> int:
    """Scheduled runner for due subscription renewals."""
    from app.services.recurring_renewal_service import process_due_subscription_renewals
    with Session(engine) as session:
        return process_due_subscription_renewals(session)


def retry_and_reconcile_subscriptions_job() -> int:
    """Scheduled runner for retrying failed renewals and reconciling pending renewals."""
    from app.services.recurring_renewal_service import (
        reconcile_pending_subscription_renewals,
        retry_failed_subscription_renewals,
    )
    with Session(engine) as session:
        retried = retry_failed_subscription_renewals(session)
        reconciled = reconcile_pending_subscription_renewals(session)
        return retried + reconciled


def start_recurring_scheduler(app: FastAPI) -> None:
    @app.on_event("startup")
    def run_recurring_scheduler() -> None:
        if BackgroundScheduler is None or IntervalTrigger is None:
            app.state.recurring_scheduler = None
            return
        scheduler = BackgroundScheduler()
        scheduler.add_job(
            lambda: process_due_recurring_schedules(),
            IntervalTrigger(minutes=5),
            id="process_due_recurring_schedules",
            replace_existing=True,
        )
        scheduler.add_job(
            lambda: process_due_subscription_renewals_job(),
            IntervalTrigger(minutes=5),
            id="process_due_subscription_renewals",
            replace_existing=True,
        )
        scheduler.add_job(
            lambda: retry_and_reconcile_subscriptions_job(),
            IntervalTrigger(minutes=15),
            id="retry_and_reconcile_subscriptions",
            replace_existing=True,
        )
        app.state.recurring_scheduler = scheduler
        scheduler.start()

    @app.on_event("shutdown")
    def stop_recurring_scheduler() -> None:
        scheduler = getattr(app.state, "recurring_scheduler", None)
        if scheduler:
            scheduler.shutdown(wait=False)
