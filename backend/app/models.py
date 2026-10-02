import datetime as _dt
import uuid
from datetime import datetime, timezone
from typing import Any

from pydantic import EmailStr
from sqlalchemy import CheckConstraint, JSON, BigInteger, Boolean, Column, Date, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint, Uuid
from sqlmodel import Field, SQLModel


def get_datetime_utc() -> datetime:
    return datetime.now(timezone.utc)


def get_default_document_running_numbers() -> dict[str, int]:
    return {
        "quotation": 1,
        "invoice": 1,
        "paymentvoucher": 1,
        "deliveryorder": 1,
    }



# Shared properties
class UserBase(SQLModel):
    email: EmailStr = Field(unique=True, index=True, max_length=255)
    is_active: bool = True
    is_superuser: bool = False
    full_name: str | None = Field(default=None, max_length=255)
    birthdate: _dt.date | None = Field(default=None, sa_type=Date)
    phone_number: str | None = Field(default=None, max_length=64)
    role: str = Field(default="user", max_length=50)
    company_id: uuid.UUID | None = Field(default=None, foreign_key="company.id")
    companies: str = Field(default="[]", max_length=2000)
    last_login_at: datetime | None = Field(
        default=None,
        sa_type=DateTime(timezone=True),  # type: ignore
    )
    onboarding_completed: bool = Field(default=False)
    email_verified: bool = Field(default=False)
    email_verified_at: datetime | None = Field(
        default=None,
        sa_type=DateTime(timezone=True),  # type: ignore
    )
    has_completed_tour: bool = Field(default=False)
    completed_tour_at: datetime | None = Field(
        default=None,
        sa_type=DateTime(timezone=True),  # type: ignore
    )


# Properties to receive via API on creation
class UserCreate(UserBase):
    password: str = Field(min_length=8, max_length=128)


class UserRegister(SQLModel):
    email: EmailStr = Field(max_length=255)
    password: str = Field(min_length=8, max_length=128)
    full_name: str | None = Field(default=None, max_length=255)
    birthdate: _dt.date | None = Field(default=None, sa_type=Date)
    phone_number: str | None = Field(default=None, max_length=64)


# Properties to receive via API on update, all are optional
class UserUpdate(UserBase):
    email: EmailStr | None = Field(default=None, max_length=255)
    password: str | None = Field(default=None, min_length=8, max_length=128)
    company_id: uuid.UUID | None = None
    has_completed_tour: bool | None = None
    completed_tour_at: datetime | None = None
    plan: str | None = None
    billing_period: str | None = None


class UserUpdateMe(SQLModel):
    full_name: str | None = Field(default=None, max_length=255)
    email: EmailStr | None = Field(default=None, max_length=255)
    birthdate: _dt.date | None = Field(default=None, sa_type=Date)
    phone_number: str | None = Field(default=None, max_length=64)
    company_id: uuid.UUID | None = None
    has_completed_tour: bool | None = None
    completed_tour_at: datetime | None = None


class UpdatePassword(SQLModel):
    current_password: str = Field(min_length=8, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)


# Database model, database table inferred from class name
class User(UserBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    hashed_password: str
    created_at: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )
    # Override to ensure DB column exists (already declared in UserBase but needs sa_type)
    last_login_at: datetime | None = Field(
        default=None,
        sa_type=DateTime(timezone=True),  # type: ignore
    )
    onboarding_completed: bool = Field(default=False)
    email_verified: bool = Field(default=False)
    email_verified_at: datetime | None = Field(
        default=None,
        sa_type=DateTime(timezone=True),  # type: ignore
    )
    has_completed_tour: bool = Field(default=False)
    completed_tour_at: datetime | None = Field(
        default=None,
        sa_type=DateTime(timezone=True),  # type: ignore
    )


# Properties to return via API, id is always required
class UserPublic(UserBase):
    id: uuid.UUID
    created_at: datetime | None = None
    last_login_at: datetime | None = None
    onboarding_completed: bool = False
    email_verified: bool = False
    email_verified_at: datetime | None = None
    has_completed_tour: bool = False
    completed_tour_at: datetime | None = None
    role: str = Field(default="user", max_length=50)
    company_id: uuid.UUID | None = None
    companies: str = Field(default="[]", max_length=2000)
    plan: str | None = None
    billing_period: str | None = None


class UsersPublic(SQLModel):
    data: list[UserPublic]
    count: int


# Email verification token (stores SHA-256 hash of raw token — raw token never persisted)
class EmailVerificationToken(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", index=True)
    token_hash: str = Field(max_length=64, unique=True, index=True)
    expires_at: datetime = Field(sa_type=DateTime(timezone=True))  # type: ignore
    used_at: datetime | None = Field(
        default=None,
        sa_type=DateTime(timezone=True),  # type: ignore
    )
    created_at: datetime = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )


# Request/response schemas for verification endpoints
class VerifyEmailRequest(SQLModel):
    token: str


class ResendVerificationResponse(SQLModel):
    message: str


# Sales models
class SaleBase(SQLModel):
    # store date only (no time)
    date: _dt.date = Field(default_factory=_dt.date.today, sa_type=Date)
    channel: str = Field(min_length=1, max_length=255)
    notes: str = Field(default="", max_length=2000)
    company_id: uuid.UUID | None = Field(default=None, foreign_key="company.id")
    user_id: uuid.UUID | None = Field(default=None, foreign_key="user.id")
    gross_amount: float
    discount: float
    net_sales: float
    cancel_amount: float
    short_over: float
    refund: float
    final_amount: float
    status: str = Field(min_length=1, max_length=255)


class SaleCreate(SaleBase):
    pass


class SaleUpdate(SQLModel):
    date: _dt.date | None = Field(default=None, sa_type=Date)
    channel: str | None = Field(default=None, max_length=255)
    notes: str | None = Field(default=None, max_length=2000)
    company_id: uuid.UUID | None = None
    user_id: uuid.UUID | None = None
    gross_amount: float | None = None
    discount: float | None = None
    net_sales: float | None = None
    cancel_amount: float | None = None
    short_over: float | None = None
    refund: float | None = None
    final_amount: float | None = None
    status: str | None = Field(default=None, max_length=255)


class Sale(SaleBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)


class SalePublic(SaleBase):
    id: uuid.UUID
    company_id: uuid.UUID | None = None
    user_id: uuid.UUID | None = None


class SalesPublic(SQLModel):
    data: list[SalePublic]
    count: int


class SalesChannelsPublic(SQLModel):
    data: list[str]


class PurchaseBase(SQLModel):
    date: datetime = Field(sa_type=DateTime(timezone=True))  # type: ignore
    due_date: _dt.date | None = Field(default=None, sa_type=Date)
    supplier_name: str = Field(min_length=1, max_length=255)
    category: str = Field(min_length=1, max_length=255)
    company_id: uuid.UUID | None = Field(default=None, foreign_key="company.id")
    user_id: uuid.UUID | None = Field(default=None, foreign_key="user.id")
    amount: float
    tax: float
    final_amount: float
    status: str = Field(min_length=1, max_length=255)
    invoice_no: str | None = Field(default=None, max_length=255)
    notes: str = Field(default="", max_length=2000)


class PurchaseCreate(PurchaseBase):
    pass


class PurchaseUpdate(SQLModel):
    date: datetime | None = Field(default=None, sa_type=DateTime(timezone=True))  # type: ignore
    due_date: _dt.date | None = Field(default=None, sa_type=Date)
    supplier_name: str | None = Field(default=None, max_length=255)
    category: str | None = Field(default=None, max_length=255)
    company_id: uuid.UUID | None = None
    user_id: uuid.UUID | None = None
    amount: float | None = None
    tax: float | None = None
    final_amount: float | None = None
    status: str | None = Field(default=None, max_length=255)
    invoice_no: str | None = Field(default=None, max_length=255)
    notes: str | None = Field(default=None, max_length=2000)


