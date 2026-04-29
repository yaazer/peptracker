"""Pharmacy features: inventory, prescriptions, refill log, protocol dosing instructions

Revision ID: 0008
Revises: 0007
Create Date: 2026-04-29
"""
from datetime import datetime

import sqlalchemy as sa
from alembic import op

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── compounds: inventory + low-stock tracking ───────────────────────────
    with op.batch_alter_table("compounds") as batch:
        batch.add_column(sa.Column("quantity_on_hand", sa.Float(), nullable=True))
        batch.add_column(sa.Column("quantity_unit", sa.String(30), nullable=True))
        batch.add_column(sa.Column("low_stock_threshold", sa.Float(), nullable=True))
        batch.add_column(sa.Column("low_stock_days", sa.Float(), nullable=True))
        batch.add_column(sa.Column("last_low_stock_alert_at", sa.DateTime(), nullable=True))

    # ── prescriptions table ─────────────────────────────────────────────────
    op.create_table(
        "prescriptions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("compound_id", sa.Integer(), sa.ForeignKey("compounds.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_by_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("prescriber_name", sa.String(255), nullable=True),
        sa.Column("pharmacy_name", sa.String(255), nullable=True),
        sa.Column("rx_number", sa.String(100), nullable=True),
        sa.Column("refills_remaining", sa.Integer(), nullable=True),
        sa.Column("expiry_date", sa.Date(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="1"),
        sa.Column("last_expiry_alert_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
    )

    # ── refill_logs table ───────────────────────────────────────────────────
    op.create_table(
        "refill_logs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("compound_id", sa.Integer(), sa.ForeignKey("compounds.id", ondelete="CASCADE"), nullable=False),
        sa.Column("logged_by_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("amount", sa.Float(), nullable=False),
        sa.Column("quantity_unit", sa.String(30), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("logged_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
    )

    # ── protocols: dosing instructions ──────────────────────────────────────
    with op.batch_alter_table("protocols") as batch:
        batch.add_column(sa.Column("take_with_food", sa.Boolean(), nullable=False, server_default="0"))
        batch.add_column(sa.Column("dosing_instructions", sa.Text(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("protocols") as batch:
        batch.drop_column("dosing_instructions")
        batch.drop_column("take_with_food")

    op.drop_table("refill_logs")
    op.drop_table("prescriptions")

    with op.batch_alter_table("compounds") as batch:
        batch.drop_column("last_low_stock_alert_at")
        batch.drop_column("low_stock_days")
        batch.drop_column("low_stock_threshold")
        batch.drop_column("quantity_unit")
        batch.drop_column("quantity_on_hand")
