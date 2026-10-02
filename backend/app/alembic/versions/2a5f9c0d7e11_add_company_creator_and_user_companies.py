"""Add company creator and user companies

Revision ID: 2a5f9c0d7e11
Revises: b8e7a8f4c2d1
Create Date: 2026-05-13 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel.sql.sqltypes


# revision identifiers, used by Alembic.
revision = "2a5f9c0d7e11"
down_revision = "b8e7a8f4c2d1"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "user",
        sa.Column(
            "companies",
            sqlmodel.sql.sqltypes.AutoString(length=2000),
            server_default="[]",
            nullable=False,
        ),
    )
    op.add_column("company", sa.Column("user_id", sa.Uuid(), nullable=True))
    op.create_foreign_key(None, "company", "user", ["user_id"], ["id"])


def downgrade():
    op.drop_constraint(None, "company", type_="foreignkey")
    op.drop_column("company", "user_id")
    op.drop_column("user", "companies")
