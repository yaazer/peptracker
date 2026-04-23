"""household sharing model

Revision ID: 0006
Revises: 0005
Create Date: 2026-04-23
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0006"
down_revision: Union[str, None] = "0005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()

    # ------------------------------------------------------------------
    # 1. users — add role, deleted_at, force_password_change, last_login_at
    # ------------------------------------------------------------------
    with op.batch_alter_table("users") as batch:
        batch.add_column(sa.Column("role", sa.String(10), nullable=True))
        batch.add_column(sa.Column("deleted_at", sa.DateTime, nullable=True))
        batch.add_column(
            sa.Column("force_password_change", sa.Boolean, nullable=False, server_default="0")
        )
        batch.add_column(sa.Column("last_login_at", sa.DateTime, nullable=True))

    # backfill: everyone = member, lowest id = admin
    conn.execute(sa.text("UPDATE users SET role = 'member'"))
    conn.execute(
        sa.text("UPDATE users SET role = 'admin' WHERE id = (SELECT MIN(id) FROM users)")
    )

    with op.batch_alter_table("users") as batch:
        batch.alter_column("role", nullable=False)

    # ------------------------------------------------------------------
    # 2. compounds — rename user_id → created_by_user_id
    # ------------------------------------------------------------------
    with op.batch_alter_table("compounds") as batch:
        batch.alter_column(
            "user_id",
            new_column_name="created_by_user_id",
            existing_type=sa.Integer,
            existing_nullable=False,
        )

    # ------------------------------------------------------------------
    # 3. protocols — rename user_id → assignee_user_id, add created_by_user_id
    # ------------------------------------------------------------------
    with op.batch_alter_table("protocols") as batch:
        batch.alter_column(
            "user_id",
            new_column_name="assignee_user_id",
            existing_type=sa.Integer,
            existing_nullable=False,
        )
        batch.add_column(sa.Column("created_by_user_id", sa.Integer, nullable=True))

    conn.execute(
        sa.text("UPDATE protocols SET created_by_user_id = assignee_user_id")
    )

    with op.batch_alter_table("protocols") as batch:
        batch.alter_column("created_by_user_id", nullable=False)

    # ------------------------------------------------------------------
    # 4. injections — rename user_id → logged_by_user_id, add injected_by_user_id
    # ------------------------------------------------------------------
    with op.batch_alter_table("injections") as batch:
        batch.alter_column(
            "user_id",
            new_column_name="logged_by_user_id",
            existing_type=sa.Integer,
            existing_nullable=False,
        )
        batch.add_column(sa.Column("injected_by_user_id", sa.Integer, nullable=True))

    conn.execute(
        sa.text("UPDATE injections SET injected_by_user_id = logged_by_user_id")
    )

    with op.batch_alter_table("injections") as batch:
        batch.alter_column("injected_by_user_id", nullable=False)


def downgrade() -> None:
    conn = op.get_bind()

    # injections
    with op.batch_alter_table("injections") as batch:
        batch.drop_column("injected_by_user_id")
        batch.alter_column(
            "logged_by_user_id",
            new_column_name="user_id",
            existing_type=sa.Integer,
            existing_nullable=False,
        )

    # protocols
    with op.batch_alter_table("protocols") as batch:
        batch.drop_column("created_by_user_id")
        batch.alter_column(
            "assignee_user_id",
            new_column_name="user_id",
            existing_type=sa.Integer,
            existing_nullable=False,
        )

    # compounds
    with op.batch_alter_table("compounds") as batch:
        batch.alter_column(
            "created_by_user_id",
            new_column_name="user_id",
            existing_type=sa.Integer,
            existing_nullable=False,
        )

    # users
    with op.batch_alter_table("users") as batch:
        batch.drop_column("last_login_at")
        batch.drop_column("force_password_change")
        batch.drop_column("deleted_at")
        batch.drop_column("role")