class Purchase(PurchaseBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)


class PurchasePublic(PurchaseBase):
    id: uuid.UUID


class PurchasesPublic(SQLModel):
    data: list[PurchasePublic]
    count: int


class PurchasesSuppliersPublic(SQLModel):
    data: list[str]



# Recurring schedules
class RecurringConfigBase(SQLModel):
    company_id: uuid.UUID | None = Field(default=None, foreign_key="company.id")
    user_id: uuid.UUID | None = Field(default=None, foreign_key="user.id")
    name: str = Field(min_length=1, max_length=255)
    frequency: str = Field(default="monthly", max_length=50)
    interval: int = Field(default=1, ge=1)
    start_date: _dt.date = Field(default_factory=_dt.date.today, sa_type=Date)
    end_date: _dt.date | None = Field(default=None, sa_type=Date)
    next_run_date: datetime | None = Field(default=None, sa_type=DateTime(timezone=True))  # type: ignore
    last_run_date: datetime | None = Field(default=None, sa_type=DateTime(timezone=True))  # type: ignore
    due_after_days: int = Field(default=0, ge=0)
    auto_send: bool = False
    recipient_email: str | None = Field(default=None, max_length=255)
    generated_count: int = Field(default=0, ge=0)
    max_occurrences: int | None = Field(default=None, ge=1)
    status: str = Field(default="Active", max_length=50)
    created_at: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )
    updated_at: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )


class RecurringConfigCreate(RecurringConfigBase):
    pass


class RecurringConfigUpdate(SQLModel):
    name: str | None = Field(default=None, max_length=255)
    frequency: str | None = Field(default=None, max_length=50)
    interval: int | None = Field(default=None, ge=1)
    start_date: _dt.date | None = Field(default=None, sa_type=Date)
    end_date: _dt.date | None = Field(default=None, sa_type=Date)
    next_run_date: datetime | None = Field(default=None, sa_type=DateTime(timezone=True))  # type: ignore
    last_run_date: datetime | None = Field(default=None, sa_type=DateTime(timezone=True))  # type: ignore
    due_after_days: int | None = Field(default=None, ge=0)
    auto_send: bool | None = None
    recipient_email: str | None = Field(default=None, max_length=255)
    generated_count: int | None = Field(default=None, ge=0)
    max_occurrences: int | None = Field(default=None, ge=1)
    status: str | None = Field(default=None, max_length=50)


class RecurringConfig(RecurringConfigBase, table=True):
    __tablename__ = "recurring_conf"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)


class RecurringConfigPublic(RecurringConfigBase):
    id: uuid.UUID


class RecurringConfigsPublic(SQLModel):
    data: list[RecurringConfigPublic]
    count: int


class RecurringScheduleCreate(SQLModel):
    schedule: RecurringConfigCreate
    template: "RecurringDocCreate"
    generate_immediately: bool = False


class RecurringScheduleUpdate(SQLModel):
    schedule: RecurringConfigUpdate | None = None
    template: "RecurringDocUpdate | None" = None


class RecurringDocBase(SQLModel):
    company_id: uuid.UUID | None = Field(default=None, foreign_key="company.id")
    user_id: uuid.UUID | None = Field(default=None, foreign_key="user.id")
    recurring_config_id: uuid.UUID | None = Field(default=None, foreign_key="recurring_conf.id")
    doctype: str = Field(default="invoice", min_length=1, max_length=255)
    client_id: uuid.UUID | None = Field(default=None, foreign_key="client.id")
    date: _dt.date = Field(default_factory=_dt.date.today, sa_type=Date)
    title: str = Field(min_length=1, max_length=255)
    item: list[dict[str, Any]] | dict[str, Any] = Field(
        default_factory=list,
        sa_column=Column(JSON, nullable=False),
    )
    price_calculation: dict[str, Any] = Field(
        default_factory=dict,
        sa_column=Column(JSON, nullable=False),
    )
    remark: str = Field(default="", sa_column=Column(Text, nullable=False))
    status: str = Field(default="Draft", min_length=1, max_length=255)
    validity: str | None = Field(default=None, max_length=255)
    duedate: _dt.date | None = Field(default=None, sa_type=Date)


class RecurringDocCreate(RecurringDocBase):
    pass


class RecurringDocUpdate(SQLModel):
    company_id: uuid.UUID | None = None
    user_id: uuid.UUID | None = None
    recurring_config_id: uuid.UUID | None = None
    doctype: str | None = Field(default=None, max_length=255)
    client_id: uuid.UUID | None = None
    date: _dt.date | None = Field(default=None, sa_type=Date)
    title: str | None = Field(default=None, max_length=255)
    item: list[dict[str, Any]] | dict[str, Any] | None = None
    price_calculation: dict[str, Any] | None = None
    remark: str | None = None
    status: str | None = Field(default=None, max_length=255)
    validity: str | None = Field(default=None, max_length=255)
    duedate: _dt.date | None = Field(default=None, sa_type=Date)


class RecurringDoc(RecurringDocBase, table=True):
    __tablename__ = "recurring_doc"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)


class RecurringDocPublic(RecurringDocBase):
    id: uuid.UUID


class RecurringDocsPublic(SQLModel):
    data: list[RecurringDocPublic]
    count: int


# Document model
class DocumentBase(SQLModel):
    company_id: uuid.UUID | None = Field(default=None, foreign_key="company.id")
    user_id: uuid.UUID | None = Field(default=None, foreign_key="user.id")
    docno: str = Field(min_length=1, max_length=255)
    doctype: str = Field(min_length=1, max_length=255)
    client_id: uuid.UUID | None = Field(default=None, foreign_key="client.id")
    date: _dt.date = Field(default_factory=_dt.date.today, sa_type=Date)
    title: str = Field(min_length=1, max_length=255)
    item: list[dict[str, Any]] | dict[str, Any] = Field(
        default_factory=list,
        sa_column=Column(JSON, nullable=False),
    )
    price_calculation: dict[str, Any] = Field(
        default_factory=dict,
        sa_column=Column(JSON, nullable=False),
    )
    remark: str = Field(default="", sa_column=Column(Text, nullable=False))
    status: str = Field(min_length=1, max_length=255)
    validity: str | None = Field(default=None, max_length=255)
    duedate: _dt.date | None = Field(default=None, sa_type=Date)
    generated_from_recurring_id: uuid.UUID | None = Field(
        default=None,
        foreign_key="recurring_conf.id",
    )
    stock_deducted: bool = Field(default=False)



class DocumentCreate(DocumentBase):
    pass


class DocumentUpdate(SQLModel):
    company_id: uuid.UUID | None = None
    user_id: uuid.UUID | None = None
    docno: str | None = Field(default=None, max_length=255)
    doctype: str | None = Field(default=None, max_length=255)
    client_id: uuid.UUID | None = None
    date: _dt.date | None = Field(default=None, sa_type=Date)
    title: str | None = Field(default=None, max_length=255)
    item: list[dict[str, Any]] | dict[str, Any] | None = None
    price_calculation: dict[str, Any] | None = None
    remark: str | None = None
    status: str | None = Field(default=None, max_length=255)
    validity: str | None = Field(default=None, max_length=255)
    duedate: _dt.date | None = Field(default=None, sa_type=Date)
    generated_from_recurring_id: uuid.UUID | None = None
    stock_deducted: bool | None = None



