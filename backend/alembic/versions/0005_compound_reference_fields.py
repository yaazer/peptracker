"""add compound reference and dosing fields

Revision ID: 0005
Revises: 0004
Create Date: 2026-04-22
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision: str = "0005"
down_revision: Union[str, None] = "0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

NEW_COLUMNS = [
    ("aliases",              sa.String(500),  None),
    ("reference_url",        sa.String(2048), None),
    ("reference_notes",      sa.Text(),       None),
    ("molecular_weight",     sa.Float(),      None),
    ("half_life_hours",      sa.Float(),      None),
    ("typical_dose_mcg_min", sa.Float(),      None),
    ("typical_dose_mcg_max", sa.Float(),      None),
]


def upgrade() -> None:
    conn = op.get_bind()
    existing = [c["name"] for c in inspect(conn).get_columns("compounds")]
    for col_name, col_type, default in NEW_COLUMNS:
        if col_name not in existing:
            op.add_column("compounds", sa.Column(col_name, col_type, nullable=True))


def downgrade() -> None:
    for col_name, _, _ in reversed(NEW_COLUMNS):
        op.drop_column("compounds", col_name)
