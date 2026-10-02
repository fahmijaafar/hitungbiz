from datetime import datetime, timedelta, timezone
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.core.config import settings
from app.models import Company, Sale, User


def test_read_dashboard_chart_date_filtering(
    client: TestClient, db: Session, normal_user_token_headers: dict[str, str]
) -> None:
    # Get current user and verify email
    user = db.exec(select(User).where(User.email == settings.EMAIL_TEST_USER)).first()
    assert user is not None
    user.email_verified = True

    company = Company(
        company_name="Dashboard Test Co",
        currency="MYR",
        registration_number="REG123",
        company_email="testco@example.com",
        phone_number="123456789",
        user_id=user.id,
    )
    db.add(company)
    db.commit()
    db.refresh(company)
    user.company_id = company.id
    db.commit()

    # Create a sale for today (local date)
    today_str = datetime.now().strftime("%Y-%m-%d")
    sale = Sale(
        date=datetime.now().date(),
        channel="Online Store",
        notes="Today Revenue Sale",
        company_id=company.id,
        user_id=user.id,
        gross_amount=150.0,
        discount=0.0,
        net_sales=150.0,
        cancel_amount=0.0,
        short_over=0.0,
        refund=0.0,
        final_amount=150.0,
        status="Completed",
    )
    db.add(sale)
    db.commit()

    # Query dashboard chart with explicit start_date and end_date
    response = client.get(
        f"{settings.API_V1_STR}/dashboard/chart?start_date={today_str}&end_date={today_str}&period=month_to_date",
        headers=normal_user_token_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert "sales_overview" in data
    assert data["total_revenue"] >= 150.0

    # Query with period only (month_to_date)
    response_period = client.get(
        f"{settings.API_V1_STR}/dashboard/chart?period=month_to_date",
        headers=normal_user_token_headers,
    )
    assert response_period.status_code == 200
    data_period = response_period.json()
    assert data_period["total_revenue"] >= 150.0