class Document(DocumentBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)


class DocumentPublic(DocumentBase):
    id: uuid.UUID


class DocumentsPublic(SQLModel):
    data: list[DocumentPublic]
    count: int


# Integration model
class IntegrationBase(SQLModel):
    company_id: uuid.UUID | None = Field(default=None, foreign_key="company.id")
    platform: str = Field(min_length=1, max_length=255)
    access_token: str = Field(sa_column=Column(Text, nullable=False))
    refresh_token: str | None = Field(default=None, sa_column=Column(Text, nullable=True))
    expires_at: datetime | None = Field(
        default=None,
        sa_type=DateTime(timezone=True),  # type: ignore
    )


class IntegrationCreate(IntegrationBase):
    pass


class IntegrationUpdate(SQLModel):
    company_id: uuid.UUID | None = None
    platform: str | None = Field(default=None, max_length=255)
    access_token: str | None = None
    refresh_token: str | None = None
    expires_at: datetime | None = Field(
        default=None,
        sa_type=DateTime(timezone=True),  # type: ignore
    )


class Integration(IntegrationBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)


class IntegrationPublic(IntegrationBase):
    id: uuid.UUID


class IntegrationsPublic(SQLModel):
    data: list[IntegrationPublic]
    count: int




# Product model
class ProductBase(SQLModel):
    product_name: str = Field(min_length=1, max_length=255)
    description: str | None = Field(default=None, sa_column=Column(Text, nullable=True))
    sku: str | None = Field(default=None, max_length=255)
    category: str = Field(default="", max_length=255)
    cost_price: float = Field(default=0.0)
    sell_price: float = Field(default=0.0)
    supplier: str | None = Field(default=None, max_length=255)
    stock_quantity: float = Field(default=0.0)
    unit_type: str = Field(default="pcs", max_length=50)
    company_id: uuid.UUID | None = Field(default=None, foreign_key="company.id")
    user_id: uuid.UUID | None = Field(default=None, foreign_key="user.id")


class ProductCreate(ProductBase):
    pass


class ProductUpdate(SQLModel):
    product_name: str | None = Field(default=None, max_length=255)
    description: str | None = None
    sku: str | None = Field(default=None, max_length=255)
    category: str | None = Field(default=None, max_length=255)
    cost_price: float | None = None
    sell_price: float | None = None
    supplier: str | None = Field(default=None, max_length=255)
    stock_quantity: float | None = None
    unit_type: str | None = Field(default=None, max_length=50)
    company_id: uuid.UUID | None = None


class Product(ProductBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    created_at: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )


class ProductPublic(ProductBase):
    id: uuid.UUID
    created_at: datetime | None = None


class ProductsPublic(SQLModel):
    data: list[ProductPublic]
    count: int


class ProductCategoriesPublic(SQLModel):
    data: list[str]


# Inventory Transaction model
class InventoryTransactionBase(SQLModel):
    product_id: uuid.UUID = Field(foreign_key="product.id")
    document_id: uuid.UUID | None = Field(default=None, foreign_key="document.id")
    document_number: str = Field(default="", max_length=255)
    quantity_deducted: float = Field(default=0.0)
    previous_stock: float = Field(default=0.0)
    new_stock: float = Field(default=0.0)
    company_id: uuid.UUID | None = Field(default=None, foreign_key="company.id")
    user_id: uuid.UUID | None = Field(default=None, foreign_key="user.id")


class InventoryTransactionCreate(InventoryTransactionBase):
    pass


class InventoryTransaction(InventoryTransactionBase, table=True):
    __tablename__ = "inventory_transaction"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    created_at: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )


class InventoryTransactionPublic(InventoryTransactionBase):
    id: uuid.UUID
    created_at: datetime | None = None


class InventoryTransactionsPublic(SQLModel):
    data: list[InventoryTransactionPublic]
    count: int



# Company model
class CompanyBase(SQLModel):
    company_name: str = Field(min_length=1, max_length=255)
    currency: str = Field(min_length=1, max_length=16)
    registration_number: str | None = Field(default=None, max_length=255)
    company_email: str = Field(min_length=1, max_length=255)
    phone_number: str = Field(min_length=1, max_length=64)
    company_url: str | None = Field(default=None, max_length=255)
    company_address: str | None = Field(default=None, max_length=2000)
    is_active: bool = Field(default=True, nullable=False)
    document_running_numbers: dict[str, int] = Field(
        default_factory=get_default_document_running_numbers,
        sa_column=Column(JSON, nullable=False),
    )
    # Extended company profile fields (all optional)
    employee_size: str | None = Field(default=None, max_length=32)
    business_industry: str | None = Field(default=None, max_length=128)
    company_type: str | None = Field(default=None, max_length=128)
    financial_year_end: str | None = Field(default="31-12", max_length=8)
    sst_registration_number: str | None = Field(default=None, max_length=64)
    einvoice_required: bool = Field(default=False)
    default_document_template_id: uuid.UUID | None = Field(default=None, nullable=True)
    other_personal_taxable_income: float = Field(default=0.0, ge=0.0)


class CompanyCreate(CompanyBase):
    pass


class CompanyUpdate(SQLModel):
    company_name: str | None = Field(default=None, max_length=255)
    currency: str | None = Field(default=None, max_length=16)
    registration_number: str | None = Field(default=None, max_length=255)
    company_email: str | None = Field(default=None, max_length=255)
    phone_number: str | None = Field(default=None, max_length=64)
    company_url: str | None = Field(default=None, max_length=255)
    company_address: str | None = Field(default=None, max_length=2000)
    is_active: bool | None = None
    document_running_numbers: dict[str, int] | None = None
    # Extended company profile fields (all optional)
    employee_size: str | None = Field(default=None, max_length=32)
    business_industry: str | None = Field(default=None, max_length=128)
    company_type: str | None = Field(default=None, max_length=128)
    financial_year_end: str | None = Field(default=None, max_length=8)
    sst_registration_number: str | None = Field(default=None, max_length=64)
    einvoice_required: bool | None = None
    default_document_template_id: uuid.UUID | None = None
    other_personal_taxable_income: float | None = Field(default=None, ge=0.0)


