from datetime import date, datetime, timedelta, timezone
from fastapi.testclient import TestClient

from sqlmodel import Session, select

from app.models import Company, Document, RecurringConfig, User, RecurringDoc
from app.services.recurring_service import (
    create_recurring_schedule,
    process_due_recurring_schedules,
    delete_recurring_schedule,
)


def test_process_due_recurring_schedules_creates_invoice(db: Session) -> None:
    user = User(
        email=f"recurring-{date.today().strftime('%Y%m%d')}-{datetime.now(timezone.utc).microsecond}@example.com",
        hashed_password="test",
        is_active=True,
        is_superuser=False,
        full_name="Recurring User",
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    company = Company(
        company_name="Recurring Co",
        currency="USD",
        registration_number="123",
        company_email="company@example.com",
        phone_number="123",
        user_id=user.id,
    )
    db.add(company)
    db.commit()
    db.refresh(company)

    recurring = create_recurring_schedule(
        session=db,
        user=user,
        company=company,
        schedule_in={
            "name": "Monthly Template",
            "frequency": "monthly",
            "interval": 1,
            "start_date": date.today(),
            "end_date": None,
            "next_run_date": datetime.now(timezone.utc),
            "due_after_days": 7,
            "recipient_email": "client@example.com",
            "max_occurrences": 3,
            "status": "Active",
        },
        template_payload={
            "company_id": company.id,
            "user_id": user.id,
            "doctype": "invoice",
            "client_id": None,
            "date": date.today(),
            "title": "Template Invoice",
            "item": [],
            "price_calculation": {"discount": 0, "tax_percentage": 0, "shipping": 0},
            "remark": "",
            "status": "Draft",
            "validity": None,
            "duedate": date.today() + timedelta(days=7),
        },
    )

    generated_count = process_due_recurring_schedules(session=db)

    assert generated_count >= 1
    recurring_after = db.get(RecurringConfig, recurring.id)
    assert recurring_after is not None
    assert recurring_after.generated_count == 1
    assert recurring_after.last_run_date is not None

    documents = db.exec(select(Document).where(Document.company_id == company.id)).all()
    assert len(documents) == 1
    assert documents[0].generated_from_recurring_id == recurring.id
    assert documents[0].duedate == date.today() + timedelta(days=7)


def test_delete_recurring_schedule(db: Session) -> None:
    user = User(
        email=f"recurring-delete-{date.today().strftime('%Y%m%d')}-{datetime.now(timezone.utc).microsecond}@example.com",
        hashed_password="test",
        is_active=True,
        is_superuser=False,
        full_name="Recurring Delete User",
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    company = Company(
        company_name="Recurring Delete Co",
        currency="USD",
        registration_number="1234",
        company_email="company_delete@example.com",
        phone_number="1234",
        user_id=user.id,
    )
    db.add(company)
    db.commit()
    db.refresh(company)

    recurring = create_recurring_schedule(
        session=db,
        user=user,
        company=company,
        schedule_in={
            "name": "Delete Template",
            "frequency": "monthly",
            "interval": 1,
            "start_date": date.today(),
            "end_date": None,
            "next_run_date": datetime.now(timezone.utc),
            "due_after_days": 7,
            "recipient_email": "client@example.com",
            "max_occurrences": 3,
            "status": "Active",
        },
        template_payload={
            "company_id": company.id,
            "user_id": user.id,
            "doctype": "invoice",
            "client_id": None,
            "date": date.today(),
            "title": "Template Delete Invoice",
            "item": [],
            "price_calculation": {"discount": 0, "tax_percentage": 0, "shipping": 0},
            "remark": "",
            "status": "Draft",
            "validity": None,
            "duedate": date.today() + timedelta(days=7),
        },
    )

    # Process once to generate a document referencing the recurring config
    process_due_recurring_schedules(session=db)

    # Verify entities exist in database
    cfg = db.get(RecurringConfig, recurring.id)
    assert cfg is not None
    
    template = db.exec(
        select(RecurringDoc).where(RecurringDoc.recurring_config_id == recurring.id)
    ).first()
    assert template is not None

    doc = db.exec(
        select(Document).where(Document.generated_from_recurring_id == recurring.id)
    ).first()
    assert doc is not None

    # Delete the recurring schedule
    delete_recurring_schedule(session=db, recurring=recurring)

    # Verify configuration and template are deleted
    db.expire_all()
    assert db.get(RecurringConfig, recurring.id) is None
    assert db.exec(
        select(RecurringDoc).where(RecurringDoc.recurring_config_id == recurring.id)
    ).first() is None

    # Verify generated document is NOT deleted but has its reference set to None
    doc_after = db.get(Document, doc.id)
    assert doc_after is not None
    assert doc_after.generated_from_recurring_id is None


def test_create_recurring_schedule_next_run_date_from_start_date(db: Session) -> None:
    user = User(
        email=f"recurring-nextrun-{date.today().strftime('%Y%m%d')}-{datetime.now(timezone.utc).microsecond}@example.com",
        hashed_password="test",
        is_active=True,
        is_superuser=False,
        full_name="Recurring NextRun User",
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    company = Company(
        company_name="Recurring NextRun Co",
        currency="USD",
        registration_number="5678",
        company_email="company_nextrun@example.com",
        phone_number="5678",
        user_id=user.id,
    )
    db.add(company)
    db.commit()
    db.refresh(company)

    future_start_date = date.today() + timedelta(days=10)

    recurring = create_recurring_schedule(
        session=db,
        user=user,
        company=company,
        schedule_in={
            "name": "Future Recurring Schedule",
            "frequency": "monthly",
            "interval": 1,
            "start_date": future_start_date,
            "status": "Active",
        },
        template_payload={
            "company_id": company.id,
            "user_id": user.id,
            "doctype": "invoice",
            "title": "Future Invoice Template",
            "item": [],
            "price_calculation": {},
        },
    )

    expected_next_run = datetime.combine(future_start_date, datetime.min.time(), timezone.utc)
    assert recurring.next_run_date == expected_next_run


def test_create_recurring_api(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    from app.core.config import settings

    payload = {
        "schedule": {
            "name": "API Test Recurring Schedule",
            "frequency": "monthly",
            "interval": 1,
            "start_date": str(date.today()),
            "due_after_days": 14,
            "status": "Active",
        },
        "template": {
            "doctype": "Invoice",
            "title": "API Test Template Title",
            "item": [],
            "price_calculation": {},
            "remark": "API test remark",
            "status": "Draft",
        },
        "generate_immediately": False,
    }
    response = client.post(
        f"{settings.API_V1_STR}/recurring/",
        headers=superuser_token_headers,
        json=payload,
    )
    assert response.status_code == 200, response.text
    data = response.json()
    assert "schedule" in data
    assert data["schedule"]["name"] == "API Test Recurring Schedule"

