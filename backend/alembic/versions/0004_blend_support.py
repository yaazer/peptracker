"""add blend support

Revision ID: 0004
Revises: 0003
Create Date: 2026-04-22
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _table_exists(conn, name: str) -> bool:
    return inspect(conn).has_table(name)


def _column_exists(conn, table: str, column: str) -> bool:
    cols = [c["name"] for c in inspect(conn).get_columns(table)]
    return column in cols


def upgrade() -> None:
    conn = op.get_bind()

    if not _table_exists(conn, "blend_components"):
        op.create_table(
            "blend_components",
            sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
            sa.Column(
                "compound_id",
                sa.Integer,
                sa.ForeignKey("compounds.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("name", sa.String(255), nullable=False),
            sa.Column(
                "linked_compound_id",
                sa.Integer,
                sa.ForeignKey("compounds.id", ondelete="SET NULL"),
                nullable=True,
            ),
            sa.Column("amount_mg", sa.Numeric(10, 4), nullable=False),
            sa.Column("is_anchor", sa.Boolean, nullable=False, server_default="0"),
            sa.Column("position", sa.Integer, nullable=False, server_default="0"),
        )

    if not _column_exists(conn, "compounds", "is_blend"):
        op.add_column(
            "compounds",
            sa.Column("is_blend", sa.Boolean, nullable=False, server_default="0"),
        )

    if not _column_exists(conn, "injections", "draw_volume_ml"):
        op.add_column("injections", sa.Column("draw_volume_ml", sa.Float, nullable=True))

    if not _column_exists(conn, "injections", "dose_mode"):
        op.add_column(
            "injections",
            sa.Column("dose_mode", sa.String(20), nullable=False, server_default="total"),
        )

    if not _column_exists(conn, "injections", "component_snapshot"):
        op.add_column("injections", sa.Column("component_snapshot", sa.JSON, nullable=True))

    if not _column_exists(conn, "protocols", "dose_mode"):
        op.add_column(
            "protocols",
            sa.Column("dose_mode", sa.String(20), nullable=False, server_default="total"),
        )

    if not _column_exists(conn, "protocols", "anchor_component_id"):
        op.add_column(
            "protocols",
            sa.Column(
                "anchor_component_id",
                sa.Integer,
                sa.ForeignKey("blend_components.id", ondelete="SET NULL"),
                nullable=True,
            ),
        )

    # Backfill draw_volume_ml for existing single-compound injections
    rows = conn.execute(
        sa.text(
            """
            SELECT i.id, i.dose_mcg, c.concentration_mg_per_ml
            FROM injections i
            JOIN compounds c ON c.id = i.compound_id
            WHERE c.concentration_mg_per_ml IS NOT NULL
              AND CAST(c.concentration_mg_per_ml AS REAL) > 0
              AND i.draw_volume_ml IS NULL
            """
        )
    ).fetchall()
    for row_id, dose_mcg, conc in rows:
        draw_ml = dose_mcg / 1000.0 / float(conc)
        conn.execute(
            sa.text("UPDATE injections SET draw_volume_ml = :v WHERE id = :id"),
            {"v": draw_ml, "id": row_id},
        )


def downgrade() -> None:
    conn = op.get_bind()
    if _column_exists(conn, "protocols", "anchor_component_id"):
        op.drop_column("protocols", "anchor_component_id")
    if _column_exists(conn, "protocols", "dose_mode"):
        op.drop_column("protocols", "dose_mode")
    if _column_exists(conn, "injections", "component_snapshot"):
        op.drop_column("injections", "component_snapshot")
    if _column_exists(conn, "injections", "dose_mode"):
        op.drop_column("injections", "dose_mode")
    if _column_exists(conn, "injections", "draw_volume_ml"):
        op.drop_column("injections", "draw_volume_ml")
    if _column_exists(conn, "compounds", "is_blend"):
        op.drop_column("compounds", "is_blend")
    if _table_exists(conn, "blend_components"):
        op.drop_table("blend_components")