class Company(CompanyBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID | None = Field(default=None, foreign_key="user.id")


class CompanyPublic(CompanyBase):
    id: uuid.UUID
    user_id: uuid.UUID | None = None


class CompaniesPublic(SQLModel):
    data: list[CompanyPublic]
    count: int


class StaffMemberPublic(SQLModel):
    id: uuid.UUID
    name: str | None = None
    email: EmailStr
    phone_number: str | None = None
    avatar: str | None = None
    membership_type: str  # "owner" or "member"



class StaffPublic(SQLModel):
    data: list[StaffMemberPublic]
    count: int


class StaffAdd(SQLModel):
    email: EmailStr



# Client model
class ClientBase(SQLModel):
    name: str = Field(min_length=1, max_length=255)
    email: str = Field(max_length=255)
    phone_number: str | None = Field(default=None, max_length=64)
    company_name: str | None = Field(default=None, max_length=255)
    customer_type: str = Field(min_length=1, max_length=50)  # "individual" or "business"
    reg_number: str | None = Field(default=None, max_length=255)
    billing_address: str | None = Field(default=None, max_length=2000)
    company_id: uuid.UUID | None = Field(default=None, foreign_key="company.id")
    user_id: uuid.UUID | None = Field(default=None, foreign_key="user.id")


class ClientCreate(ClientBase):
    pass


class ClientUpdate(SQLModel):
    name: str | None = Field(default=None, max_length=255)
    email: str | None = Field(default=None, max_length=255)
    phone_number: str | None = Field(default=None, max_length=64)
    company_name: str | None = Field(default=None, max_length=255)
    customer_type: str | None = Field(default=None, max_length=50)
    reg_number: str | None = Field(default=None, max_length=255)
    billing_address: str | None = Field(default=None, max_length=2000)
    company_id: uuid.UUID | None = None


class Client(ClientBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    created_at: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )


class ClientPublic(ClientBase):
    id: uuid.UUID
    created_at: datetime | None = None


class ClientsPublic(SQLModel):
    data: list[ClientPublic]
    count: int


# Bank Account models
class BankAccountBase(SQLModel):
    bank_name: str = Field(min_length=1, max_length=255)
    account_name: str = Field(min_length=1, max_length=255)
    account_number: str = Field(min_length=1, max_length=255)
    account_type: str = Field(min_length=1, max_length=50)  # current, savings, others
    opening_balance: float = Field(default=0.0)
    opening_date: _dt.date = Field(default_factory=_dt.date.today, sa_type=Date)
    notes: str = Field(default="", max_length=2000)
    company_id: uuid.UUID | None = Field(default=None, foreign_key="company.id")
    user_id: uuid.UUID | None = Field(default=None, foreign_key="user.id")


class BankAccountCreate(BankAccountBase):
    pass


class BankAccountUpdate(SQLModel):
    bank_name: str | None = Field(default=None, max_length=255)
    account_name: str | None = Field(default=None, max_length=255)
    account_number: str | None = Field(default=None, max_length=255)
    account_type: str | None = Field(default=None, max_length=50)
    opening_balance: float | None = None
    opening_date: _dt.date | None = Field(default=None, sa_type=Date)
    notes: str | None = Field(default=None, max_length=2000)
    company_id: uuid.UUID | None = None


class BankAccount(BankAccountBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    created_at: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )


class BankAccountPublic(BankAccountBase):
    id: uuid.UUID
    created_at: datetime | None = None


class BankAccountsPublic(SQLModel):
    data: list[BankAccountPublic]
    count: int


# Dashboard summary
class DashboardSummary(SQLModel):
    total_revenue: float = 0.0
    total_expenses: float = 0.0


class MonthlyDataPoint(SQLModel):
    month: str = ""
    total: float = 0.0


class DashboardChartData(SQLModel):
    sales_overview: list[MonthlyDataPoint] = []
    purchases_overview: list[MonthlyDataPoint] = []
    total_revenue: float = 0.0
    total_expenses: float = 0.0


# AI financial summary models
class AIKeyMetric(SQLModel):
    label: str = ""
    value: str = ""
    trend: str = "flat"  # up | down | flat


class AIRecommendation(SQLModel):
    title: str = ""
    rationale: str = ""
    priority: str = "medium"  # high | medium | low


class AIFinancialSummary(SQLModel):
    headline: str = ""
    summary: str = ""
    period: str = ""
    key_metrics: list[AIKeyMetric] = []
    strengths: list[str] = []
    concerns: list[str] = []
    recommendations: list[AIRecommendation] = []
    # Deterministic figures the model was given (for transparency in the UI)
    fact_sheet: dict[str, Any] = Field(default_factory=dict)
    generated_at: datetime | None = None


# Persisted, company-level AI financial summary (single latest record per company)
class CompanyAISummary(SQLModel, table=True):
    __tablename__ = "company_ai_insights"
    __table_args__ = (
        UniqueConstraint("company_id", "module_type", name="uq_companyaisummary_company_id_module_type"),
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    company_id: uuid.UUID | None = Field(
        default=None, foreign_key="company.id", index=True
    )
    module_type: str = Field(
        default="financial_summary",
        max_length=50,
        sa_column=Column(String(length=50), nullable=False),
    )
    period: str = Field(default="last_6_months", max_length=50)
    data: dict[str, Any] = Field(
        default_factory=dict,
        sa_column=Column(JSON, nullable=False),
    )
    updated_at: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )


# AI receipt parsing models
class ReceiptParseRequest(SQLModel):
    text: str = Field(min_length=1, max_length=20000)


class ReceiptParseResult(SQLModel):
    supplier_name: str | None = None
    date: str | None = None  # YYYY-MM-DD
    due_date: str | None = None  # YYYY-MM-DD
    category: str | None = None
    invoice_no: str | None = None
    amount: float | None = None  # subtotal before tax
    tax: float | None = None  # tax amount
    description: str | None = None


# Transaction import models
class ImportField(SQLModel):
    key: str
    label: str
    type: str
    required: bool = False
    unique: bool = False
    aliases: list[str] = []
    default: Any | None = None


class ImportFieldList(SQLModel):
    import_type: str
    fields: list[ImportField]


class ImportDraftRecord(SQLModel):
    row_number: int
    data: dict[str, Any] = Field(default_factory=dict)
    original_row: dict[str, Any] = Field(default_factory=dict)
    selected: bool = True


class ImportValidationRequest(SQLModel):
    import_type: str
    company_id: uuid.UUID | None = None
    records: list[ImportDraftRecord]


class ImportValidatedRecord(SQLModel):
    row_number: int
    selected: bool = True
    status: str
    errors: list[str] = []
    original_row: dict[str, Any] = Field(default_factory=dict)
    data: dict[str, Any] = Field(default_factory=dict)


class ImportValidationResponse(SQLModel):
    records: list[ImportValidatedRecord]
    total_rows: int
    valid_rows: int
    invalid_rows: int


class ImportBulkRequest(SQLModel):
    import_type: str
    company_id: uuid.UUID | None = None
    records: list[ImportDraftRecord]
    batch_size: int = Field(default=100, ge=1, le=1000)


class ImportBulkResult(SQLModel):
    row_number: int
    status: str
    errors: list[str] = []


class ImportBulkResponse(SQLModel):
    imported: int
    failed: int
    skipped: int
    processing_time_ms: int
    results: list[ImportBulkResult]


# Bank reconciliation models
class BankImportSessionBase(SQLModel):
    company_id: uuid.UUID | None = Field(default=None, foreign_key="company.id", index=True)
    user_id: uuid.UUID | None = Field(default=None, foreign_key="user.id")
    source_type: str = Field(default="upload", max_length=50)
    file_name: str | None = Field(default=None, max_length=255)
    bank_name: str | None = Field(default=None, max_length=255)
    statement_start: _dt.date | None = Field(default=None, sa_type=Date)
    statement_end: _dt.date | None = Field(default=None, sa_type=Date)
    status: str = Field(default="Processing", max_length=50)
    duplicate_count: int = Field(default=0)
    transaction_count: int = Field(default=0)
    created_at: datetime | None = Field(default_factory=get_datetime_utc, sa_type=DateTime(timezone=True))  # type: ignore
    updated_at: datetime | None = Field(default_factory=get_datetime_utc, sa_type=DateTime(timezone=True))  # type: ignore
    completed_at: datetime | None = Field(default=None, sa_type=DateTime(timezone=True))  # type: ignore


class BankImportSession(BankImportSessionBase, table=True):
    __tablename__ = "bank_import_sessions"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)


class BankImportSessionPublic(BankImportSessionBase):
    id: uuid.UUID


class BankImportSessionsPublic(SQLModel):
    data: list[BankImportSessionPublic]
    count: int


