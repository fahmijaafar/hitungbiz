from datetime import timezone
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from sqlmodel import select

from app.api.deps import SessionDep, VerifiedUser
from app.models import (
    DocumentDefaultNote,
    DocumentDefaultNotePublic,
    DocumentDefaultNotesPublic,
    DocumentDefaultNoteUpdate,
    get_datetime_utc,
)
from app.services.audit_logger import AuditAction, AuditLogger, AuditModule

router = APIRouter(prefix="/document-default-note", tags=["document-default-note"])


@router.get("/", response_model=DocumentDefaultNotesPublic)
def read_document_default_notes(
    session: SessionDep,
    current_user: VerifiedUser,
) -> Any:
    """
    Retrieve all document default note settings for the current user's company.
    """
    company_id = current_user.company_id
    if not company_id:
        return DocumentDefaultNotesPublic(data=[])

    statement = select(DocumentDefaultNote).where(
        DocumentDefaultNote.company_id == company_id
    )
    records = session.exec(statement).all()
    return DocumentDefaultNotesPublic(
        data=[DocumentDefaultNotePublic.model_validate(r) for r in records]
    )


@router.put("/{document_type}", response_model=DocumentDefaultNotePublic)
def upsert_document_default_note(
    *,
    session: SessionDep,
    current_user: VerifiedUser,
    document_type: str,
    note_in: DocumentDefaultNoteUpdate,
    request: Request,
) -> Any:
    """
    Create or update the default note setting for a specific document type.
    One record per company per document type (upsert).
    """
    company_id = current_user.company_id
    if not company_id:
        raise HTTPException(status_code=400, detail="User has no associated company")

    # Try to find existing record
    statement = select(DocumentDefaultNote).where(
        DocumentDefaultNote.company_id == company_id,
        DocumentDefaultNote.document_type == document_type,
    )
    record = session.exec(statement).first()

    is_update = record is not None
    old_dict = record.model_dump(mode="json") if record else None

    if record:
        # Update existing record
        update_dict = note_in.model_dump(exclude_unset=True)
        record.sqlmodel_update(update_dict)
        record.updated_at = get_datetime_utc()
        session.add(record)
    else:
        # Create new record
        record = DocumentDefaultNote(
            company_id=company_id,
            document_type=document_type,
            default_notes_enabled=note_in.default_notes_enabled or False,
            default_notes=note_in.default_notes or "",
        )
        session.add(record)

    session.commit()
    session.refresh(record)

    AuditLogger.log(
        session,
        company_id=company_id,
        user_id=current_user.id,
        module=AuditModule.DOCUMENTS,
        table_name="documentdefaultnote",
        record_id=record.id,
        action=AuditAction.UPDATE if is_update else AuditAction.CREATE,
        entity_name=document_type,
        description=f"{'Updated' if is_update else 'Created'} Default Notes for {document_type}",
        old_data=old_dict,
        new_data=record,
        request=request,
    )

    return DocumentDefaultNotePublic.model_validate(record)
