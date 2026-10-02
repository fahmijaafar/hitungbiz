"""seed_compact_template

Revision ID: 1d64d2a6e11a
Revises: ba6778d3adc1
Create Date: 2026-07-31

"""
import uuid as _uuid
from datetime import datetime, timezone

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '1d64d2a6e11a'
down_revision = 'ba6778d3adc1'
branch_labels = None
depends_on = None


def upgrade():
    now = datetime.now(timezone.utc)
    op.bulk_insert(
        sa.table(
            'document_template',
            sa.column('id', sa.Uuid()),
            sa.column('name', sa.String),
            sa.column('code', sa.String),
            sa.column('description', sa.String),
            sa.column('is_default', sa.Boolean),
            sa.column('is_active', sa.Boolean),
            sa.column('created_at', sa.DateTime(timezone=True)),
            sa.column('updated_at', sa.DateTime(timezone=True)),
        ),
        [
            {
                'id': _uuid.UUID('00000000-0000-0000-0000-000000000003'),
                'name': 'Compact Dense',
                'code': 'compact',
                'description': 'Space-efficient layout with smaller fonts and tight spacing. Ideal for minimising paper usage.',
                'is_default': False,
                'is_active': True,
                'created_at': now,
                'updated_at': now,
            },
        ],
    )


def downgrade():
    op.execute(
        "DELETE FROM document_template WHERE id = '00000000-0000-0000-0000-000000000003'"
    )
