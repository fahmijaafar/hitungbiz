import logging

from sqlmodel import Session, select

from app.models import (
    CapitalAllowanceRule,
    ExpenseTaxRule,
    TaxRateBracket,
    TaxRuleSet,
)

logger = logging.getLogger(__name__)

INDIVIDUAL_BUSINESS_BRACKETS_DATA = [
    {"sequence": 1, "min_amount": 0.0, "max_amount": 5000.0, "rate": 0.0, "description": "First RM5,000"},
    {"sequence": 2, "min_amount": 5000.0, "max_amount": 20000.0, "rate": 1.0, "description": "Next RM15,000"},
    {"sequence": 3, "min_amount": 20000.0, "max_amount": 35000.0, "rate": 3.0, "description": "Next RM15,000"},
    {"sequence": 4, "min_amount": 35000.0, "max_amount": 50000.0, "rate": 6.0, "description": "Next RM15,000"},
    {"sequence": 5, "min_amount": 50000.0, "max_amount": 70000.0, "rate": 11.0, "description": "Next RM20,000"},
    {"sequence": 6, "min_amount": 70000.0, "max_amount": 100000.0, "rate": 19.0, "description": "Next RM30,000"},
    {"sequence": 7, "min_amount": 100000.0, "max_amount": 400000.0, "rate": 25.0, "description": "Next RM300,000"},
    {"sequence": 8, "min_amount": 400000.0, "max_amount": 600000.0, "rate": 26.0, "description": "Next RM200,000"},
    {"sequence": 9, "min_amount": 600000.0, "max_amount": 2000000.0, "rate": 28.0, "description": "Next RM1,400,000"},
    {"sequence": 10, "min_amount": 2000000.0, "max_amount": None, "rate": 30.0, "description": "Above RM2,000,000"},
]

CORPORATE_SME_BRACKETS_DATA = [
    {
        "sequence": 1,
        "min_amount": 0.0,
        "max_amount": 150000.0,
        "rate": 15.0,
        "description": "First RM150,000",
    },
    {
        "sequence": 2,
        "min_amount": 150000.0,
        "max_amount": 600000.0,
        "rate": 17.0,
        "description": "Next RM450,000",
    },
    {
        "sequence": 3,
        "min_amount": 600000.0,
        "max_amount": None,
        "rate": 24.0,
        "description": "Above RM600,000",
    },
]

CORPORATE_STANDARD_BRACKETS_DATA = [
    {
        "sequence": 1,
        "min_amount": 0.0,
        "max_amount": None,
        "rate": 24.0,
        "description": "All chargeable income",
    },
]

TAX_RULE_SET_DATA = {
    "individual_business": INDIVIDUAL_BUSINESS_BRACKETS_DATA,
    "corporate_sme": CORPORATE_SME_BRACKETS_DATA,
    "corporate_standard": CORPORATE_STANDARD_BRACKETS_DATA,
}

CAPITAL_ALLOWANCE_DATA = [
    {
        "asset_class": "computer_ict",
        "initial_allowance_rate": 20.0,
        "annual_allowance_rate": 40.0,
        "special_rule": None,
    },
    {
        "asset_class": "motor_vehicle_heavy_machinery",
        "initial_allowance_rate": 20.0,
        "annual_allowance_rate": 20.0,
        "special_rule": None,
    },
    {
        "asset_class": "plant_machinery",
        "initial_allowance_rate": 20.0,
        "annual_allowance_rate": 14.0,
        "special_rule": None,
    },
    {
        "asset_class": "other_assets",
        "initial_allowance_rate": 20.0,
        "annual_allowance_rate": 10.0,
        "special_rule": None,
    },
    {
        "asset_class": "small_value_asset",
        "initial_allowance_rate": 100.0,
        "annual_allowance_rate": 0.0,
        "special_rule": "small_value_asset",
    },
]

