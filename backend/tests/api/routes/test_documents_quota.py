from __future__ import annotations

import uuid

from fastapi.testclient import TestClient
from sqlmodel import Session

from app import crud
from app.core.config import settings
from app.models import Company, Document, SubscriptionUsage, User, UserCreate
from app.services.entitlement_service import get_monthly_period, get_monthly_usage
from app.services.subscription_service import activate_subscription
from tests.utils.user import user_authentication_headers
from tests.utils.utils import random_email, random_lower_string

API = settings.API_V1_STR

DOCUMENT_PAYLOAD = {
    "docno": "DOC-Q-001",
    "doctype": "Invoice",
    "title": "Quota Test Document",
    "status": "Draft",
    "item": [],
    "price_calculation": {},
    "remark": "Quota test",
}


def _create_verified_user(db: Session) -> tuple[User, str, str]:
    email = random_email()
    password = random_lower_string()
    user_in = UserCreate(email=email, password=password)
    user = crud.create_user(session=db, user_create=user_in)
    user.email_verified = True
    db.add(user)
    db.commit()
    db.refresh(user)
    return user, email, password


def _auth_headers(client: TestClient, email: str, password: str) -> dict[str, str]:
    return user_authentication_headers(client=client, email=email, password=password)


def _set_plan(db: Session, user: User, plan: str) -> None:
    billing_period = None if plan == "personal" else "monthly"
    activate_subscription(db, user_id=user.id, plan=plan, billing_period=billing_period)
    db.commit()


def _set_document_usage(db: Session, user: User, count: int) -> None:
    period_start, period_end = get_monthly_period()
    db.add(
        SubscriptionUsage(
            user_id=user.id,
            feature="documents",
            period_type="monthly",
            period_start=period_start,
            period_end=period_end,
            usage_count=count,
        )
    )
    db.commit()


def _create_company(db: Session, user: User, name: str) -> Company:
    company = Company(
        company_name=name,
        currency="MYR",
        company_email=f"{uuid.uuid4().hex}@testco.com",
        phone_number="+60123456789",
        user_id=user.id,
    )
    db.add(company)
    db.commit()
    db.refresh(company)
    return company


def test_personal_document_quota_allows_19_of_20(
    client: TestClient,
    db: Session,
) -> None:
    user, email, password = _create_verified_user(db)
    _set_plan(db, user, "personal")
    _set_document_usage(db, user, 19)

    response = client.post(
        f"{API}/documents/",
        headers=_auth_headers(client, email, password),
        json={**DOCUMENT_PAYLOAD, "docno": f"DOC-{uuid.uuid4().hex[:8]}"},
    )

    assert response.status_code == 200, response.text
    assert get_monthly_usage(db, user_id=user.id, feature="documents") == 20


def test_personal_document_quota_denies_20_of_20(
    client: TestClient,
    db: Session,
) -> None:
    user, email, password = _create_verified_user(db)
    _set_plan(db, user, "personal")
    _set_document_usage(db, user, 20)

    response = client.post(
        f"{API}/documents/",
        headers=_auth_headers(client, email, password),
        json={**DOCUMENT_PAYLOAD, "docno": f"DOC-{uuid.uuid4().hex[:8]}"},
    )

    assert response.status_code == 403, response.text
    detail = response.json()["detail"]
    assert detail["error"] == "LIMIT_REACHED"
    assert detail["feature"] == "documents"
    assert detail["plan"] == "personal"
    assert detail["limit"] == 20
    assert detail["current_usage"] == 20
    assert detail["next_plan"] == "pro"


def test_pro_document_quota_boundary(client: TestClient, db: Session) -> None:
    user, email, password = _create_verified_user(db)
    _set_plan(db, user, "pro")
    _set_document_usage(db, user, 2000)

    response = client.post(
        f"{API}/documents/",
        headers=_auth_headers(client, email, password),
        json={**DOCUMENT_PAYLOAD, "docno": f"DOC-{uuid.uuid4().hex[:8]}"},
    )

    assert response.status_code == 403, response.text
    detail = response.json()["detail"]
    assert detail["plan"] == "pro"
    assert detail["limit"] == 2000
    assert detail["next_plan"] == "max"


def test_max_document_quota_is_unlimited(client: TestClient, db: Session) -> None:
    user, email, password = _create_verified_user(db)
    _set_plan(db, user, "max")
    _set_document_usage(db, user, 5000)

    response = client.post(
        f"{API}/documents/",
        headers=_auth_headers(client, email, password),
        json={**DOCUMENT_PAYLOAD, "docno": f"DOC-{uuid.uuid4().hex[:8]}"},
    )

    assert response.status_code == 200, response.text


def test_validation_failure_does_not_increment_document_usage(
    client: TestClient,
    db: Session,
) -> None:
    user, email, password = _create_verified_user(db)
    _set_plan(db, user, "personal")

    response = client.post(
        f"{API}/documents/",
        headers=_auth_headers(client, email, password),
        json={"doctype": "Invoice"},
    )

    assert response.status_code == 422
    assert get_monthly_usage(db, user_id=user.id, feature="documents") == 0


def test_document_quota_is_account_wide_across_companies(
    client: TestClient,
    db: Session,
) -> None:
    user, email, password = _create_verified_user(db)
    _set_plan(db, user, "personal")
    company_a = _create_company(db, user, "Quota A")
    company_b = _create_company(db, user, "Quota B")
    _set_document_usage(db, user, 19)

    headers = _auth_headers(client, email, password)
    first = client.post(
        f"{API}/documents/",
        headers=headers,
        json={
            **DOCUMENT_PAYLOAD,
            "company_id": str(company_a.id),
            "docno": f"DOC-{uuid.uuid4().hex[:8]}",
        },
    )
    second = client.post(
        f"{API}/documents/",
        headers=headers,
        json={
            **DOCUMENT_PAYLOAD,
            "company_id": str(company_b.id),
            "docno": f"DOC-{uuid.uuid4().hex[:8]}",
        },
    )

    assert first.status_code == 200, first.text
    assert second.status_code == 403, second.text
    assert db.get(Document, uuid.UUID(first.json()["id"])) is not None
