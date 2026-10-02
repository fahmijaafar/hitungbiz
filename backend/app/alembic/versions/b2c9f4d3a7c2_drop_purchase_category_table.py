"""Drop purchasecategory table

Revision ID: b2c9f4d3a7c2
Revises: 6b695f50882d
Create Date: 2026-06-12 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel.sql.sqltypes


# revision identifiers, used by Alembic.
revision = 'b2c9f4d3a7c2'
down_revision = '6b695f50882d'
branch_labels = None
depends_on = None


def upgrade():
    # drop purchasecategory table if it exists
    op.drop_table('purchasecategory')


def downgrade():
    # recreate purchasecategory table
    op.create_table(
        'purchasecategory',
        sa.Column('categoryname', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=False),
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )
