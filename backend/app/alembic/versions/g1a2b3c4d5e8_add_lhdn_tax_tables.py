"""Add LHDN tax tables (tax_rule_set, tax_rate_bracket, expense_tax_rule, capital_allowance_rule, tax_payment)

Revision ID: g1a2b3c4d5e8
Revises: a1f2b3c4d5e7
Create Date: 2026-07-27 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel.sql.sqltypes

revision = 'g1a2b3c4d5e8'
down_revision = 'a1f2b3c4d5e7'
branch_labels = None
depends_on = None


def upgrade():
    # 1. tax_rule_set
    op.create_table(
        'tax_rule_set',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('tax_year', sa.Integer(), nullable=False),
        sa.Column('taxpayer_type', sqlmodel.sql.sqltypes.AutoString(length=50), nullable=False, server_default='individual_business'),
        sa.Column('country', sqlmodel.sql.sqltypes.AutoString(length=10), nullable=False, server_default='MY'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('effective_from', sa.Date(), nullable=True),
        sa.Column('effective_to', sa.Date(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('tax_year', 'taxpayer_type', 'country', name='uq_taxruleset_year_type_country')
    )
    op.create_index(op.f('ix_tax_rule_set_tax_year'), 'tax_rule_set', ['tax_year'], unique=False)
    op.create_index(op.f('ix_tax_rule_set_taxpayer_type'), 'tax_rule_set', ['taxpayer_type'], unique=False)

    # 2. tax_rate_bracket
    op.create_table(
        'tax_rate_bracket',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('tax_rule_set_id', sa.Uuid(), nullable=False),
        sa.Column('sequence', sa.Integer(), nullable=False),
        sa.Column('min_amount', sa.Float(), nullable=False),
        sa.Column('max_amount', sa.Float(), nullable=True),
        sa.Column('rate', sa.Float(), nullable=False),
        sa.Column('description', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=False),
        sa.ForeignKeyConstraint(['tax_rule_set_id'], ['tax_rule_set.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('tax_rule_set_id', 'sequence', name='uq_taxratebracket_ruleset_seq')
    )
    op.create_index(op.f('ix_tax_rate_bracket_tax_rule_set_id'), 'tax_rate_bracket', ['tax_rule_set_id'], unique=False)

    # 3. expense_tax_rule
    op.create_table(
        'expense_tax_rule',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('tax_rule_set_id', sa.Uuid(), nullable=False),
        sa.Column('category', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=False),
        sa.Column('tax_treatment', sqlmodel.sql.sqltypes.AutoString(length=50), nullable=False),
        sa.Column('capital_allowance_class', sqlmodel.sql.sqltypes.AutoString(length=100), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(['tax_rule_set_id'], ['tax_rule_set.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('tax_rule_set_id', 'category', name='uq_expensetaxrule_ruleset_category')
    )
    op.create_index(op.f('ix_expense_tax_rule_tax_rule_set_id'), 'expense_tax_rule', ['tax_rule_set_id'], unique=False)
    op.create_index(op.f('ix_expense_tax_rule_category'), 'expense_tax_rule', ['category'], unique=False)

    # 4. capital_allowance_rule
    op.create_table(
        'capital_allowance_rule',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('tax_rule_set_id', sa.Uuid(), nullable=False),
        sa.Column('asset_class', sqlmodel.sql.sqltypes.AutoString(length=100), nullable=False),
        sa.Column('initial_allowance_rate', sa.Float(), nullable=False, server_default='20.0'),
        sa.Column('annual_allowance_rate', sa.Float(), nullable=False, server_default='10.0'),
        sa.Column('special_rule', sqlmodel.sql.sqltypes.AutoString(length=100), nullable=True),
        sa.ForeignKeyConstraint(['tax_rule_set_id'], ['tax_rule_set.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('tax_rule_set_id', 'asset_class', name='uq_carule_ruleset_assetclass')
    )
    op.create_index(op.f('ix_capital_allowance_rule_tax_rule_set_id'), 'capital_allowance_rule', ['tax_rule_set_id'], unique=False)
    op.create_index(op.f('ix_capital_allowance_rule_asset_class'), 'capital_allowance_rule', ['asset_class'], unique=False)

    # 5. tax_payment
    op.create_table(
        'tax_payment',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('company_id', sa.Uuid(), nullable=False),
        sa.Column('user_id', sa.Uuid(), nullable=True),
        sa.Column('tax_year', sa.Integer(), nullable=False),
        sa.Column('payment_date', sa.Date(), nullable=False),
        sa.Column('amount', sa.Float(), nullable=False),
        sa.Column('payment_type', sqlmodel.sql.sqltypes.AutoString(length=50), nullable=False, server_default='cp500'),
        sa.Column('reference', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['company_id'], ['company.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['user.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_tax_payment_company_id'), 'tax_payment', ['company_id'], unique=False)
    op.create_index(op.f('ix_tax_payment_tax_year'), 'tax_payment', ['tax_year'], unique=False)


def downgrade():
    op.drop_index(op.f('ix_tax_payment_tax_year'), table_name='tax_payment')
    op.drop_index(op.f('ix_tax_payment_company_id'), table_name='tax_payment')
    op.drop_table('tax_payment')

    op.drop_index(op.f('ix_capital_allowance_rule_asset_class'), table_name='capital_allowance_rule')
    op.drop_index(op.f('ix_capital_allowance_rule_tax_rule_set_id'), table_name='capital_allowance_rule')
    op.drop_table('capital_allowance_rule')

    op.drop_index(op.f('ix_expense_tax_rule_category'), table_name='expense_tax_rule')
    op.drop_index(op.f('ix_expense_tax_rule_tax_rule_set_id'), table_name='expense_tax_rule')
    op.drop_table('expense_tax_rule')

    op.drop_index(op.f('ix_tax_rate_bracket_tax_rule_set_id'), table_name='tax_rate_bracket')
    op.drop_table('tax_rate_bracket')

    op.drop_index(op.f('ix_tax_rule_set_taxpayer_type'), table_name='tax_rule_set')
    op.drop_index(op.f('ix_tax_rule_set_tax_year'), table_name='tax_rule_set')
    op.drop_table('tax_rule_set')