class BankImportTransactionBase(SQLModel):
    session_id: uuid.UUID = Field(foreign_key="bank_import_sessions.id", index=True)
    company_id: uuid.UUID | None = Field(default=None, foreign_key="company.id", index=True)
    date: _dt.date = Field(sa_type=Date, index=True)
    description: str = Field(sa_column=Column(Text, nullable=False))
    reference: str | None = Field(default=None, max_length=255, index=True)
    amount: float
    debit: float = Field(default=0.0)
    credit: float = Field(default=0.0)
    balance: float | None = None
    raw_data: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))
    ai_status: str = Field(default="Analyzed", max_length=50)
    ai_transaction_type: str = Field(default="Unknown", max_length=50)
    ai_category: str | None = Field(default=None, max_length=255)
    ai_confidence: int = Field(default=0)
    ai_reason: str = Field(default="", sa_column=Column(Text, nullable=False))
    ai_suggested_action: str = Field(default="Review", max_length=50)
    reconciliation_status: str = Field(default="Needs Review", max_length=50, index=True)
    selected: bool = Field(default=False)
    final_action: str = Field(default="Review", max_length=50)
    final_category: str | None = Field(default=None, max_length=255)
    matched_record_type: str | None = Field(default=None, max_length=50)
    matched_record_id: uuid.UUID | None = None
    match_confidence: int | None = None
    match_reason: str | None = Field(default=None, sa_column=Column(Text, nullable=True))
    is_duplicate: bool = Field(default=False)
    duplicate_of_transaction_id: uuid.UUID | None = None
    ignored_reason: str | None = Field(default=None, max_length=500)
    created_record_type: str | None = Field(default=None, max_length=50)
    created_record_id: uuid.UUID | None = None
    applied_by: uuid.UUID | None = None
    applied_at: datetime | None = Field(default=None, sa_type=DateTime(timezone=True))  # type: ignore
    created_at: datetime | None = Field(default_factory=get_datetime_utc, sa_type=DateTime(timezone=True))  # type: ignore


class BankImportTransaction(BankImportTransactionBase, table=True):
    __tablename__ = "bank_import_transactions"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)


class BankImportTransactionPublic(BankImportTransactionBase):
    id: uuid.UUID


class BankImportTransactionsPublic(SQLModel):
    data: list[BankImportTransactionPublic]
    count: int


class BankReconciliationSummary(SQLModel):
    total: int = 0
    matched: int = 0
    needs_review: int = 0
    suggested_expenses: int = 0
    suggested_revenues: int = 0
    duplicates: int = 0
    ignored: int = 0
    applied: int = 0


class BankReconciliationSessionDetail(SQLModel):
    session: BankImportSessionPublic
    transactions: list[BankImportTransactionPublic]
    summary: BankReconciliationSummary


class BankReconciliationUploadResponse(BankReconciliationSessionDetail):
    warnings: list[str] = []


class BankReconciliationTransactionUpdate(SQLModel):
    selected: bool | None = None
    final_action: str | None = Field(default=None, max_length=50)
    final_category: str | None = Field(default=None, max_length=255)
    reconciliation_status: str | None = Field(default=None, max_length=50)
    matched_record_type: str | None = Field(default=None, max_length=50)
    matched_record_id: uuid.UUID | None = None
    ignored_reason: str | None = Field(default=None, max_length=500)


class BankReconciliationBulkUpdate(SQLModel):
    transaction_ids: list[uuid.UUID]
    selected: bool | None = None
    final_action: str | None = Field(default=None, max_length=50)
    final_category: str | None = Field(default=None, max_length=255)
    reconciliation_status: str | None = Field(default=None, max_length=50)


class BankReconciliationApplyRequest(SQLModel):
    transaction_ids: list[uuid.UUID] | None = None


class BankReconciliationApplyResponse(SQLModel):
    created_expenses: int = 0
    created_revenues: int = 0
    matched: int = 0
    ignored: int = 0
    skipped: int = 0


# Generic message
class Message(SQLModel):
    message: str


# JSON payload containing access token
class Token(SQLModel):
    access_token: str
    token_type: str = "bearer"


# Contents of JWT token
class TokenPayload(SQLModel):
    sub: str | None = None


class NewPassword(SQLModel):
    token: str
    new_password: str = Field(min_length=8, max_length=128)


# ────────────────────────────────────────────────────────────────────────────
# Email Blasting models
# ────────────────────────────────────────────────────────────────────────────

# ── Email Templates ──────────────────────────────────────────────────────────

class EmailTemplateBase(SQLModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = Field(default=None, sa_column=Column(Text, nullable=True))
    subject: str = Field(min_length=1, max_length=500)
    body: str = Field(sa_column=Column(Text, nullable=False))


class EmailTemplateCreate(EmailTemplateBase):
    pass


class EmailTemplateUpdate(SQLModel):
    name: str | None = Field(default=None, max_length=255)
    description: str | None = None
    subject: str | None = Field(default=None, max_length=500)
    body: str | None = None


class EmailTemplate(EmailTemplateBase, table=True):
    __tablename__ = "email_template"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    created_by: uuid.UUID | None = Field(default=None)
    created_at: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )
    updated_at: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )


class EmailTemplatePublic(EmailTemplateBase):
    id: uuid.UUID
    created_by: uuid.UUID | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class EmailTemplatesPublic(SQLModel):
    data: list[EmailTemplatePublic]
    count: int


# ── Email Campaigns ──────────────────────────────────────────────────────────

class EmailCampaignBase(SQLModel):
    subject: str = Field(min_length=1, max_length=500)
    body: str = Field(sa_column=Column(Text, nullable=False))
    filter_json: dict[str, Any] = Field(
        default_factory=dict,
        sa_column=Column(JSON, nullable=False),
    )
    recipient_count: int | None = Field(default=None)
    status: str = Field(default="draft", max_length=50)  # draft | sending | completed | failed


class EmailCampaignCreate(SQLModel):
    subject: str = Field(min_length=1, max_length=500)
    body: str
    filter_json: dict[str, Any] = Field(default_factory=dict)


class EmailCampaignUpdate(SQLModel):
    subject: str | None = Field(default=None, max_length=500)
    body: str | None = None
    filter_json: dict[str, Any] | None = None
    status: str | None = Field(default=None, max_length=50)


class EmailCampaign(EmailCampaignBase, table=True):
    __tablename__ = "email_campaign"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    created_by: uuid.UUID | None = Field(default=None)
    created_at: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )
    sent_at: datetime | None = Field(default=None, sa_type=DateTime(timezone=True))  # type: ignore


class EmailCampaignPublic(EmailCampaignBase):
    id: uuid.UUID
    created_by: uuid.UUID | None = None
    created_at: datetime | None = None
    sent_at: datetime | None = None


class EmailCampaignsPublic(SQLModel):
    data: list[EmailCampaignPublic]
    count: int


# ── Email Campaign Recipients ─────────────────────────────────────────────────

class EmailCampaignRecipientBase(SQLModel):
    campaign_id: uuid.UUID = Field(foreign_key="email_campaign.id")
    user_id: uuid.UUID | None = Field(default=None)
    email: str = Field(max_length=255)
    status: str = Field(default="pending", max_length=50)  # pending | sent | failed
    error_message: str | None = Field(default=None, sa_column=Column(Text, nullable=True))


class EmailCampaignRecipient(EmailCampaignRecipientBase, table=True):
    __tablename__ = "email_campaign_recipient"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    sent_at: datetime | None = Field(default=None, sa_type=DateTime(timezone=True))  # type: ignore


class EmailCampaignRecipientPublic(EmailCampaignRecipientBase):
    id: uuid.UUID
    sent_at: datetime | None = None


class EmailCampaignRecipientsPublic(SQLModel):
    data: list[EmailCampaignRecipientPublic]
    count: int


