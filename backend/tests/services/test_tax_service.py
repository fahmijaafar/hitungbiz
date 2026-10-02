import datetime
import uuid

import pytest
from sqlmodel import Session, select

from app.models import Company, Purchase, Sale, TaxPayment
from app.services.tax_seed_service import seed_tax_rules
from app.services.tax_service import calculate_tax_position, get_available_tax_years


@pytest.fixture(autouse=True)
def ensure_tax_rules(db: Session):
    seed_tax_rules(db)


def create_test_company(
    db: Session,
    name: str = "Tax Test Co",
    company_type: str | None = None,
) -> Company:
    comp = Company(
        company_name=name,
        currency="MYR",
        registration_number=f"REG-{uuid.uuid4().hex[:8]}",
        company_email=f"info-{uuid.uuid4().hex[:8]}@test.com",
        phone_number="03-12345678",
        company_type=company_type,
    )
    db.add(comp)
    db.commit()
    db.refresh(comp)
    return comp


def test_tax_bracket_boundaries(db: Session):
    """Test exact progressive tax bracket boundaries for resident individual taxpayer."""
    company = create_test_company(db, "Bracket Boundary Co")

    # Helper function to create sales yielding exact income
    def run_income_test(income: float):
        # Clear existing sales/purchases for clean test
        sales = db.exec(select(Sale).where(Sale.company_id == company.id)).all()
        for s in sales:
            db.delete(s)
        db.commit()


        if income > 0:
            sale = Sale(
                company_id=company.id,
                date=datetime.date(2025, 6, 15),
                channel="Direct",
                gross_amount=income,
                discount=0.0,
                net_sales=income,
                cancel_amount=0.0,
                short_over=0.0,
                refund=0.0,
                final_amount=income,
                status="Completed",
            )
            db.add(sale)
            db.commit()

        return calculate_tax_position(db, company.id, 2025)

    # 1. RM0 income -> Tax RM0
    pos = run_income_test(0.0)
    assert pos.chargeable_income == 0.0
    assert pos.estimated_tax_payable == 0.0
    assert pos.effective_tax_rate == 0.0

    # 2. RM5,000 income -> 0% rate = RM0
    pos = run_income_test(5000.0)
    assert pos.chargeable_income == 5000.0
    assert pos.estimated_tax_payable == 0.0

    # 3. RM20,000 income -> First 5k @ 0%, Next 15k @ 1% (150) = RM150
    pos = run_income_test(20000.0)
    assert pos.chargeable_income == 20000.0
    assert pos.estimated_tax_payable == 150.0

    # 4. RM35,000 income -> 150 + Next 15k @ 3% (450) = RM600
    pos = run_income_test(35000.0)
    assert pos.chargeable_income == 35000.0
    assert pos.estimated_tax_payable == 600.0

    # 5. RM50,000 income -> 600 + Next 15k @ 6% (900) = RM1,500
    pos = run_income_test(50000.0)
    assert pos.chargeable_income == 50000.0
    assert pos.estimated_tax_payable == 1500.0

    # 6. RM70,000 income -> 1500 + Next 20k @ 11% (2200) = RM3,700
    pos = run_income_test(70000.0)
    assert pos.chargeable_income == 70000.0
    assert pos.estimated_tax_payable == 3700.0

    # 7. RM100,000 income -> 3700 + Next 30k @ 19% (5700) = RM9,400
    pos = run_income_test(100000.0)
    assert pos.chargeable_income == 100000.0
    assert pos.estimated_tax_payable == 9400.0

    # 8. RM400,000 income -> 9400 + Next 300k @ 25% (75000) = RM84,400
    pos = run_income_test(400000.0)
    assert pos.chargeable_income == 400000.0
    assert pos.estimated_tax_payable == 84400.0

    # 9. RM600,000 income -> 84400 + Next 200k @ 26% (52000) = RM136,400
    pos = run_income_test(600000.0)
    assert pos.chargeable_income == 600000.0
    assert pos.estimated_tax_payable == 136400.0

    # 10. RM2,000,000 income -> 136400 + Next 1.4m @ 28% (392000) = RM528,400
    pos = run_income_test(2000000.0)
    assert pos.chargeable_income == 2000000.0
    assert pos.estimated_tax_payable == 528400.0

    # 11. RM3,000,000 income -> 528400 + Above 2m (1m) @ 30% (300000) = RM828,400
    pos = run_income_test(3000000.0)
    assert pos.chargeable_income == 3000000.0
    assert pos.estimated_tax_payable == 828400.0


