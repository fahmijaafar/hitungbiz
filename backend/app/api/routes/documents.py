import uuid
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from sqlmodel import func, select

from app.api.deps import CurrentUser, SessionDep, VerifiedUser
from app.models import (
    Client,
    Company,
    Document,
    DocumentCreate,
    DocumentPublic,
    DocumentsPublic,
    DocumentUpdate,
    InventoryTransaction,
    Message,
    Product,
)
from app.services.audit_logger import AuditAction, AuditLogger, AuditModule
from app.services.document_service import create_document as create_document_record
from app.services.entitlement_service import (
    LimitReachedException,
    check_entitlement,
    limit_reached_detail,
    record_entitled_usage,
)

router = APIRouter(prefix="/documents", tags=["documents"])


@router.get("/", response_model=DocumentsPublic)
def read_documents(
    session: SessionDep,
    current_user: VerifiedUser,
    skip: int = 0,
    limit: int = 100,
    company_id: uuid.UUID | None = None,
) -> Any:
    """
    Retrieve documents. Filter by company_id if provided, otherwise use current user's company.
    """
    active_company_id = company_id or current_user.company_id

    if active_company_id:
        count_statement = (
            select(func.count())
            .select_from(Document)
            .where(Document.company_id == active_company_id)
        )
        count = session.exec(count_statement).one()
        statement = (
            select(Document)
            .where(Document.company_id == active_company_id)
            .order_by(Document.date.desc())
            .offset(skip)
            .limit(limit)
        )
    else:
        count_statement = select(func.count()).select_from(Document)
        count = session.exec(count_statement).one()
        statement = (
            select(Document).order_by(Document.date.desc()).offset(skip).limit(limit)
        )

    documents = session.exec(statement).all()
    documents_public = [
        DocumentPublic.model_validate(document) for document in documents
    ]
    return DocumentsPublic(data=documents_public, count=count)


# IMPORTANT: /public/{id} MUST come before /{id} to avoid route conflicts
@router.get("/public/{id}", response_model=dict[str, Any])
def read_document_public(session: SessionDep, id: uuid.UUID) -> Any:
    """
    Get document by ID (public, no auth required).
    Returns document with company and client data for rendering.
    """
    document = session.get(Document, id)
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    # Get company data
    company = None
    if document.company_id:
        company = session.get(Company, document.company_id)

    # Get client data
    client = None
    if document.client_id:
        client = session.get(Client, document.client_id)

    return {
        "document": DocumentPublic.model_validate(document).model_dump(),
        "company": Company.model_validate(company).model_dump() if company else None,
        "client": Client.model_validate(client).model_dump() if client else None,
    }


@router.get("/{id}", response_model=DocumentPublic)
def read_document(session: SessionDep, _current_user: VerifiedUser, id: uuid.UUID) -> Any:
    """
    Get document by ID.
    """
    document = session.get(Document, id)
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    return document


@router.post("/", response_model=DocumentPublic)
def create_document(
    *,
    session: SessionDep,
    current_user: VerifiedUser,
    document_in: DocumentCreate,
    request: Request,
) -> Any:
    """
    Create new document.
    """
    if not current_user.is_superuser:
        try:
            check_entitlement(session, current_user, "documents")
        except LimitReachedException as exc:
            raise HTTPException(status_code=403, detail=limit_reached_detail(exc)) from exc

    document = create_document_record(
        session=session,
        document_in=document_in,
        user_id=current_user.id,
    )
    if not current_user.is_superuser:
        try:
            record_entitled_usage(session, current_user, feature="documents")
        except LimitReachedException as exc:
            session.rollback()
            raise HTTPException(status_code=403, detail=limit_reached_detail(exc)) from exc
    session.commit()

    doc_label = document.docno or str(document.id)[:8]
    doc_type = (document.doctype or "Document").capitalize()
    AuditLogger.log(
        session,
        company_id=document.company_id,
        user_id=current_user.id,
        module=AuditModule.DOCUMENTS,
        table_name="document",
        record_id=document.id,
        action=AuditAction.CREATE,
        entity_name=doc_label,
        description=f"Created {doc_type} {doc_label}",
        new_data=document,
        request=request,
    )

    return document


