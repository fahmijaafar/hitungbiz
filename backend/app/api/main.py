from fastapi import APIRouter

from app.api.routes import (
    ai_insights,
    audit_logs,
    auth,
    bank_accounts,
    bank_reconciliation,
    clients,
    companies,
    dashboard,
    document_default_note,
    document_templates,
    documents,
    email_blasting,
    integrations,
    login,
    payments,
    private,
    products,
    purchases,
    recurring,
    sales,
    subscription,
    tax_advisor,
    transaction_imports,
    uploads,
    users,
    utils,
)
from app.core.config import settings

api_router = APIRouter()
api_router.include_router(login.router)
api_router.include_router(audit_logs.router)
api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(subscription.router)
api_router.include_router(payments.router)
api_router.include_router(utils.router)
api_router.include_router(sales.router)
api_router.include_router(transaction_imports.router)
api_router.include_router(purchases.router)
api_router.include_router(clients.router)
api_router.include_router(companies.router)
api_router.include_router(tax_advisor.router)
api_router.include_router(products.router)

api_router.include_router(documents.router)
api_router.include_router(document_default_note.router)
api_router.include_router(document_templates.router)
api_router.include_router(recurring.router)
api_router.include_router(integrations.router)
api_router.include_router(bank_accounts.router)
api_router.include_router(bank_reconciliation.router)
api_router.include_router(dashboard.router)
api_router.include_router(uploads.router)
api_router.include_router(ai_insights.router)
api_router.include_router(email_blasting.router)


if settings.ENVIRONMENT == "local":
    api_router.include_router(private.router)