def test_expense_tax_treatments_and_no_double_counting(db: Session):
    """Verify accounting profit reconciliation, tax add-backs, and no double deduction of deductible expenses."""
    company = create_test_company(db, "Reconciliation Co")

    # Revenue = RM100,000
    sale = Sale(
        company_id=company.id,
        date=datetime.date(2025, 5, 10),
        channel="Direct",
        gross_amount=100000.0,
        discount=0.0,
        net_sales=100000.0,
        cancel_amount=0.0,
        short_over=0.0,
        refund=0.0,
        final_amount=100000.0,
        status="Completed",
    )
    db.add(sale)

    # 1. Deductible expense: Salary & Wages RM20,000
    p1 = Purchase(
        company_id=company.id,
        date=datetime.datetime(2025, 5, 12, tzinfo=datetime.timezone.utc),
        supplier_name="Staff",
        category="Salary & Wages",
        amount=20000.0,
        tax=0.0,
        final_amount=20000.0,
        status="Paid",
        invoice_no="SAL-001",
    )
    # 2. Non-deductible expense: Income Tax RM5,000
    p2 = Purchase(
        company_id=company.id,
        date=datetime.datetime(2025, 5, 12, tzinfo=datetime.timezone.utc),
        supplier_name="LHDN",
        category="Income Tax",
        amount=5000.0,
        tax=0.0,
        final_amount=5000.0,
        status="Paid",
        invoice_no="TAX-001",
    )
    # 3. Fixed Asset: Computer Equipment RM10,000 (CA: 20% IA + 40% AA = 60% = 6,000)
    p3 = Purchase(
        company_id=company.id,
        date=datetime.datetime(2025, 5, 12, tzinfo=datetime.timezone.utc),
        supplier_name="Dell",
        category="Computer & ICT Equipment",
        amount=10000.0,
        tax=0.0,
        final_amount=10000.0,
        status="Paid",
        invoice_no="INV-DELL",
    )
    db.add_all([p1, p2, p3])
    db.commit()

    pos = calculate_tax_position(db, company.id, 2025)

    # Revenue = 100,000
    # Accounting Expenses = 20,000 (salary) + 5,000 (tax) + 10,000 (computer) = 35,000
    # Profit Before Tax = 100,000 - 35,000 = 65,000
    assert pos.revenue == 100000.0
    assert pos.expenses == 35000.0
    assert pos.profit_before_tax == 65000.0

    # Deductible expenses = 20,000 (Salary) -> Net tax add-back = 0 (already deducted in PBT, NOT subtracted twice!)
    # Non-deductible = 5,000 (Income Tax) -> Add back +5,000
    # Fixed Asset purchase = 10,000 -> Add back +10,000
    # Capital Allowance = 6,000 (20% + 40% of 10,000) -> Deduct -6,000
    # Net Tax Adjustments = +5,000 + 10,000 - 6,000 = +9,000
    # Estimated Chargeable Income = 65,000 + 9,000 = 74,000
    assert pos.deductible_expenses == 20000.0
    assert pos.non_deductible_expenses == 5000.0
    assert pos.capital_allowance == 6000.0
    assert pos.tax_adjustments == 9000.0
    assert pos.chargeable_income == 74000.0


def test_tax_paid_and_overpayment(db: Session):
    """Test tax remaining and tax overpayment calculation."""
    company = create_test_company(db, "Tax Payment Co")

    # Income yielding Tax Payable of RM1,500 (Chargeable Income RM50,000)
    sale = Sale(
        company_id=company.id,
        date=datetime.date(2025, 4, 1),
        channel="Direct",
        gross_amount=50000.0,
        discount=0.0,
        net_sales=50000.0,
        cancel_amount=0.0,
        short_over=0.0,
        refund=0.0,
        final_amount=50000.0,
        status="Completed",
    )
    db.add(sale)
    db.commit()

    pos1 = calculate_tax_position(db, company.id, 2025)
    assert pos1.estimated_tax_payable == 1500.0
    assert pos1.tax_paid == 0.0
    assert pos1.tax_remaining == 1500.0
    assert pos1.overpaid_amount == 0.0

    # Add partial payment RM1,000
    payment1 = TaxPayment(
        company_id=company.id,
        tax_year=2025,
        payment_date=datetime.date(2025, 6, 30),
        amount=1000.0,
        payment_type="cp500",
    )
    db.add(payment1)
    db.commit()

    pos2 = calculate_tax_position(db, company.id, 2025)
    assert pos2.tax_paid == 1000.0
    assert pos2.tax_remaining == 500.0
    assert pos2.overpaid_amount == 0.0

    # Add second payment RM1,000 (Total paid = RM2,000 -> Overpaid RM500)
    payment2 = TaxPayment(
        company_id=company.id,
        tax_year=2025,
        payment_date=datetime.date(2025, 8, 31),
        amount=1000.0,
        payment_type="cp500",
    )
    db.add(payment2)
    db.commit()

    pos3 = calculate_tax_position(db, company.id, 2025)
    assert pos3.tax_paid == 2000.0
    assert pos3.tax_remaining == 0.0
    assert pos3.overpaid_amount == 500.0


