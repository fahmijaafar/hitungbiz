"""Add has_completed_tour and completed_tour_at to user

Revision ID: i1a2b3c4d5f0
Revises: h1a2b3c4d5e9
Create Date: 2026-08-01 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'i1a2b3c4d5f0'
down_revision = ('1d64d2a6e11a', 'h1a2b3c4d5e9')
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('user', sa.Column('has_completed_tour', sa.Boolean(), server_default=sa.text('false'), nullable=False))
    op.add_column('user', sa.Column('completed_tour_at', sa.DateTime(timezone=True), nullable=True))


def downgrade():
    op.drop_column('user', 'completed_tour_at')
    op.drop_column('user', 'has_completed_tour')
