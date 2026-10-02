import uuid
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from sqlmodel import col, func, select

from app.api.deps import CurrentUser, SessionDep, VerifiedUser
from app.models import (
    InventoryTransaction,
    InventoryTransactionPublic,
    InventoryTransactionsPublic,
    Message,
    Product,
    ProductCategoriesPublic,
    ProductCreate,
    ProductPublic,
    ProductsPublic,
    ProductUpdate,
)
from app.services.audit_logger import AuditAction, AuditLogger, AuditModule
from app.services.entitlement_service import LimitReachedException, check_entitlement

router = APIRouter(prefix="/products", tags=["products"])


@router.get("/", response_model=ProductsPublic)
def read_products(
    session: SessionDep,
    current_user: VerifiedUser,
    skip: int = 0,
    limit: int = 100,
    company_id: uuid.UUID | None = None,
) -> Any:
    """
    Retrieve products. Filter by company_id if provided, otherwise use current user's company.
    """
    # Use provided company_id, or fall back to the current user's company_id
    active_company_id = company_id or current_user.company_id

    if active_company_id:
        count_statement = (
            select(func.count())
            .select_from(Product)
            .where(col(Product.company_id) == active_company_id)
        )
        count = session.exec(count_statement).one()
        statement = (
            select(Product)
            .where(col(Product.company_id) == active_company_id)
            .order_by(col(Product.product_name).asc())
            .offset(skip)
            .limit(limit)
        )
    else:
        count_statement = select(func.count()).select_from(Product)
        count = session.exec(count_statement).one()
        statement = select(Product).order_by(col(Product.product_name).asc()).offset(skip).limit(limit)

    products = session.exec(statement).all()
    products_public = [ProductPublic.model_validate(product) for product in products]
    return ProductsPublic(data=products_public, count=count)


@router.get("/categories", response_model=ProductCategoriesPublic)
def read_product_categories(
    session: SessionDep,
    current_user: VerifiedUser,
    company_id: uuid.UUID | None = None,
) -> ProductCategoriesPublic:
    """
    Retrieve distinct product categories for the active company.
    """
    active_company_id = company_id or current_user.company_id
    statement = (
        select(Product.category)
        .where(col(Product.category) != "")
        .distinct()
    )
    if active_company_id:
        statement = statement.where(col(Product.company_id) == active_company_id)

    seen: dict[str, str] = {}
    for raw_category in session.exec(statement).all():
        if not raw_category:
            continue
        trimmed = str(raw_category).strip()
        if not trimmed:
            continue
        key = trimmed.lower()
        if key not in seen:
            seen[key] = trimmed
        elif not trimmed.islower() and seen[key].islower():
            seen[key] = trimmed

    categories = sorted(seen.values(), key=str.lower)
    return ProductCategoriesPublic(data=categories)


@router.get("/{id}", response_model=ProductPublic)
def read_product(session: SessionDep, _current_user: VerifiedUser, id: uuid.UUID) -> Any:
    """
    Get product by ID.
    """
    product = session.get(Product, id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return product


@router.post("/", response_model=ProductPublic)
def create_product(
    *, session: SessionDep, current_user: VerifiedUser, product_in: ProductCreate, request: Request
) -> Any:
    """
    Create new product.

    Entitlement check runs before creation. Superusers bypass plan limits.
    Returns 403 with error=LIMIT_REACHED when the product limit is hit.
    """
    # --- Entitlement check ---------------------------------------------------
    if not current_user.is_superuser:
        try:
            check_entitlement(
                session, current_user, "products", company_id=current_user.company_id
            )
        except LimitReachedException as exc:
            raise HTTPException(
                status_code=403,
                detail={
                    "error": "LIMIT_REACHED",
                    "feature": exc.feature,
                    "plan": exc.plan,
                    "limit": exc.limit,
                    "current_usage": exc.current_usage,
                    "upgrade_required": True,
                    "next_plan": exc.next_plan,
                },
            )
    # --- Create product ------------------------------------------------------
    product = Product.model_validate(
        product_in,
        update={
            "user_id": current_user.id,
            "company_id": current_user.company_id,
        },
    )
    session.add(product)
    session.commit()
    session.refresh(product)

    AuditLogger.log(
        session,
        company_id=product.company_id,
        user_id=current_user.id,
        module=AuditModule.PRODUCTS,
        table_name="product",
        record_id=product.id,
        action=AuditAction.CREATE,
        entity_name=product.product_name,
        description=f"Created Product {product.product_name}",
        new_data=product,
        request=request,
    )

    return product


@router.put("/{id}", response_model=ProductPublic)
def update_product(
    *, session: SessionDep, current_user: VerifiedUser, id: uuid.UUID, product_in: ProductUpdate, request: Request
) -> Any:
    """
    Update a product.
    """
    product = session.get(Product, id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    old_product_dict = product.model_dump(mode="json")
    update_dict = product_in.model_dump(exclude_unset=True)
    product.sqlmodel_update(update_dict)
    session.add(product)
    session.commit()
    session.refresh(product)

    AuditLogger.log(
        session,
        company_id=product.company_id,
        user_id=current_user.id,
        module=AuditModule.PRODUCTS,
        table_name="product",
        record_id=product.id,
        action=AuditAction.UPDATE,
        entity_name=product.product_name,
        description=f"Updated Product {product.product_name}",
        old_data=old_product_dict,
        new_data=product,
        request=request,
    )

    return product


@router.delete("/{id}")
def delete_product(session: SessionDep, current_user: VerifiedUser, id: uuid.UUID, request: Request) -> Message:
    """
    Delete a product.
    """
    product = session.get(Product, id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    old_product_dict = product.model_dump(mode="json")
    session.delete(product)
    session.commit()

    AuditLogger.log(
        session,
        company_id=product.company_id,
        user_id=current_user.id,
        module=AuditModule.PRODUCTS,
        table_name="product",
        record_id=product.id,
        action=AuditAction.DELETE,
        entity_name=product.product_name,
        description=f"Deleted Product {product.product_name}",
        old_data=old_product_dict,
        request=request,
    )

    return Message(message="Product deleted successfully")


@router.get("/{id}/inventory-transactions", response_model=InventoryTransactionsPublic)
def read_product_inventory_transactions(
    session: SessionDep,
    _current_user: VerifiedUser,
    id: uuid.UUID,
    skip: int = 0,
    limit: int = 100,
) -> Any:
    """
    Get inventory transactions for a specific product.
    """
    product = session.get(Product, id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    count_statement = (
        select(func.count())
        .select_from(InventoryTransaction)
        .where(InventoryTransaction.product_id == id)
    )
    count = session.exec(count_statement).one()

    statement = (
        select(InventoryTransaction)
        .where(InventoryTransaction.product_id == id)
        .order_by(InventoryTransaction.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    txns = session.exec(statement).all()
    txns_public = [InventoryTransactionPublic.model_validate(t) for t in txns]
    return InventoryTransactionsPublic(data=txns_public, count=count)