# ── Pydantic-only helpers ─────────────────────────────────────────────────────

class RecipientFilter(SQLModel):
    """Filter spec for resolving email campaign recipients.
    All fields are optional; combine freely. selected_user_ids always
    adds those users regardless of other filters.
    """
    all_users: bool = False
    new_users_days: int | None = None           # created_at >= now - X days
    active_within_days: int | None = None       # last_login_at >= now - X days
    onboarding_completed: bool | None = None    # filter by onboarding status
    active_only: bool = True                    # only is_active users
    superusers_only: bool = False
    selected_user_ids: list[str] = []           # additional / override UUIDs


class RecipientCountResponse(SQLModel):
    count: int


class SendTestEmailRequest(SQLModel):
    email_to: str = Field(max_length=255)
    subject: str = Field(min_length=1, max_length=500)
    body: str


class UserSearchResult(SQLModel):
    id: uuid.UUID
    full_name: str | None = None
    email: str


class UserSearchResults(SQLModel):
    data: list[UserSearchResult]


# ────────────────────────────────────────────────────────────────────────────
# LHDN Tax Advisor & Rule Database Models
# ────────────────────────────────────────────────────────────────────────────

class TaxRuleSetBase(SQLModel):
    tax_year: int = Field(index=True)
    taxpayer_type: str = Field(default="individual_business", max_length=50, index=True)
    country: str = Field(default="MY", max_length=10)
    is_active: bool = Field(default=True)
    effective_from: _dt.date | None = Field(default=None, sa_type=Date)
    effective_to: _dt.date | None = Field(default=None, sa_type=Date)


class TaxRuleSet(TaxRuleSetBase, table=True):
    __tablename__ = "tax_rule_set"
    __table_args__ = (
        UniqueConstraint("tax_year", "taxpayer_type", "country", name="uq_taxruleset_year_type_country"),
    )
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    created_at: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )
    updated_at: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )


class TaxRuleSetPublic(TaxRuleSetBase):
    id: uuid.UUID
    created_at: datetime | None = None
    updated_at: datetime | None = None


class TaxRateBracketBase(SQLModel):
    tax_rule_set_id: uuid.UUID = Field(foreign_key="tax_rule_set.id", index=True)
    sequence: int = Field(ge=1)
    min_amount: float = Field(ge=0.0)
    max_amount: float | None = Field(default=None)
    rate: float = Field(ge=0.0, le=100.0)  # Percentage, e.g. 11.0 for 11%
    description: str = Field(max_length=255)


class TaxRateBracket(TaxRateBracketBase, table=True):
    __tablename__ = "tax_rate_bracket"
    __table_args__ = (
        UniqueConstraint("tax_rule_set_id", "sequence", name="uq_taxratebracket_ruleset_seq"),
    )
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)


class TaxRateBracketPublic(TaxRateBracketBase):
    id: uuid.UUID


class ExpenseTaxRuleBase(SQLModel):
    tax_rule_set_id: uuid.UUID = Field(foreign_key="tax_rule_set.id", index=True)
    category: str = Field(max_length=255, index=True)
    tax_treatment: str = Field(max_length=50)  # deductible, conditional, non_deductible, capital_allowance, prepayment, deposit, owner_drawing
    capital_allowance_class: str | None = Field(default=None, max_length=100)
    notes: str | None = Field(default=None, sa_column=Column(Text, nullable=True))


class ExpenseTaxRule(ExpenseTaxRuleBase, table=True):
    __tablename__ = "expense_tax_rule"
    __table_args__ = (
        UniqueConstraint("tax_rule_set_id", "category", name="uq_expensetaxrule_ruleset_category"),
    )
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)


class ExpenseTaxRulePublic(ExpenseTaxRuleBase):
    id: uuid.UUID


class CapitalAllowanceRuleBase(SQLModel):
    tax_rule_set_id: uuid.UUID = Field(foreign_key="tax_rule_set.id", index=True)
    asset_class: str = Field(max_length=100, index=True)  # computer_ict, motor_vehicle_heavy_machinery, plant_machinery, other_assets, small_value_asset
    initial_allowance_rate: float = Field(default=20.0, ge=0.0, le=100.0)
    annual_allowance_rate: float = Field(default=10.0, ge=0.0, le=100.0)
    special_rule: str | None = Field(default=None, max_length=100)


class CapitalAllowanceRule(CapitalAllowanceRuleBase, table=True):
    __tablename__ = "capital_allowance_rule"
    __table_args__ = (
        UniqueConstraint("tax_rule_set_id", "asset_class", name="uq_carule_ruleset_assetclass"),
    )
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)


class CapitalAllowanceRulePublic(CapitalAllowanceRuleBase):
    id: uuid.UUID


class TaxPaymentBase(SQLModel):
    company_id: uuid.UUID = Field(foreign_key="company.id", index=True)
    user_id: uuid.UUID | None = Field(default=None, foreign_key="user.id")
    tax_year: int = Field(index=True)
    payment_date: _dt.date = Field(default_factory=_dt.date.today, sa_type=Date)
    amount: float = Field(gt=0.0)
    payment_type: str = Field(default="cp500", max_length=50)  # cp500, cp207, installment, final, custom
    reference: str | None = Field(default=None, max_length=255)
    notes: str | None = Field(default=None, sa_column=Column(Text, nullable=True))


class TaxPaymentCreate(TaxPaymentBase):
    pass


class TaxPayment(TaxPaymentBase, table=True):
    __tablename__ = "tax_payment"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    created_at: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )
    updated_at: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )


class TaxPaymentPublic(TaxPaymentBase):
    id: uuid.UUID
    created_at: datetime | None = None
    updated_at: datetime | None = None


class TaxPaymentsPublic(SQLModel):
    data: list[TaxPaymentPublic]
    count: int


# ── Tax Advisor API Schemas ──────────────────────────────────────────────────

class CapitalAllowanceDetail(SQLModel):
    purchase_id: uuid.UUID | None = None
    asset: str
    purchase_date: str
    purchase_cost: float
    asset_class: str
    initial_allowance_rate: float
    annual_allowance_rate: float
    initial_allowance: float
    annual_allowance: float
    total_allowance: float
    remaining_qualifying_expenditure: float
    review_warning: str | None = None


class ExpenseCategoryDeduction(SQLModel):
    category: str
    total_recorded: float
    tax_treatment: str
    estimated_deductible: float
    requires_review: bool
    notes: str | None = None


class TaxBracketBreakdown(SQLModel):
    bracket: str
    min_amount: float
    max_amount: float | None = None
    taxable_amount: float
    rate: float
    tax: float


class TaxAdvisorAnalysis(SQLModel):
    company_id: uuid.UUID
    tax_year: int
    taxpayer_type: str

    revenue: float
    expenses: float
    profit_before_tax: float

    deductible_expenses: float
    conditional_expenses: float
    non_deductible_expenses: float
    capital_allowance: float
    tax_adjustments: float

    chargeable_income: float
    other_personal_taxable_income: float = 0.0
    combined_taxable_income: float = 0.0
    estimated_tax_payable: float
    effective_tax_rate: float
    marginal_tax_rate: float

    tax_paid: float
    tax_remaining: float
    overpaid_amount: float

    tax_brackets: list[TaxBracketBreakdown] = []
    deductions_by_category: list[ExpenseCategoryDeduction] = []
    capital_allowance_details: list[CapitalAllowanceDetail] = []
    requires_review: list[str] = []
    warnings: list[str] = []


# ── Document Default Note ──────────────────────────────────────────────────────