EXPENSE_RULES_DATA = [
    # COST OF SALES
    {"category": "Stock / Raw Materials", "tax_treatment": "deductible", "ca_class": None},
    {"category": "Direct Labour", "tax_treatment": "deductible", "ca_class": None},
    {"category": "Subcontractor Fees", "tax_treatment": "deductible", "ca_class": None},
    {"category": "Freight In", "tax_treatment": "deductible", "ca_class": None},
    # EMPLOYEE EXPENSES
    {"category": "Salary & Wages", "tax_treatment": "deductible", "ca_class": None},
    {"category": "EPF", "tax_treatment": "deductible", "ca_class": None},
    {"category": "SOCSO & EIS", "tax_treatment": "deductible", "ca_class": None},
    {"category": "Employee Medical Expenses", "tax_treatment": "deductible", "ca_class": None},
    {"category": "Staff Claims", "tax_treatment": "conditional", "ca_class": None},
    {"category": "Training", "tax_treatment": "conditional", "ca_class": None},
    {"category": "Recruitment", "tax_treatment": "deductible", "ca_class": None},
    # PREMISES & UTILITIES
    {"category": "Office / Premises Rent", "tax_treatment": "deductible", "ca_class": None},
    {"category": "Equipment / Machinery Rental", "tax_treatment": "deductible", "ca_class": None},
    {"category": "Utilities", "tax_treatment": "deductible", "ca_class": None},
    {"category": "Telephone & Internet", "tax_treatment": "conditional", "ca_class": None},
    {"category": "Repairs & Maintenance", "tax_treatment": "conditional", "ca_class": None},
    # OFFICE & ADMINISTRATIVE
    {"category": "Office Supplies & Stationery", "tax_treatment": "deductible", "ca_class": None},
    {"category": "Books & Publications", "tax_treatment": "conditional", "ca_class": None},
    {"category": "Software & Subscriptions", "tax_treatment": "deductible", "ca_class": None},
    {"category": "Domain & Hosting", "tax_treatment": "deductible", "ca_class": None},
    {"category": "Postage & Courier", "tax_treatment": "deductible", "ca_class": None},
    # SALES & MARKETING
    {"category": "Marketing & Advertising", "tax_treatment": "deductible", "ca_class": None},
    {"category": "Website & Social Media", "tax_treatment": "deductible", "ca_class": None},
    {"category": "Sales Commission", "tax_treatment": "deductible", "ca_class": None},
    {"category": "Promotion", "tax_treatment": "deductible", "ca_class": None},
    {"category": "Entertainment", "tax_treatment": "conditional", "ca_class": None},
    {"category": "Client Gifts", "tax_treatment": "conditional", "ca_class": None},
    # TRAVEL & TRANSPORTATION
    {"category": "Business Travel", "tax_treatment": "conditional", "ca_class": None},
    {"category": "Transportation", "tax_treatment": "conditional", "ca_class": None},
    {"category": "Accommodation", "tax_treatment": "conditional", "ca_class": None},
    {"category": "Mileage & Parking", "tax_treatment": "conditional", "ca_class": None},
    {"category": "Tolls", "tax_treatment": "conditional", "ca_class": None},
    # PROFESSIONAL & COMPLIANCE
    {"category": "Accounting Fees", "tax_treatment": "deductible", "ca_class": None},
    {"category": "Audit Fees", "tax_treatment": "deductible", "ca_class": None},
    {"category": "Legal Fees", "tax_treatment": "conditional", "ca_class": None},
    {"category": "Tax Agent Fees", "tax_treatment": "conditional", "ca_class": None},
    {"category": "Secretarial Fees", "tax_treatment": "conditional", "ca_class": None},
    {"category": "Consultancy Fees", "tax_treatment": "conditional", "ca_class": None},
    {"category": "Business Licence Renewal", "tax_treatment": "deductible", "ca_class": None},
    # INSURANCE
    {"category": "Business Insurance", "tax_treatment": "deductible", "ca_class": None},
    {"category": "Fire & Theft Insurance", "tax_treatment": "deductible", "ca_class": None},
    {"category": "Other Business Insurance", "tax_treatment": "conditional", "ca_class": None},
    # FINANCIAL EXPENSES
    {"category": "Bank Charges", "tax_treatment": "deductible", "ca_class": None},
    {"category": "Interest Expense", "tax_treatment": "conditional", "ca_class": None},
    {"category": "Business Financing Interest", "tax_treatment": "deductible", "ca_class": None},
    {"category": "FX Loss", "tax_treatment": "conditional", "ca_class": None},
    {"category": "Bad Debts", "tax_treatment": "conditional", "ca_class": None},
    # FIXED ASSETS
    {"category": "Computer & ICT Equipment", "tax_treatment": "capital_allowance", "ca_class": "computer_ict"},
    {"category": "Office Equipment", "tax_treatment": "capital_allowance", "ca_class": "other_assets"},
    {"category": "Furniture & Fittings", "tax_treatment": "capital_allowance", "ca_class": "other_assets"},
    {"category": "Plant & Machinery", "tax_treatment": "capital_allowance", "ca_class": "plant_machinery"},
    {"category": "Motor Vehicles", "tax_treatment": "capital_allowance", "ca_class": "motor_vehicle_heavy_machinery"},
    {"category": "Other Fixed Assets", "tax_treatment": "capital_allowance", "ca_class": "other_assets"},
    {"category": "Small Value Assets", "tax_treatment": "capital_allowance", "ca_class": "small_value_asset"},
    # RENOVATION & IMPROVEMENTS
    {"category": "Renovation", "tax_treatment": "conditional", "ca_class": None},
    {"category": "Office Construction", "tax_treatment": "non_deductible", "ca_class": None},
    {"category": "Premises Improvements", "tax_treatment": "conditional", "ca_class": None},
    # BUSINESS SETUP & REGISTRATION
    {"category": "Business Registration", "tax_treatment": "non_deductible", "ca_class": None},
    {"category": "Initial Licence Fees", "tax_treatment": "non_deductible", "ca_class": None},
    {"category": "Business Incorporation / Setup Costs", "tax_treatment": "non_deductible", "ca_class": None},
    # DEPOSITS & PREPAYMENTS
    {"category": "Rental Deposit", "tax_treatment": "deposit", "ca_class": None},
    {"category": "Prepaid Rent", "tax_treatment": "prepayment", "ca_class": None},
    {"category": "Prepaid Insurance", "tax_treatment": "prepayment", "ca_class": None},
    {"category": "Other Deposits", "tax_treatment": "deposit", "ca_class": None},
    {"category": "Other Prepayments", "tax_treatment": "prepayment", "ca_class": None},
    # OWNER & PERSONAL
    {"category": "Owner Salary / Wages", "tax_treatment": "non_deductible", "ca_class": None},
    {"category": "Owner Drawings", "tax_treatment": "owner_drawing", "ca_class": None},
    {"category": "Personal Expenses", "tax_treatment": "non_deductible", "ca_class": None},
    {"category": "Personal Travel", "tax_treatment": "non_deductible", "ca_class": None},
    {"category": "Stock Withdrawn for Personal Use", "tax_treatment": "owner_drawing", "ca_class": None},
    # TAX & NON-DEDUCTIBLE
    {"category": "Income Tax", "tax_treatment": "non_deductible", "ca_class": None},
    {"category": "Traffic Fines", "tax_treatment": "non_deductible", "ca_class": None},
    {"category": "Penalties & Compounds", "tax_treatment": "non_deductible", "ca_class": None},
    {"category": "Political Donations", "tax_treatment": "non_deductible", "ca_class": None},
    {"category": "Religious / Other Donations", "tax_treatment": "conditional", "ca_class": None},
    {"category": "Non-Deductible Legal Fees", "tax_treatment": "non_deductible", "ca_class": None},
    # OTHER EXPENSES
    {"category": "Miscellaneous Business Expense", "tax_treatment": "conditional", "ca_class": None},
    {"category": "Other Non-Deductible Expense", "tax_treatment": "non_deductible", "ca_class": None},
]


