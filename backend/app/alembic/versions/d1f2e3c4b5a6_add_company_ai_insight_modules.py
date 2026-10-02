"""Add CompanyAIInsights module_type support

Revision ID: d1f2e3c4b5a6
Revises: c7e1a2b3d4f5
Create Date: 2026-07-01 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "d1f2e3c4b5a6"
down_revision = "c7e1a2b3d4f5"
branch_labels = None
depends_on = None


def upgrade():
    op.drop_constraint(
        "companyaisummary_company_id_key",
        "companyaisummary",
        type_="unique",
    )
    op.drop_index(op.f("ix_companyaisummary_company_id"), table_name="companyaisummary")
    op.rename_table("companyaisummary", "company_ai_insights")

    op.add_column(
        "company_ai_insights",
        sa.Column(
            "module_type",
            sa.String(length=50),
            nullable=False,
            server_default=sa.text("'financial_summary'"),
        ),
    )

    op.create_index(
        op.f("ix_company_ai_insights_company_id"),
        "company_ai_insights",
        ["company_id"],
        unique=False,
    )
    op.create_unique_constraint(
        "uq_company_ai_insights_company_id_module_type",
        "company_ai_insights",
        ["company_id", "module_type"],
    )

    op.alter_column("company_ai_insights", "module_type", server_default=None)


def downgrade():
    op.drop_constraint(
        "uq_company_ai_insights_company_id_module_type",
        "company_ai_insights",
        type_="unique",
    )
    op.drop_index(op.f("ix_company_ai_insights_company_id"), table_name="company_ai_insights")
    op.drop_column("company_ai_insights", "module_type")
    op.rename_table("company_ai_insights", "companyaisummary")

    op.create_index(
        op.f("ix_companyaisummary_company_id"),
        "companyaisummary",
        ["company_id"],
        unique=True,
    )