class DocumentDefaultNoteBase(SQLModel):
    document_type: str = Field(min_length=1, max_length=64)
    default_notes_enabled: bool = Field(default=False)
    default_notes: str = Field(default="", sa_column=Column(Text, nullable=False))


class DocumentDefaultNoteCreate(DocumentDefaultNoteBase):
    pass


class DocumentDefaultNoteUpdate(SQLModel):
    default_notes_enabled: bool | None = None
    default_notes: str | None = None


class DocumentDefaultNote(DocumentDefaultNoteBase, table=True):
    __tablename__ = "document_default_note"
    __table_args__ = (UniqueConstraint("company_id", "document_type"),)

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    company_id: uuid.UUID | None = Field(default=None, foreign_key="company.id")
    created_at: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )
    updated_at: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )


class DocumentDefaultNotePublic(DocumentDefaultNoteBase):
    id: uuid.UUID
    company_id: uuid.UUID | None = None


class DocumentDefaultNotesPublic(SQLModel):
    data: list[DocumentDefaultNotePublic]


# ── Document Template ──────────────────────────────────────────────────────────

class DocumentTemplateBase(SQLModel):
    name: str = Field(min_length=1, max_length=128)
    code: str = Field(min_length=1, max_length=64, index=True)
    description: str | None = Field(default=None, max_length=512)
    is_default: bool = Field(default=False)
    is_active: bool = Field(default=True)


class DocumentTemplate(DocumentTemplateBase, table=True):
    __tablename__ = "document_template"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    created_at: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )
    updated_at: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )


class DocumentTemplatePublic(DocumentTemplateBase):
    id: uuid.UUID


class DocumentTemplatesPublic(SQLModel):
    data: list[DocumentTemplatePublic]


# ── Audit Log ──────────────────────────────────────────────────────────────────

class AuditLogBase(SQLModel):
    company_id: uuid.UUID | None = Field(
        default=None,
        sa_column=Column(
            Uuid, ForeignKey("company.id", ondelete="SET NULL"), nullable=True, index=True
        ),
    )
    user_id: uuid.UUID | None = Field(
        default=None,
        sa_column=Column(
            Uuid, ForeignKey("user.id", ondelete="SET NULL"), nullable=True, index=True
        ),
    )
    module: str = Field(max_length=100, index=True)
    table_name: str = Field(max_length=100)
    record_id: str | None = Field(default=None, max_length=255)
    action: str = Field(max_length=30, index=True)
    entity_name: str | None = Field(default=None, max_length=255)
    description: str = Field(sa_column=Column(Text, nullable=False))
    old_data: dict[str, Any] | None = Field(default=None, sa_column=Column(JSON, nullable=True))
    new_data: dict[str, Any] | None = Field(default=None, sa_column=Column(JSON, nullable=True))
    log_metadata: dict[str, Any] | None = Field(default=None, sa_column=Column("metadata", JSON, nullable=True))
    ip_address: str | None = Field(default=None, max_length=100)
    user_agent: str | None = Field(default=None, sa_column=Column(Text, nullable=True))
    created_at: datetime = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
        index=True,
    )


class AuditLog(AuditLogBase, table=True):
    __tablename__ = "audit_logs"

    id: int | None = Field(
        default=None,
        sa_column=Column(BigInteger, primary_key=True, autoincrement=True),
    )


class AuditLogPublic(AuditLogBase):
    id: int
    user_email: str | None = None
    user_full_name: str | None = None
    company_name: str | None = None


class AuditLogsPublic(SQLModel):
    data: list[AuditLogPublic]
    count: int


# ---------------------------------------------------------------------------
# Subscription models
# ---------------------------------------------------------------------------

class SubscriptionPlan(str):
    """Valid subscription plan identifiers."""
    PERSONAL = "personal"
    PRO = "pro"
    MAX = "max"


SUBSCRIPTION_PLAN_VALUES = ("personal", "pro", "max")
BILLING_PERIOD_VALUES = ("monthly", "yearly")
SUBSCRIPTION_STATUS_VALUES = ("active", "expired", "cancelled")


class UserSubscription(SQLModel, table=True):
    """
    One row per subscription period for a user.

    Design notes:
    - billing_period, started_at, and expires_at are nullable.
      Personal plan is perpetual: all three are NULL.
    - status + expires_at together determine whether a paid subscription
      is currently active (expires_at must still be in the future).
    - There is a unique constraint on user_id so there is always exactly
      one current subscription row per user (history is preserved by
      creating new rows rather than updating; the unique constraint is on
      (user_id) for the simple current-only design).
    """

    __tablename__ = "user_subscriptions"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(
        sa_column=Column(
            Uuid,
            ForeignKey("user.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
            unique=True,  # one current subscription per user
        )
    )
    plan: str = Field(max_length=50)
    billing_period: str | None = Field(
        default=None,
        sa_column=Column(String(50), nullable=True),
    )
    status: str = Field(max_length=50)
    started_at: datetime | None = Field(
        default=None,
        sa_type=DateTime(timezone=True),  # type: ignore
    )
    expires_at: datetime | None = Field(
        default=None,
        sa_type=DateTime(timezone=True),  # type: ignore
    )
    cancel_at_period_end: bool = Field(
        default=False,
        sa_column=Column(Boolean(), nullable=False, server_default="false"),
    )
    auto_renew: bool = Field(
        default=False,
        sa_column=Column(Boolean(), nullable=False, server_default="false"),
    )
    next_renewal_at: datetime | None = Field(
        default=None,
        sa_type=DateTime(timezone=True),  # type: ignore
    )
    gateway: str | None = Field(
        default=None,
        sa_column=Column(String(50), nullable=True),
    )
    gateway_customer_id: str | None = Field(
        default=None,
        sa_column=Column(String(255), nullable=True),
    )
    gateway_subscription_id: str | None = Field(
        default=None,
        sa_column=Column(String(255), nullable=True),
    )
    chip_client_id: str | None = Field(
        default=None,
        sa_column=Column(String(255), nullable=True),
    )
    chip_recurring_token: str | None = Field(
        default=None,
        sa_column=Column(String(255), nullable=True),
    )
    created_at: datetime = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )
    updated_at: datetime = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )

    __table_args__ = (
        Index("ix_usersubscription_user_id", "user_id"),
        Index("ix_usersubscription_status", "status"),
        Index("ix_usersubscription_expires_at", "expires_at"),
        Index("ix_usersubscription_auto_renew_next", "status", "auto_renew", "next_renewal_at"),
    )


class UserSubscriptionPublic(SQLModel):
    """Public representation of a user's current subscription."""

    plan: str
    effective_plan: str = "personal"
    billing_period: str | None = None
    status: str
    started_at: datetime | None = None
    expires_at: datetime | None = None
    cancel_at_period_end: bool = False
    auto_renew: bool = False
    next_renewal_at: datetime | None = None