@router.put("/{id}", response_model=DocumentPublic)
def update_document(
    *,
    session: SessionDep,
    current_user: VerifiedUser,
    id: uuid.UUID,
    document_in: DocumentUpdate,
    request: Request,
) -> Any:
    """
    Update a document.
    """
    document = session.get(Document, id)
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    old_document_dict = document.model_dump(mode="json")
    old_status = document.status
    update_dict = document_in.model_dump(exclude_unset=True)
    document.sqlmodel_update(update_dict)
    session.add(document)
    session.commit()
    session.refresh(document)

    doc_label = document.docno or str(document.id)[:8]
    doc_type = (document.doctype or "Document").capitalize()
    if old_status != document.status:
        action = AuditAction.STATUS_CHANGE
        desc = f"Marked {doc_type} {doc_label} as {document.status.capitalize() if document.status else 'Updated'}"
    else:
        action = AuditAction.UPDATE
        desc = f"Updated {doc_type} {doc_label}"

    AuditLogger.log(
        session,
        company_id=document.company_id,
        user_id=current_user.id,
        module=AuditModule.DOCUMENTS,
        table_name="document",
        record_id=document.id,
        action=action,
        entity_name=doc_label,
        description=desc,
        old_data=old_document_dict,
        new_data=document,
        request=request,
    )

    return document


@router.delete("/{id}")
def delete_document(
    session: SessionDep, current_user: VerifiedUser, id: uuid.UUID, request: Request
) -> Message:
    """
    Delete a document.
    """
    document = session.get(Document, id)
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    old_document_dict = document.model_dump(mode="json")
    doc_label = document.docno or str(document.id)[:8]
    doc_type = (document.doctype or "Document").capitalize()
    session.delete(document)
    session.commit()

    AuditLogger.log(
        session,
        company_id=document.company_id,
        user_id=current_user.id,
        module=AuditModule.DOCUMENTS,
        table_name="document",
        record_id=document.id,
        action=AuditAction.DELETE,
        entity_name=doc_label,
        description=f"Deleted {doc_type} {doc_label}",
        old_data=old_document_dict,
        request=request,
    )

    return Message(message="Document deleted successfully")


@router.post("/{id}/deduct-inventory", response_model=DocumentPublic)
def deduct_document_inventory(
    session: SessionDep,
    current_user: VerifiedUser,
    id: uuid.UUID,
    request: Request,
) -> Any:
    """
    Deduct product stock for items listed in a Delivery Order document.
    Prevents duplicate deduction if stock was already deducted.
    """
    document = session.get(Document, id)
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    # Prevent duplicate inventory deduction (idempotent check)
    if document.stock_deducted:
        return document

    items = document.item if isinstance(document.item, list) else []

    for line in items:
        if not isinstance(line, dict):
            continue

        product_id_raw = line.get("product_id")
        if not product_id_raw:
            continue

        try:
            prod_uuid = uuid.UUID(str(product_id_raw))
        except (ValueError, TypeError):
            continue

        # Find product in DB (scoped to document's company if present)
        query = select(Product).where(Product.id == prod_uuid)
        if document.company_id:
            query = query.where(Product.company_id == document.company_id)
        product = session.exec(query).first()


        # If matching product exists in Product module, deduct stock and log transaction
        if product:
            qty = float(line.get("quantity", 0.0) or 0.0)
            previous_stock = product.stock_quantity
            new_stock = previous_stock - qty
            product.stock_quantity = new_stock
            session.add(product)

            txn = InventoryTransaction(
                product_id=product.id,
                document_id=document.id,
                document_number=document.docno or "",
                quantity_deducted=qty,
                previous_stock=previous_stock,
                new_stock=new_stock,
                company_id=document.company_id,
                user_id=current_user.id,
            )
            session.add(txn)

    document.stock_deducted = True
    session.add(document)
    session.commit()
    session.refresh(document)

    doc_label = document.docno or str(document.id)[:8]
    AuditLogger.log(
        session,
        company_id=document.company_id,
        user_id=current_user.id,
        module=AuditModule.DOCUMENTS,
        table_name="document",
        record_id=document.id,
        action=AuditAction.UPDATE,
        entity_name=doc_label,
        description=f"Deducted inventory stock for Delivery Order {doc_label}",
        new_data=document,
        request=request,
    )

    return document
