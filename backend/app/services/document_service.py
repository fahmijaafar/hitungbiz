import uuid

from sqlmodel import Session

from app.models import Document, DocumentCreate


def create_document(
    *,
    session: Session,
    document_in: DocumentCreate,
    user_id: uuid.UUID | None,
    generated_from_recurring_id: uuid.UUID | None = None,
) -> Document:
    """Persist an invoice through the same creation path used by the API."""
    document = Document.model_validate(
        document_in,
        update={
            "user_id": user_id,
            "generated_from_recurring_id": generated_from_recurring_id,
        },
    )
    session.add(document)
    session.flush()
    session.refresh(document)
    return document
