"""add_description_to_product

Revision ID: a1f2b3c4d5e7
Revises: 254999af738b
Create Date: 2026-07-24 10:47:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'a1f2b3c4d5e7'
down_revision = '254999af738b'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('product', sa.Column('description', sa.Text(), nullable=True))


def downgrade():
    op.drop_column('product', 'description')
