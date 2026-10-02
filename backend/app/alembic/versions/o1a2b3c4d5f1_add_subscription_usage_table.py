"""Add subscription_usage table

Revision ID: o1a2b3c4d5f1
Revises: n1a2b3c4d5e4
Create Date: 2026-08-10 12:30:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'o1a2b3c4d5f1'
down_revision = 'n1a2b3c4d5e4'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'subscription_usage',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('user_id', sa.Uuid(), nullable=False),
        sa.Column('feature', sa.String(length=100), nullable=False),
        sa.Column('period_type', sa.String(length=50), nullable=False),
        sa.Column('period_start', sa.DateTime(timezone=True), nullable=True),
        sa.Column('period_end', sa.DateTime(timezone=True), nullable=True),
        sa.Column('usage_count', sa.Integer(), nullable=False),
        sa.Column('last_used_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['user.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint(
            'user_id',
            'feature',
            'period_type',
            'period_start',
            name='uq_subscriptionusage_user_feature_period',
        ),
    )
    op.create_index('ix_subscriptionusage_user_id', 'subscription_usage', ['user_id'], unique=False)
    op.create_index(
        'ix_subscriptionusage_user_feature',
        'subscription_usage',
        ['user_id', 'feature'],
        unique=False,
    )
    op.create_index(
        'ix_subscriptionusage_user_feature_period_start',
        'subscription_usage',
        ['user_id', 'feature', 'period_start'],
        unique=False,
    )


def downgrade():
    op.drop_index('ix_subscriptionusage_user_feature_period_start', table_name='subscription_usage')
    op.drop_index('ix_subscriptionusage_user_feature', table_name='subscription_usage')
    op.drop_index('ix_subscriptionusage_user_id', table_name='subscription_usage')
    op.drop_table('subscription_usage')
