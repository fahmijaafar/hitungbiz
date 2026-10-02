"""Add other_personal_taxable_income to company table

Revision ID: l1a2b3c4d5e2
Revises: k1a2b3c4d5e1
Create Date: 2026-08-07 15:30:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'l1a2b3c4d5e2'
down_revision = 'k1a2b3c4d5e1'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'company',
        sa.Column(
            'other_personal_taxable_income',
            sa.Numeric(precision=15, scale=2),
            nullable=False,
            server_default='0.00',
        ),
    )


def downgrade():
    op.drop_column('company', 'other_personal_taxable_income')
