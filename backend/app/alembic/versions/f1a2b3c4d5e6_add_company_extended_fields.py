"""Add extended fields to company table

Revision ID: f1a2b3c4d5e6
Revises: c2d5e8f1a7b4
Create Date: 2026-07-16 21:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'f1a2b3c4d5e6'
down_revision = 'e1a2b3c4d5e6'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('company', sa.Column('employee_size', sa.String(length=32), nullable=True))
    op.add_column('company', sa.Column('business_industry', sa.String(length=128), nullable=True))
    op.add_column('company', sa.Column('company_type', sa.String(length=128), nullable=True))
    op.add_column(
        'company',
        sa.Column('financial_year_end', sa.String(length=8), nullable=True, server_default='31-12'),
    )
    op.add_column('company', sa.Column('sst_registration_number', sa.String(length=64), nullable=True))
    op.add_column('company', sa.Column('einvoice_required', sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade():
    op.drop_column('company', 'einvoice_required')
    op.drop_column('company', 'sst_registration_number')
    op.drop_column('company', 'financial_year_end')
    op.drop_column('company', 'company_type')
    op.drop_column('company', 'business_industry')
    op.drop_column('company', 'employee_size')
