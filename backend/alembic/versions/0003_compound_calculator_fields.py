"""add calculator fields to compounds

Revision ID: 0003
Revises: 0002
Create Date: 2026-04-22

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("compounds", sa.Column("preset_vial_sizes", sa.JSON(), nullable=True))
    op.add_column("compounds", sa.Column("default_syringe_type", sa.String(10), nullable=True))
    op.add_column("compounds", sa.Column("default_syringe_ml", sa.Numeric(5, 2), nullable=True))


def downgrade() -> None:
    op.drop_column("compounds", "default_syringe_ml")
    op.drop_column("compounds", "default_syringe_type")
    op.drop_column("compounds", "preset_vial_sizes")
