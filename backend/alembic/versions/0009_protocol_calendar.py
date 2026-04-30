"""Protocol calendar: cycle_length_days, cycle_end_date

Revision ID: 0009
Revises: 0008
Create Date: 2026-04-30
"""
import sqlalchemy as sa
from alembic import op

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("protocols") as batch:
        batch.add_column(sa.Column("cycle_length_days", sa.Integer(), nullable=True))
        batch.add_column(sa.Column("cycle_end_date", sa.Date(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("protocols") as batch:
        batch.drop_column("cycle_end_date")
        batch.drop_column("cycle_length_days")