def test_company_and_year_isolation(db: Session):
    """Verify company_id and tax_year boundaries are strictly enforced."""
    co_a = create_test_company(db, "Company A")
    co_b = create_test_company(db, "Company B")

    # Co A in 2025
    s_a_2025 = Sale(
        company_id=co_a.id,
        date=datetime.date(2025, 2, 1),
        channel="Direct",
        gross_amount=30000.0,
        discount=0.0,
        net_sales=30000.0,
        cancel_amount=0.0,
        short_over=0.0,
        refund=0.0,
        final_amount=30000.0,
        status="Completed",
    )
    # Co A in 2026
    s_a_2026 = Sale(
        company_id=co_a.id,
        date=datetime.date(2026, 2, 1),
        channel="Direct",
        gross_amount=60000.0,
        discount=0.0,
        net_sales=60000.0,
        cancel_amount=0.0,
        short_over=0.0,
        refund=0.0,
        final_amount=60000.0,
        status="Completed",
    )
    # Co B in 2025
    s_b_2025 = Sale(
        company_id=co_b.id,
        date=datetime.date(2025, 5, 1),
        channel="Direct",
        gross_amount=90000.0,
        discount=0.0,
        net_sales=90000.0,
        cancel_amount=0.0,
        short_over=0.0,
        refund=0.0,
        final_amount=90000.0,
        status="Completed",
    )
    db.add_all([s_a_2025, s_a_2026, s_b_2025])
    db.commit()

    # Check available years for Co A -> [2026, 2025]
    years_a = get_available_tax_years(db, co_a.id)
    assert years_a == [2026, 2025]

    # Check available years for Co B -> [2025]
    years_b = get_available_tax_years(db, co_b.id)
    assert years_b == [2025]

    # Co A in 2025 revenue must be 30,000, NOT mixing 2026 or Co B
    pos_a_2025 = calculate_tax_position(db, co_a.id, 2025)
    assert pos_a_2025.revenue == 30000.0

    # Co A in 2026 revenue must be 60,000
    pos_a_2026 = calculate_tax_position(db, co_a.id, 2026)
    assert pos_a_2026.revenue == 60000.0

    # Co B in 2025 revenue must be 90,000
    pos_b_2025 = calculate_tax_position(db, co_b.id, 2025)
    assert pos_b_2025.revenue == 90000.0


def test_taxpayer_type_uses_company_type_for_corporate_sme(db: Session):
    """Sdn Bhd companies should use corporate SME rates when recorded revenue is within the SME threshold."""
    sole_prop = create_test_company(db, "Sole Prop Co", "Sole Proprietorship")
    sdn_bhd = create_test_company(db, "Corporate SME Co", "Sdn Bhd (Private Limited)")

    for company in (sole_prop, sdn_bhd):
        sale = Sale(
            company_id=company.id,
            date=datetime.date(2025, 6, 1),
            channel="Direct",
            gross_amount=100000.0,
            discount=0.0,
            net_sales=100000.0,
            cancel_amount=0.0,
            short_over=0.0,
            refund=0.0,
            final_amount=100000.0,
            status="Completed",
        )
        db.add(sale)
    db.commit()

    sole_prop_pos = calculate_tax_position(db, sole_prop.id, 2025)
    sdn_bhd_pos = calculate_tax_position(db, sdn_bhd.id, 2025)

    assert sole_prop_pos.taxpayer_type == "individual_business"
    assert sole_prop_pos.estimated_tax_payable == 9400.0
    assert sdn_bhd_pos.taxpayer_type == "corporate_sme"
    assert sdn_bhd_pos.estimated_tax_payable == 15000.0
    assert sdn_bhd_pos.marginal_tax_rate == 15.0


def test_corporate_company_above_sme_gross_income_limit_uses_standard_rate(db: Session):
    """Corporate companies above RM50 million recorded gross income should use the standard 24% rate."""
    company = create_test_company(db, "Large Corporate Co", "Sdn Bhd (Private Limited)")

    sale = Sale(
        company_id=company.id,
        date=datetime.date(2025, 6, 1),
        channel="Direct",
        gross_amount=51000000.0,
        discount=0.0,
        net_sales=51000000.0,
        cancel_amount=0.0,
        short_over=0.0,
        refund=0.0,
        final_amount=51000000.0,
        status="Completed",
    )
    db.add(sale)
    db.commit()

    pos = calculate_tax_position(db, company.id, 2025)

    assert pos.taxpayer_type == "corporate_standard"
    assert pos.estimated_tax_payable == 12240000.0
    assert pos.marginal_tax_rate == 24.0
