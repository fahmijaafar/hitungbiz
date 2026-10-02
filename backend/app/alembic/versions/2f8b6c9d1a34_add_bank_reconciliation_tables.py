"""add bank reconciliation tables

Revision ID: 2f8b6c9d1a34
Revises: f1a2b3c4d5e6
Create Date: 2026-07-17 00:00:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "2f8b6c9d1a34"
down_revision: str | None = "f1a2b3c4d5e6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _json_type() -> sa.types.TypeEngine:
    return postgresql.JSONB(astext_type=sa.Text()) if op.get_bind().dialect.name == "postgresql" else sa.JSON()


def upgrade() -> None:
    op.create_table(
        "bank_import_sessions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("company_id", sa.Uuid(), nullable=True),
        sa.Column("user_id", sa.Uuid(), nullable=True),
        sa.Column("source_type", sqlmodel.sql.sqltypes.AutoString(length=50), nullable=False),
        sa.Column("file_name", sqlmodel.sql.sqltypes.AutoString(length=255), nullable=True),
        sa.Column("bank_name", sqlmodel.sql.sqltypes.AutoString(length=255), nullable=True),
        sa.Column("statement_start", sa.Date(), nullable=True),
        sa.Column("statement_end", sa.Date(), nullable=True),
        sa.Column("status", sqlmodel.sql.sqltypes.AutoString(length=50), nullable=False),
        sa.Column("duplicate_count", sa.Integer(), nullable=False),
        sa.Column("transaction_count", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["company_id"], ["company.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_bank_import_sessions_company_id"), "bank_import_sessions", ["company_id"], unique=False)

    op.create_table(
        "bank_import_transactions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("session_id", sa.Uuid(), nullable=False),
        sa.Column("company_id", sa.Uuid(), nullable=True),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("reference", sqlmodel.sql.sqltypes.AutoString(length=255), nullable=True),
        sa.Column("amount", sa.Float(), nullable=False),
        sa.Column("debit", sa.Float(), nullable=False),
        sa.Column("credit", sa.Float(), nullable=False),
        sa.Column("balance", sa.Float(), nullable=True),
        sa.Column("raw_data", _json_type(), nullable=False),
        sa.Column("ai_status", sqlmodel.sql.sqltypes.AutoString(length=50), nullable=False),
        sa.Column("ai_transaction_type", sqlmodel.sql.sqltypes.AutoString(length=50), nullable=False),
        sa.Column("ai_category", sqlmodel.sql.sqltypes.AutoString(length=255), nullable=True),
        sa.Column("ai_confidence", sa.Integer(), nullable=False),
        sa.Column("ai_reason", sa.Text(), nullable=False),
        sa.Column("ai_suggested_action", sqlmodel.sql.sqltypes.AutoString(length=50), nullable=False),
        sa.Column("reconciliation_status", sqlmodel.sql.sqltypes.AutoString(length=50), nullable=False),
        sa.Column("selected", sa.Boolean(), nullable=False),
        sa.Column("final_action", sqlmodel.sql.sqltypes.AutoString(length=50), nullable=False),
        sa.Column("final_category", sqlmodel.sql.sqltypes.AutoString(length=255), nullable=True),
        sa.Column("matched_record_type", sqlmodel.sql.sqltypes.AutoString(length=50), nullable=True),
        sa.Column("matched_record_id", sa.Uuid(), nullable=True),
        sa.Column("match_confidence", sa.Integer(), nullable=True),
        sa.Column("match_reason", sa.Text(), nullable=True),
        sa.Column("is_duplicate", sa.Boolean(), nullable=False),
        sa.Column("duplicate_of_transaction_id", sa.Uuid(), nullable=True),
        sa.Column("ignored_reason", sqlmodel.sql.sqltypes.AutoString(length=500), nullable=True),
        sa.Column("created_record_type", sqlmodel.sql.sqltypes.AutoString(length=50), nullable=True),
        sa.Column("created_record_id", sa.Uuid(), nullable=True),
        sa.Column("applied_by", sa.Uuid(), nullable=True),
        sa.Column("applied_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["company_id"], ["company.id"]),
        sa.ForeignKeyConstraint(["session_id"], ["bank_import_sessions.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_bank_import_transactions_company_id"), "bank_import_transactions", ["company_id"], unique=False)
    op.create_index(op.f("ix_bank_import_transactions_date"), "bank_import_transactions", ["date"], unique=False)
    op.create_index(op.f("ix_bank_import_transactions_reconciliation_status"), "bank_import_transactions", ["reconciliation_status"], unique=False)
    op.create_index(op.f("ix_bank_import_transactions_reference"), "bank_import_transactions", ["reference"], unique=False)
    op.create_index(op.f("ix_bank_import_transactions_session_id"), "bank_import_transactions", ["session_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_bank_import_transactions_session_id"), table_name="bank_import_transactions")
    op.drop_index(op.f("ix_bank_import_transactions_reference"), table_name="bank_import_transactions")
    op.drop_index(op.f("ix_bank_import_transactions_reconciliation_status"), table_name="bank_import_transactions")
    op.drop_index(op.f("ix_bank_import_transactions_date"), table_name="bank_import_transactions")
    op.drop_index(op.f("ix_bank_import_transactions_company_id"), table_name="bank_import_transactions")
    op.drop_table("bank_import_transactions")
    op.drop_index(op.f("ix_bank_import_sessions_company_id"), table_name="bank_import_sessions")
    op.drop_table("bank_import_sessions")
