"""Add chip payment tables and fields

Revision ID: p1a2b3c4d5f2
Revises: o1a2b3c4d5f1
Create Date: 2026-08-11 11:40:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'p1a2b3c4d5f2'
down_revision = 'o1a2b3c4d5f1'
branch_labels = None
depends_on = None


def upgrade():
    # 1. Add columns to user_subscriptions
    op.add_column('user_subscriptions', sa.Column('cancel_at_period_end', sa.Boolean(), server_default='false', nullable=False))
    op.add_column('user_subscriptions', sa.Column('gateway', sa.String(length=50), nullable=True))
    op.add_column('user_subscriptions', sa.Column('gateway_customer_id', sa.String(length=255), nullable=True))
    op.add_column('user_subscriptions', sa.Column('gateway_subscription_id', sa.String(length=255), nullable=True))
    op.add_column('user_subscriptions', sa.Column('chip_client_id', sa.String(length=255), nullable=True))
    op.add_column('user_subscriptions', sa.Column('chip_recurring_token', sa.String(length=255), nullable=True))

    # 2. Create subscription_payments table
    op.create_table(
        'subscription_payments',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('user_id', sa.Uuid(), nullable=False),
        sa.Column('subscription_id', sa.Uuid(), nullable=True),
        sa.Column('provider', sa.String(length=50), nullable=False, server_default='chip'),
        sa.Column('provider_purchase_id', sa.String(length=255), nullable=True),
        sa.Column('provider_payment_id', sa.String(length=255), nullable=True),
        sa.Column('plan', sa.String(length=50), nullable=False),
        sa.Column('billing_interval', sa.String(length=50), nullable=False),
        sa.Column('amount', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('currency', sa.String(length=10), nullable=False, server_default='MYR'),
        sa.Column('status', sa.String(length=50), nullable=False, server_default='pending'),
        sa.Column('reference', sa.String(length=255), nullable=False),
        sa.Column('paid_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['subscription_id'], ['user_subscriptions.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['user_id'], ['user.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('reference', name='uq_subscriptionpayment_reference'),
    )
    op.create_index('ix_subscriptionpayment_user_id', 'subscription_payments', ['user_id'], unique=False)
    op.create_index('ix_subscriptionpayment_status', 'subscription_payments', ['status'], unique=False)
    op.create_index('ix_subscriptionpayment_provider_purchase_id', 'subscription_payments', ['provider_purchase_id'], unique=False)

    # 3. Create payment_webhook_events table
    op.create_table(
        'payment_webhook_events',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('provider', sa.String(length=50), nullable=False, server_default='chip'),
        sa.Column('event_type', sa.String(length=100), nullable=False),
        sa.Column('provider_object_id', sa.String(length=255), nullable=False),
        sa.Column('payload_hash', sa.String(length=255), nullable=False),
        sa.Column('processed', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('processed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint(
            'provider',
            'event_type',
            'provider_object_id',
            name='uq_paymentwebhookevent_provider_event_object',
        ),
    )
    op.create_index('ix_paymentwebhookevent_provider_object', 'payment_webhook_events', ['provider', 'provider_object_id'], unique=False)


def downgrade():
    op.drop_index('ix_paymentwebhookevent_provider_object', table_name='payment_webhook_events')
    op.drop_table('payment_webhook_events')

    op.drop_index('ix_subscriptionpayment_provider_purchase_id', table_name='subscription_payments')
    op.drop_index('ix_subscriptionpayment_status', table_name='subscription_payments')
    op.drop_index('ix_subscriptionpayment_user_id', table_name='subscription_payments')
    op.drop_table('subscription_payments')

    op.drop_column('user_subscriptions', 'chip_recurring_token')
    op.drop_column('user_subscriptions', 'chip_client_id')
    op.drop_column('user_subscriptions', 'gateway_subscription_id')
    op.drop_column('user_subscriptions', 'gateway_customer_id')
    op.drop_column('user_subscriptions', 'gateway')
    op.drop_column('user_subscriptions', 'cancel_at_period_end')
