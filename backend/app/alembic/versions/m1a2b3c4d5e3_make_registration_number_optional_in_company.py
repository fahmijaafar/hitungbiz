"""Make registration_number optional in company table

Revision ID: m1a2b3c4d5e3
Revises: l1a2b3c4d5e2
Create Date: 2026-08-07 16:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'm1a2b3c4d5e3'
down_revision = 'l1a2b3c4d5e2'
branch_labels = None
depends_on = None


def upgrade():
    op.alter_column(
        'company',
        'registration_number',
        existing_type=sa.String(length=255),
        nullable=True,
    )


def downgrade():
    op.alter_column(
        'company',
        'registration_number',
        existing_type=sa.String(length=255),
        nullable=False,
    )
