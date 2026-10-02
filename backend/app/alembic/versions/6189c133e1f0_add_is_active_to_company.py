"""add is_active to company

Revision ID: 6189c133e1f0
Revises: fac1ade2b3c4
Create Date: 2026-07-01 15:40:30.490744

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel.sql.sqltypes


# revision identifiers, used by Alembic.
revision = '6189c133e1f0'
down_revision = 'fac1ade2b3c4'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('company', sa.Column('is_active', sa.Boolean(), nullable=True))
    op.execute("UPDATE company SET is_active = TRUE WHERE is_active IS NULL")
    op.alter_column('company', 'is_active', nullable=False, server_default='true')


def downgrade():
    op.drop_column('company', 'is_active')
