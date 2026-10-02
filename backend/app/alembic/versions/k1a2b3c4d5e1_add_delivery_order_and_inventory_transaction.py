"""Add stock_deducted column to document and create inventory_transaction table

Revision ID: k1a2b3c4d5e1
Revises: j1a2b3c4d5e0
Create Date: 2026-08-07 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = 'k1a2b3c4d5e1'
down_revision = 'j1a2b3c4d5e0'
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    inspector = sa.inspect(conn)

    # Add stock_deducted column if not present
    doc_cols = [c['name'] for c in inspector.get_columns('document')]
    if 'stock_deducted' not in doc_cols:
        op.add_column(
            'document',
            sa.Column('stock_deducted', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        )

    # Create inventory_transaction table if not present
    tables = inspector.get_table_names()
    if 'inventory_transaction' not in tables:
        op.create_table(
            'inventory_transaction',
            sa.Column('id', sa.Uuid(), primary_key=True, nullable=False),
            sa.Column('product_id', sa.Uuid(), sa.ForeignKey('product.id', ondelete='CASCADE'), nullable=False),
            sa.Column('document_id', sa.Uuid(), sa.ForeignKey('document.id', ondelete='SET NULL'), nullable=True),
            sa.Column('document_number', sa.String(length=255), nullable=False, server_default=''),
            sa.Column('quantity_deducted', sa.Float(), nullable=False, server_default='0.0'),
            sa.Column('previous_stock', sa.Float(), nullable=False, server_default='0.0'),
            sa.Column('new_stock', sa.Float(), nullable=False, server_default='0.0'),
            sa.Column('company_id', sa.Uuid(), sa.ForeignKey('company.id', ondelete='SET NULL'), nullable=True),
            sa.Column('user_id', sa.Uuid(), sa.ForeignKey('user.id', ondelete='SET NULL'), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        )


def downgrade():
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    tables = inspector.get_table_names()
    if 'inventory_transaction' in tables:
        op.drop_table('inventory_transaction')
    doc_cols = [c['name'] for c in inspector.get_columns('document')]
    if 'stock_deducted' in doc_cols:
        op.drop_column('document', 'stock_deducted')
