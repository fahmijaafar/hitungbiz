"""Add user_subscriptions table

Revision ID: n1a2b3c4d5e4
Revises: m1a2b3c4d5e3
Create Date: 2026-08-10 11:39:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'n1a2b3c4d5e4'
down_revision = 'm1a2b3c4d5e3'
branch_labels = None
depends_on = None


def upgrade():
    # Create user_subscriptions table
    op.create_table(
        'user_subscriptions',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('user_id', sa.Uuid(), nullable=False),
        sa.Column('plan', sa.String(length=50), nullable=False),
        sa.Column('billing_period', sa.String(length=50), nullable=True),
        sa.Column('status', sa.String(length=50), nullable=False),
        sa.Column('started_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['user.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', name='uq_usersubscription_user_id'),
    )

    # Indexes
    op.create_index('ix_usersubscription_user_id', 'user_subscriptions', ['user_id'], unique=False)
    op.create_index('ix_usersubscription_status', 'user_subscriptions', ['status'], unique=False)
    op.create_index('ix_usersubscription_expires_at', 'user_subscriptions', ['expires_at'], unique=False)

    # Safely backfill Personal subscription for every existing user
    # who does not already have one (INSERT ... WHERE NOT EXISTS prevents duplicates)
    op.execute(
        """
        INSERT INTO user_subscriptions (id, user_id, plan, billing_period, status,
                                        started_at, expires_at, created_at, updated_at)
        SELECT
            gen_random_uuid(),
            u.id,
            'personal',
            NULL,
            'active',
            NULL,
            NULL,
            (NOW() AT TIME ZONE 'UTC'),
            (NOW() AT TIME ZONE 'UTC')
        FROM "user" u
        WHERE NOT EXISTS (
            SELECT 1
            FROM user_subscriptions s
            WHERE s.user_id = u.id
        )
        """
    )


def downgrade():
    op.drop_index('ix_usersubscription_expires_at', table_name='user_subscriptions')
    op.drop_index('ix_usersubscription_status', table_name='user_subscriptions')
    op.drop_index('ix_usersubscription_user_id', table_name='user_subscriptions')
    op.drop_table('user_subscriptions')
