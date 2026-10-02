"""Make purchase invoice_no optional

Revision ID: h1a2b3c4d5e9
Revises: g1a2b3c4d5e8
Create Date: 2026-07-27 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'h1a2b3c4d5e9'
down_revision = 'g1a2b3c4d5e8'
branch_labels = None
depends_on = None


def upgrade():
    op.alter_column('purchase', 'invoice_no', existing_type=sa.String(length=255), nullable=True)


def downgrade():
    op.alter_column('purchase', 'invoice_no', existing_type=sa.String(length=255), nullable=False)
