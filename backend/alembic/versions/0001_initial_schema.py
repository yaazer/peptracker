"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-04-21

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("hashed_password", sa.String(255), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email"),
    )
    op.create_index("ix_users_email", "users", ["email"])

    op.create_table(
        "compounds",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("concentration_mg_per_ml", sa.Numeric(10, 4), nullable=True),
        sa.Column("vial_size_mg", sa.Numeric(10, 4), nullable=True),
        sa.Column("bac_water_ml", sa.Numeric(10, 4), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
        ),
        sa.Column("archived", sa.Boolean(), nullable=False, server_default=sa.text("0")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "injections",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("compound_id", sa.Integer(), nullable=False),
        sa.Column("dose_mcg", sa.Integer(), nullable=False),
        sa.Column(
            "injection_site",
            sa.Enum(
                "left_abdomen",
                "right_abdomen",
                "left_thigh",
                "right_thigh",
                "left_shoulder",
                "right_shoulder",
                "other",
                name="injectionsite",
            ),
            nullable=False,
        ),
        sa.Column("injected_at", sa.DateTime(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
        ),
        sa.ForeignKeyConstraint(["compound_id"], ["compounds.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "protocols",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("compound_id", sa.Integer(), nullable=False),
        sa.Column("dose_mcg", sa.Integer(), nullable=False),
        sa.Column("schedule_cron", sa.String(100), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.text("1")),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
        ),
        sa.ForeignKeyConstraint(["compound_id"], ["compounds.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "reminder_logs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("protocol_id", sa.Integer(), nullable=False),
        sa.Column("fired_at", sa.DateTime(), nullable=False),
        sa.Column("delivered", sa.Boolean(), nullable=False, server_default=sa.text("0")),
        sa.Column("error", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["protocol_id"], ["protocols.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("reminder_logs")
    op.drop_table("protocols")
    op.drop_table("injections")
    op.drop_table("compounds")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")
