"""Add audit_logs table and performance indexes

Revision ID: j1a2b3c4d5e0
Revises: i1a2b3c4d5f0
Create Date: 2026-08-03 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'j1a2b3c4d5e0'
down_revision = 'i1a2b3c4d5f0'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'audit_logs',
        sa.Column('id', sa.BigInteger(), primary_key=True, autoincrement=True, nullable=False),
        sa.Column('company_id', sa.Uuid(), sa.ForeignKey('company.id', ondelete='SET NULL'), nullable=True),
        sa.Column('user_id', sa.Uuid(), sa.ForeignKey('user.id', ondelete='SET NULL'), nullable=True),
        sa.Column('module', sa.String(length=100), nullable=False),
        sa.Column('table_name', sa.String(length=100), nullable=False),
        sa.Column('record_id', sa.String(length=255), nullable=True),
        sa.Column('action', sa.String(length=30), nullable=False),
        sa.Column('entity_name', sa.String(length=255), nullable=True),
        sa.Column('description', sa.Text(), nullable=False),
        sa.Column('old_data', sa.JSON(), nullable=True),
        sa.Column('new_data', sa.JSON(), nullable=True),
        sa.Column('metadata', sa.JSON(), nullable=True),
        sa.Column('ip_address', sa.String(length=100), nullable=True),
        sa.Column('user_agent', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('NOW()'), nullable=False),
    )

    op.create_index('ix_audit_logs_company_id_created_at', 'audit_logs', ['company_id', 'created_at'])
    op.create_index('ix_audit_logs_user_id_created_at', 'audit_logs', ['user_id', 'created_at'])
    op.create_index('ix_audit_logs_module', 'audit_logs', ['module'])
    op.create_index('ix_audit_logs_action', 'audit_logs', ['action'])
    op.create_index('ix_audit_logs_table_name_record_id', 'audit_logs', ['table_name', 'record_id'])
    op.create_index('ix_audit_logs_created_at_desc', 'audit_logs', [sa.text('created_at DESC')])


def downgrade():
    op.drop_index('ix_audit_logs_created_at_desc', table_name='audit_logs')
    op.drop_index('ix_audit_logs_table_name_record_id', table_name='audit_logs')
    op.drop_index('ix_audit_logs_action', table_name='audit_logs')
    op.drop_index('ix_audit_logs_module', table_name='audit_logs')
    op.drop_index('ix_audit_logs_user_id_created_at', table_name='audit_logs')
    op.drop_index('ix_audit_logs_company_id_created_at', table_name='audit_logs')
    op.drop_table('audit_logs')
