"""Add email blasting tables and user fields

Revision ID: e1a2b3c4d5e6
Revises: fac1ade2b3c4
Create Date: 2026-07-15 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel.sql.sqltypes


# revision identifiers, used by Alembic.
revision = "e1a2b3c4d5e6"
down_revision = "9d3f0a7c6b21"
branch_labels = None
depends_on = None


def upgrade():
    # ── User table additions ──────────────────────────────────────────────
    op.add_column("user", sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("user", sa.Column("onboarding_completed", sa.Boolean(), nullable=False, server_default=sa.false()))

    # ── email_template ────────────────────────────────────────────────────
    op.create_table(
        "email_template",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("subject", sa.Text(), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("created_by", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )

    # ── email_campaign ────────────────────────────────────────────────────
    op.create_table(
        "email_campaign",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("subject", sa.Text(), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("filter_json", sa.JSON(), nullable=False),
        sa.Column("recipient_count", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(length=50), nullable=False),
        sa.Column("created_by", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )

    # ── email_campaign_recipient ──────────────────────────────────────────
    op.create_table(
        "email_campaign_recipient",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("campaign_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=True),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("status", sa.String(length=50), nullable=False),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["campaign_id"], ["email_campaign.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_email_campaign_recipient_campaign_id", "email_campaign_recipient", ["campaign_id"])


def downgrade():
    op.drop_index("ix_email_campaign_recipient_campaign_id", "email_campaign_recipient")
    op.drop_table("email_campaign_recipient")
    op.drop_table("email_campaign")
    op.drop_table("email_template")
    op.drop_column("user", "onboarding_completed")
    op.drop_column("user", "last_login_at")
