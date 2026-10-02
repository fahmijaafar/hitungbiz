"""Add subscription renewal retry fields

Revision ID: q2b3c4d5e6f4
Revises: q1a2b3c4d5f3
Create Date: 2026-08-11 18:04:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'q2b3c4d5e6f4'
down_revision = 'q1a2b3c4d5f3'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('subscription_renewals', sa.Column('attempt_count', sa.Integer(), server_default='1', nullable=False))
    op.add_column('subscription_renewals', sa.Column('next_retry_at', sa.DateTime(timezone=True), nullable=True))


def downgrade():
    op.drop_column('subscription_renewals', 'next_retry_at')
    op.drop_column('subscription_renewals', 'attempt_count')