class SubscriptionPayment(SQLModel, table=True):
    """Payment transaction records for subscriptions."""

    __tablename__ = "subscription_payments"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(
        sa_column=Column(
            Uuid,
            ForeignKey("user.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        )
    )
    subscription_id: uuid.UUID | None = Field(
        default=None,
        sa_column=Column(
            Uuid,
            ForeignKey("user_subscriptions.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    provider: str = Field(default="chip", max_length=50)
    provider_purchase_id: str | None = Field(
        default=None,
        sa_column=Column(String(255), nullable=True, index=True),
    )
    provider_payment_id: str | None = Field(
        default=None,
        sa_column=Column(String(255), nullable=True),
    )
    plan: str = Field(max_length=50)
    billing_interval: str = Field(max_length=50)
    payment_type: str = Field(
        default="initial",
        sa_column=Column(String(50), nullable=False, server_default="initial"),
    )  # initial, manual_renewal, automatic_renewal
    amount: int = Field(default=0)  # In smallest currency unit (e.g., MYR cents)
    currency: str = Field(default="MYR", max_length=10)
    status: str = Field(default="pending", max_length=50)  # pending, paid, failed, refunded
    reference: str = Field(
        sa_column=Column(String(255), nullable=False, unique=True, index=True)
    )
    paid_at: datetime | None = Field(
        default=None,
        sa_type=DateTime(timezone=True),  # type: ignore
    )
    created_at: datetime = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )
    updated_at: datetime = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )

    __table_args__ = (
        Index("ix_subscriptionpayment_user_id", "user_id"),
        Index("ix_subscriptionpayment_status", "status"),
    )


class SubscriptionRenewal(SQLModel, table=True):
    """
    Individual automatic renewal attempts for user subscriptions.
    """

    __tablename__ = "subscription_renewals"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    subscription_id: uuid.UUID = Field(
        sa_column=Column(
            Uuid,
            ForeignKey("user_subscriptions.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        )
    )
    user_id: uuid.UUID = Field(
        sa_column=Column(
            Uuid,
            ForeignKey("user.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        )
    )
    billing_period_start: datetime = Field(
        sa_type=DateTime(timezone=True),  # type: ignore
        nullable=False,
    )
    billing_period_end: datetime = Field(
        sa_type=DateTime(timezone=True),  # type: ignore
        nullable=False,
    )
    scheduled_at: datetime = Field(
        sa_type=DateTime(timezone=True),  # type: ignore
        nullable=False,
    )
    attempted_at: datetime | None = Field(
        default=None,
        sa_type=DateTime(timezone=True),  # type: ignore
    )
    completed_at: datetime | None = Field(
        default=None,
        sa_type=DateTime(timezone=True),  # type: ignore
    )
    status: str = Field(
        default="pending",
        sa_column=Column(String(50), nullable=False, server_default="pending"),
    )  # pending, processing, paid, failed, cancelled
    chip_purchase_id: str | None = Field(
        default=None,
        sa_column=Column(String(255), nullable=True),
    )
    amount: int = Field(default=0)  # In smallest currency unit (MYR cents)
    currency: str = Field(default="MYR", max_length=10)
    failure_reason: str | None = Field(
        default=None,
        sa_column=Column(String(500), nullable=True),
    )
    attempt_count: int = Field(
        default=1,
        sa_column=Column(Integer, nullable=False, server_default="1"),
    )
    next_retry_at: datetime | None = Field(
        default=None,
        sa_type=DateTime(timezone=True),  # type: ignore
    )
    created_at: datetime = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )
    updated_at: datetime = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )

    __table_args__ = (
        UniqueConstraint(
            "subscription_id",
            "billing_period_start",
            "billing_period_end",
            name="uq_subscriptionrenewal_sub_period",
        ),
        CheckConstraint(
            "billing_period_end >= billing_period_start",
            name="chk_subscriptionrenewal_period_valid",
        ),
        Index("ix_subscriptionrenewal_subscription_id", "subscription_id"),
        Index("ix_subscriptionrenewal_user_id", "user_id"),
        Index("ix_subscriptionrenewal_status", "status"),
    )


class UserPaymentPublic(SQLModel):
    """Public representation of a user's subscription payment record."""

    id: uuid.UUID
    provider: str
    plan: str
    billing_interval: str
    amount: int
    currency: str
    status: str
    reference: str
    paid_at: datetime | None = None
    created_at: datetime


class SubscriptionHistoryPublic(SQLModel):
    """Public representation of a past subscription period event."""

    plan: str
    billing_interval: str | None = None
    period: str | None = None
    status: str
    created_at: datetime | None = None


class OverLimitWarningPublic(SQLModel):
    """Warning item when an expired subscription's current resources exceed personal limits."""

    feature: str
    label: str
    current: int
    limit: int
    message: str


class QuotaStatusPublic(SQLModel):
    """Usage and limit pair for quota features like documents and ocr."""

    used: int
    limit: int | None = None


class AISummaryQuotaPublic(SQLModel):
    """Status for AI summary quota and cooldown."""

    available: bool
    cooldown_seconds: int | None = None
    next_available_at: datetime | None = None


class SubscriptionDetailsPublic(SQLModel):
    """Consolidated subscription management overview details."""

    plan: str
    effective_plan: str = "personal"
    status: str
    billing_interval: str | None = None
    current_period_start: datetime | None = None
    current_period_end: datetime | None = None
    cancel_at_period_end: bool = False
    auto_renew: bool = False
    next_renewal_at: datetime | None = None
    is_approaching_expiry: bool = False
    days_until_expiry: int | None = None
    is_expired: bool = False
    limits: dict[str, Any]
    usage: dict[str, Any]
    over_limit_warnings: list[OverLimitWarningPublic] = []
    subscription_history: list[SubscriptionHistoryPublic] = []
    payment_history: list[UserPaymentPublic] = []


class SubscriptionRenewRequest(SQLModel):
    """Payload to renew an existing paid subscription."""

    billing_interval: str | None = None


class SubscriptionRenewResponse(SQLModel):
    """Response returned upon successfully creating a renewal payment purchase."""

    checkout_url: str
    reference: str


class PaymentWebhookEvent(SQLModel, table=True):
    """Internal webhook event log for idempotency and audit trailing."""

    __tablename__ = "payment_webhook_events"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    provider: str = Field(default="chip", max_length=50)
    event_type: str = Field(max_length=100)
    provider_object_id: str = Field(max_length=255, index=True)
    payload_hash: str = Field(max_length=255)
    processed: bool = Field(default=False)
    processed_at: datetime | None = Field(
        default=None,
        sa_type=DateTime(timezone=True),  # type: ignore
    )
    created_at: datetime = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )

    __table_args__ = (
        UniqueConstraint(
            "provider",
            "event_type",
            "provider_object_id",
            name="uq_paymentwebhookevent_provider_event_object",
        ),
        Index("ix_paymentwebhookevent_provider_object", "provider", "provider_object_id"),
    )


class SubscriptionUsage(SQLModel, table=True):
    """Generic usage tracker for subscription quota-based features."""

    __tablename__ = "subscription_usage"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(
        sa_column=Column(
            Uuid,
            ForeignKey("user.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        )
    )
    feature: str = Field(max_length=100)
    period_type: str = Field(max_length=50)
    period_start: datetime | None = Field(
        default=None,
        sa_type=DateTime(timezone=True),  # type: ignore
    )
    period_end: datetime | None = Field(
        default=None,
        sa_type=DateTime(timezone=True),  # type: ignore
    )
    usage_count: int = Field(default=0)
    last_used_at: datetime | None = Field(
        default=None,
        sa_type=DateTime(timezone=True),  # type: ignore
    )
    created_at: datetime = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )
    updated_at: datetime = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )

    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "feature",
            "period_type",
            "period_start",
            name="uq_subscriptionusage_user_feature_period",
        ),
        Index("ix_subscriptionusage_user_feature", "user_id", "feature"),
        Index(
            "ix_subscriptionusage_user_feature_period_start",
            "user_id",
            "feature",
            "period_start",
        ),
    )


class EntitlementStatusPublic(SQLModel):
    """Public representation of entitlement status for a feature."""

    feature: str
    plan: str
    limit: int | None = None
    current_usage: int
    over_limit: bool
    can_create: bool
