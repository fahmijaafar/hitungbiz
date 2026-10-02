import datetime
import uuid
import json
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.core.config import settings
from app.models import Company, Purchase, Sale, User
from app.services.tax_seed_service import seed_tax_rules


def test_tax_advisor_api_flow(
    client: TestClient,
    superuser_token_headers: dict[str, str],
    db: Session,
) -> None:
    seed_tax_rules(db)

    # 1. Create company directly in DB and assign to superuser
    user = db.exec(select(User).where(User.email == settings.FIRST_SUPERUSER)).first()
    assert user is not None
    user.email_verified = True

    company = Company(

        company_name="API Tax Co",
        currency="MYR",
        registration_number=f"TAX-{uuid.uuid4().hex[:6]}",
        company_email=f"tax-{uuid.uuid4().hex[:6]}@example.com",
        phone_number="03-88888888",
        user_id=user.id,
    )
    db.add(company)
    db.commit()
    db.refresh(company)

    # Update user company access
    try:
        user_cids = json.loads(user.companies or "[]")
    except Exception:
        user_cids = []
    user_cids.append(str(company.id))
    user.companies = json.dumps(user_cids)
    user.company_id = company.id
    db.add(user)
    db.commit()

    company_id = str(company.id)

    # 2. Query available years -> []
    years_res = client.get(
        f"{settings.API_V1_STR}/companies/{company_id}/tax-advisor/years",
        headers=superuser_token_headers,
    )
    assert years_res.status_code == 200
    assert isinstance(years_res.json(), list)

    # Add transaction in 2025
    sale = Sale(
        company_id=company.id,
        date=datetime.date(2025, 7, 10),
        channel="Online",
        gross_amount=80000.0,
        discount=0.0,
        net_sales=80000.0,
        cancel_amount=0.0,
        short_over=0.0,
        refund=0.0,
        final_amount=80000.0,
        status="Completed",
    )
    purchase = Purchase(
        company_id=company.id,
        date=datetime.datetime(2025, 7, 15, tzinfo=datetime.timezone.utc),
        supplier_name="Landlord",
        category="Office / Premises Rent",
        amount=10000.0,
        tax=0.0,
        final_amount=10000.0,
        status="Paid",
        invoice_no="RENT-01",
    )
    db.add_all([sale, purchase])
    db.commit()

    # Re-query years -> [2025]
    years_res2 = client.get(
        f"{settings.API_V1_STR}/companies/{company_id}/tax-advisor/years",
        headers=superuser_token_headers,
    )
    assert years_res2.status_code == 200
    assert 2025 in years_res2.json()

    # 3. Query tax advisor analysis for 2025
    tax_res = client.get(
        f"{settings.API_V1_STR}/companies/{company_id}/tax-advisor/2025",
        headers=superuser_token_headers,
    )
    assert tax_res.status_code == 200
    data = tax_res.json()
    assert data["tax_year"] == 2025
    assert data["revenue"] == 80000.0
    assert data["expenses"] == 10000.0
    assert data["profit_before_tax"] == 70000.0
    assert data["chargeable_income"] == 70000.0
    assert data["estimated_tax_payable"] == 3700.0

    # 4. Query rate brackets reference
    brackets_res = client.get(
        f"{settings.API_V1_STR}/companies/{company_id}/tax-advisor/2025/brackets",
        headers=superuser_token_headers,
    )
    assert brackets_res.status_code == 200
    brackets = brackets_res.json()
    assert len(brackets) == 10
    assert brackets[0]["description"] == "First RM5,000"

    # 5. Record Tax Payment via API
    pay_payload = {
        "company_id": company_id,
        "tax_year": 2025,
        "payment_date": "2025-08-01",
        "amount": 2000.0,
        "payment_type": "cp500",
        "reference": "CP500-REF-100",
        "notes": "First installment",
    }
    pay_res = client.post(
        f"{settings.API_V1_STR}/companies/{company_id}/tax-advisor/2025/payments",
        headers=superuser_token_headers,
        json=pay_payload,
    )
    assert pay_res.status_code == 200
    payment_id = pay_res.json()["id"]

    # 6. Re-query tax advisor analysis to verify updated tax_paid and tax_remaining
    tax_res_after_pay = client.get(
        f"{settings.API_V1_STR}/companies/{company_id}/tax-advisor/2025",
        headers=superuser_token_headers,
    )
    assert tax_res_after_pay.status_code == 200
    data_after = tax_res_after_pay.json()
    assert data_after["tax_paid"] == 2000.0
    assert data_after["tax_remaining"] == 1700.0

    # 7. Delete tax payment record
    del_res = client.delete(
        f"{settings.API_V1_STR}/companies/{company_id}/tax-advisor/2025/payments/{payment_id}",
        headers=superuser_token_headers,
    )
    assert del_res.status_code == 200

    # Verify deleted
    tax_res_final = client.get(
        f"{settings.API_V1_STR}/companies/{company_id}/tax-advisor/2025",
        headers=superuser_token_headers,
    )
    assert tax_res_final.json()["tax_paid"] == 0.0

    # 8. Update company other_personal_taxable_income and check tax recalculation
    update_company_res = client.put(
        f"{settings.API_V1_STR}/companies/{company_id}",
        headers=superuser_token_headers,
        json={"other_personal_taxable_income": 30000.0},
    )
    assert update_company_res.status_code == 200
    assert update_company_res.json()["other_personal_taxable_income"] == 30000.0

    tax_res_with_other = client.get(
        f"{settings.API_V1_STR}/companies/{company_id}/tax-advisor/2025",
        headers=superuser_token_headers,
    )
    assert tax_res_with_other.status_code == 200
    data_other = tax_res_with_other.json()
    assert data_other["chargeable_income"] == 70000.0
    assert data_other["other_personal_taxable_income"] == 30000.0
    assert data_other["combined_taxable_income"] == 100000.0
    # Combined income of 100k produces a higher progressive tax payable than 70k (3700.0)
    assert data_other["estimated_tax_payable"] > 3700.0

