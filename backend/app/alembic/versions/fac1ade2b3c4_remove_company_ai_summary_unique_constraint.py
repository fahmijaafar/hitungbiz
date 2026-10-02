"""Remove old company_id unique constraint from company_ai_insights

Revision ID: fac1ade2b3c4
Revises: d1f2e3c4b5a6
Create Date: 2026-07-01 00:00:00.000000

"""
import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "fac1ade2b3c4"
down_revision = "d1f2e3c4b5a6"
branch_labels = None
depends_on = None


def _has_unique_constraint(name: str) -> bool:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return any(
        constraint["name"] == name
        for constraint in inspector.get_unique_constraints("company_ai_insights")
    )


def upgrade():
    constraint_name = "companyaisummary_company_id_key"
    if _has_unique_constraint(constraint_name):
        op.drop_constraint(
            constraint_name,
            "company_ai_insights",
            type_="unique",
        )


def downgrade():
    constraint_name = "companyaisummary_company_id_key"
    if not _has_unique_constraint(constraint_name):
        op.create_unique_constraint(
            constraint_name,
            "company_ai_insights",
            ["company_id"],
        )
