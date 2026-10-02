"""add recurring invoice tables

Revision ID: 9d3f0a7c6b21
Revises: 6189c133e1f0
Create Date: 2026-07-13 00:00:00.000000
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "9d3f0a7c6b21"
down_revision = "6189c133e1f0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    # Earlier local builds created these SQLModel tables before this migration
    # existed. Reconcile that schema instead of failing before Alembic can
    # record this revision.
    if not inspector.has_table("recurring_conf"):
        op.create_table(
            "recurring_conf",
            sa.Column("company_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("company.id"), nullable=True),
            sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("user.id"), nullable=True),
            sa.Column("name", sa.String(length=255), nullable=False),
            sa.Column("frequency", sa.String(length=50), nullable=False, server_default="monthly"),
            sa.Column("interval", sa.Integer(), nullable=False, server_default="1"),
            sa.Column("start_date", sa.Date(), nullable=False),
            sa.Column("end_date", sa.Date(), nullable=True),
            sa.Column("next_run_date", sa.DateTime(timezone=True), nullable=False),
            sa.Column("last_run_date", sa.DateTime(timezone=True), nullable=True),
            sa.Column("due_after_days", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("auto_send", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("recipient_email", sa.String(length=255), nullable=True),
            sa.Column("generated_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("max_occurrences", sa.Integer(), nullable=True),
            sa.Column("status", sa.String(length=50), nullable=False, server_default="Active"),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        )

    if not any(index["name"] == "ix_recurring_conf_due" for index in inspector.get_indexes("recurring_conf")):
        op.create_index("ix_recurring_conf_due", "recurring_conf", ["status", "next_run_date"])

    if not inspector.has_table("recurring_doc"):
        op.create_table(
            "recurring_doc",
            sa.Column("company_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("company.id"), nullable=True),
            sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("user.id"), nullable=True),
            sa.Column("recurring_config_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("recurring_conf.id"), nullable=True),
            sa.Column("doctype", sa.String(length=255), nullable=False, server_default="invoice"),
            sa.Column("client_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("client.id"), nullable=True),
            sa.Column("date", sa.Date(), nullable=False),
            sa.Column("title", sa.String(length=255), nullable=False),
            sa.Column("item", sa.JSON(), nullable=False),
            sa.Column("price_calculation", sa.JSON(), nullable=False),
            sa.Column("remark", sa.Text(), nullable=False),
            sa.Column("status", sa.String(length=255), nullable=False, server_default="Draft"),
            sa.Column("validity", sa.String(length=255), nullable=True),
            sa.Column("duedate", sa.Date(), nullable=True),
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        )

    document_columns = {column["name"] for column in inspector.get_columns("document")}
    if "generated_from_recurring_id" not in document_columns:
        op.add_column(
            "document",
            sa.Column("generated_from_recurring_id", postgresql.UUID(as_uuid=True), nullable=True),
        )

    document_foreign_keys = inspector.get_foreign_keys("document")
    has_recurring_foreign_key = any(
        foreign_key["constrained_columns"] == ["generated_from_recurring_id"]
        for foreign_key in document_foreign_keys
    )
    if not has_recurring_foreign_key:
        op.create_foreign_key(
            "fk_document_generated_from_recurring",
            "document",
            "recurring_conf",
            ["generated_from_recurring_id"],
            ["id"],
        )


def downgrade() -> None:
    op.drop_constraint("fk_document_generated_from_recurring", "document", type_="foreignkey")
    op.drop_column("document", "generated_from_recurring_id")
    op.drop_table("recurring_doc")
    op.drop_index("ix_recurring_conf_due", table_name="recurring_conf")
    op.drop_table("recurring_conf")
