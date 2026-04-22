"""add ntfy_topic and last_fired_at

Revision ID: 0002
Revises: 0001
Create Date: 2026-04-22

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("ntfy_topic", sa.String(500), nullable=True))
    op.add_column("protocols", sa.Column("last_fired_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column("protocols", "last_fired_at")
    op.drop_column("users", "ntfy_topic")
