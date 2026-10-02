from typing import Any

from fastapi import APIRouter
from sqlmodel import select

from app.api.deps import SessionDep
from app.models import DocumentTemplate, DocumentTemplatePublic, DocumentTemplatesPublic

router = APIRouter(prefix="/document-templates", tags=["document-templates"])


@router.get("/", response_model=DocumentTemplatesPublic)
def read_document_templates(session: SessionDep) -> Any:
    """
    List all active document templates.
    Public endpoint — no auth required so the frontend can render previews.
    """
    statement = (
        select(DocumentTemplate)
        .where(DocumentTemplate.is_active == True)  # noqa: E712
        .order_by(DocumentTemplate.is_default.desc(), DocumentTemplate.name)
    )
    templates = session.exec(statement).all()
    return DocumentTemplatesPublic(
        data=[DocumentTemplatePublic.model_validate(t) for t in templates]
    )