def seed_tax_rules(session: Session) -> None:
    """Idempotently seed LHDN tax rule sets, tax rate brackets, expense tax rules,
    and capital allowance rules for 2025 and 2026.
    """
    years = [2025, 2026]
    country = "MY"

    for year in years:
        for taxpayer_type, brackets_data in TAX_RULE_SET_DATA.items():
            # 1. TaxRuleSet
            rule_set = session.exec(
                select(TaxRuleSet).where(
                    TaxRuleSet.tax_year == year,
                    TaxRuleSet.taxpayer_type == taxpayer_type,
                    TaxRuleSet.country == country,
                )
            ).first()

            if not rule_set:
                rule_set = TaxRuleSet(
                    tax_year=year,
                    taxpayer_type=taxpayer_type,
                    country=country,
                    is_active=True,
                )
                session.add(rule_set)
                session.commit()
                session.refresh(rule_set)
                logger.info(f"Created TaxRuleSet for {taxpayer_type} in {year}")

            # 2. TaxRateBracket
            for b_data in brackets_data:
                existing_bracket = session.exec(
                    select(TaxRateBracket).where(
                        TaxRateBracket.tax_rule_set_id == rule_set.id,
                        TaxRateBracket.sequence == b_data["sequence"],
                    )
                ).first()
                if not existing_bracket:
                    bracket = TaxRateBracket(
                        tax_rule_set_id=rule_set.id,
                        sequence=b_data["sequence"],
                        min_amount=b_data["min_amount"],
                        max_amount=b_data["max_amount"],
                        rate=b_data["rate"],
                        description=b_data["description"],
                    )
                    session.add(bracket)

            # 3. CapitalAllowanceRule
            for ca_data in CAPITAL_ALLOWANCE_DATA:
                existing_ca = session.exec(
                    select(CapitalAllowanceRule).where(
                        CapitalAllowanceRule.tax_rule_set_id == rule_set.id,
                        CapitalAllowanceRule.asset_class == ca_data["asset_class"],
                    )
                ).first()
                if not existing_ca:
                    ca_rule = CapitalAllowanceRule(
                        tax_rule_set_id=rule_set.id,
                        asset_class=ca_data["asset_class"],
                        initial_allowance_rate=ca_data["initial_allowance_rate"],
                        annual_allowance_rate=ca_data["annual_allowance_rate"],
                        special_rule=ca_data["special_rule"],
                    )
                    session.add(ca_rule)

            # 4. ExpenseTaxRule
            for exp_data in EXPENSE_RULES_DATA:
                existing_exp = session.exec(
                    select(ExpenseTaxRule).where(
                        ExpenseTaxRule.tax_rule_set_id == rule_set.id,
                        ExpenseTaxRule.category == exp_data["category"],
                    )
                ).first()
                if not existing_exp:
                    exp_rule = ExpenseTaxRule(
                        tax_rule_set_id=rule_set.id,
                        category=exp_data["category"],
                        tax_treatment=exp_data["tax_treatment"],
                        capital_allowance_class=exp_data["ca_class"],
                    )
                    session.add(exp_rule)

            session.commit()
            logger.info(
                "Seeded tax rules, brackets, and allowances for %s in %s",
                taxpayer_type,
                year,
            )
