from app.api.routes.bank_reconciliation import (
    CATEGORY_RULES,
    EXPENSE_CATEGORIES,
    _classify,
    _clean_expense_category,
)


def test_category_rules_mirror_expense_categories():
    """Verify that all Expense / Bank Fee categories in CATEGORY_RULES are in EXPENSE_CATEGORIES."""
    for _, tx_type, category, _, _ in CATEGORY_RULES:
        if tx_type == "Expense":
            assert category in EXPENSE_CATEGORIES, f"Category '{category}' in CATEGORY_RULES is not in EXPENSE_CATEGORIES"


def test_classify_and_clean_expense_category():
    tx_type, category, action, confidence, _ = _classify("Monthly salary payment to staff", -5000.0)
    assert tx_type == "Expense"
    assert category == "Salary & Wages"
    assert category in EXPENSE_CATEGORIES

    tx_type, category, action, confidence, _ = _classify("KWSP contribution", -1000.0)
    assert category == "EPF"
    assert category in EXPENSE_CATEGORIES

    tx_type, category, action, confidence, _ = _classify("Petronas fuel receipt", -150.0)
    assert category == "Transportation"
    assert category in EXPENSE_CATEGORIES

    tx_type, category, action, confidence, _ = _classify("Unknown random payment", -50.0)
    assert category == "Miscellaneous Business Expense"
    assert _clean_expense_category(category) == "Miscellaneous Business Expense"
