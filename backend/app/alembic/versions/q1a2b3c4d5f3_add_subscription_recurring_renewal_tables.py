"""Add subscription recurring renewal tables and fields

Revision ID: q1a2b3c4d5f3
Revises: p1a2b3c4d5f2
Create Date: 2026-08-11 17:46:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'q1a2b3c4d5f3'
down_revision = 'p1a2b3c4d5f2'
branch_labels = None
depends_on = None


def upgrade():
    # 1. Add columns to user_subscriptions
    op.add_column('user_subscriptions', sa.Column('auto_renew', sa.Boolean(), server_default='false', nullable=False))
    op.add_column('user_subscriptions', sa.Column('next_renewal_at', sa.DateTime(timezone=True), nullable=True))
    op.create_index('ix_usersubscription_auto_renew_next', 'user_subscriptions', ['status', 'auto_renew', 'next_renewal_at'], unique=False)

    # 2. Add payment_type column to subscription_payments
    op.add_column('subscription_payments', sa.Column('payment_type', sa.String(length=50), server_default='initial', nullable=False))

    # 3. Create subscription_renewals table
    op.create_table(
        'subscription_renewals',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('subscription_id', sa.Uuid(), nullable=False),
        sa.Column('user_id', sa.Uuid(), nullable=False),
        sa.Column('billing_period_start', sa.DateTime(timezone=True), nullable=False),
        sa.Column('billing_period_end', sa.DateTime(timezone=True), nullable=False),
        sa.Column('scheduled_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('attempted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('status', sa.String(length=50), nullable=False, server_default='pending'),
        sa.Column('chip_purchase_id', sa.String(length=255), nullable=True),
        sa.Column('amount', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('currency', sa.String(length=10), nullable=False, server_default='MYR'),
        sa.Column('failure_reason', sa.String(length=500), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['subscription_id'], ['user_subscriptions.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['user.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint(
            'subscription_id',
            'billing_period_start',
            'billing_period_end',
            name='uq_subscriptionrenewal_sub_period',
        ),
        sa.CheckConstraint(
            'billing_period_end >= billing_period_start',
            name='chk_subscriptionrenewal_period_valid',
        ),
    )
    op.create_index('ix_subscriptionrenewal_subscription_id', 'subscription_renewals', ['subscription_id'], unique=False)
    op.create_index('ix_subscriptionrenewal_user_id', 'subscription_renewals', ['user_id'], unique=False)
    op.create_index('ix_subscriptionrenewal_status', 'subscription_renewals', ['status'], unique=False)


def downgrade():
    op.drop_index('ix_subscriptionrenewal_status', table_name='subscription_renewals')
    op.drop_index('ix_subscriptionrenewal_user_id', table_name='subscription_renewals')
    op.drop_index('ix_subscriptionrenewal_subscription_id', table_name='subscription_renewals')
    op.drop_table('subscription_renewals')

    op.drop_column('subscription_payments', 'payment_type')

    op.drop_index('ix_usersubscription_auto_renew_next', table_name='user_subscriptions')
    op.drop_column('user_subscriptions', 'next_renewal_at')
    op.drop_column('user_subscriptions', 'auto_renew')
