"""DoseLog expansion: multi-medication types, structured protocol schedules

Revision ID: 0007
Revises: 0006
Create Date: 2026-04-24
"""
import json
import logging
import re
from datetime import date
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

log = logging.getLogger("alembic.runtime.migration")

revision: str = "0007"
down_revision: Union[str, None] = "0006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# ---------------------------------------------------------------------------
# Cron → structured schedule backfill helpers
# ---------------------------------------------------------------------------

def _parse_cron(cron: str) -> dict | None:
    """
    Parse a standard 5-field cron string into structured schedule fields.
    Returns None if the pattern is not recognised.

    Cron day-of-week convention: 0=Sun, 1=Mon … 6=Sat
    New schema convention:        0=Mon, 1=Tue … 6=Sun
    Conversion: new_dow = (cron_dow - 1) % 7
    """
    parts = cron.strip().split()
    if len(parts) != 5:
        return None
    m, h, dom, mon, dow = parts

    # Only handle simple minute/hour specs (no ranges or lists in m/h)
    if not re.fullmatch(r'\d+', m) or not re.fullmatch(r'\d+', h):
        return None
    minute = int(m)
    hour = int(h)
    time_str = f"{hour:02d}:{minute:02d}"

    # Every-N-days interval: "M H */N * *"
    if re.fullmatch(r'\*/\d+', dom) and mon == "*" and dow == "*":
        n = int(dom[2:])
        return {
            "schedule_type": "interval",
            "schedule_times": json.dumps([time_str]),
            "schedule_days": None,
            "schedule_interval_value": n,
            "schedule_interval_unit": "days",
            "schedule_start_date": str(date.today()),
        }

    # Must have wildcard dom and month for day-based schedules
    if dom != "*" or mon != "*":
        return None

    # Daily: "M H * * *"
    if dow == "*":
        return {
            "schedule_type": "daily",
            "schedule_times": json.dumps([time_str]),
            "schedule_days": json.dumps([0, 1, 2, 3, 4, 5, 6]),
            "schedule_interval_value": None,
            "schedule_interval_unit": None,
            "schedule_start_date": None,
        }

    # Range: "M H * * 1-5"  (weekdays Mon–Fri in cron = 0–4 in new schema)
    if re.fullmatch(r'\d+-\d+', dow):
        lo, hi = map(int, dow.split("-"))
        cron_days = list(range(lo, hi + 1))
        new_days = sorted((d - 1) % 7 for d in cron_days)
        return {
            "schedule_type": "daily",
            "schedule_times": json.dumps([time_str]),
            "schedule_days": json.dumps(new_days),
            "schedule_interval_value": None,
            "schedule_interval_unit": None,
            "schedule_start_date": None,
        }

    # List: "M H * * 1,3,5"
    if re.fullmatch(r'\d+(,\d+)+', dow):
        cron_days = [int(d) for d in dow.split(",")]
        new_days = sorted((d - 1) % 7 for d in cron_days)
        return {
            "schedule_type": "daily",
            "schedule_times": json.dumps([time_str]),
            "schedule_days": json.dumps(new_days),
            "schedule_interval_value": None,
            "schedule_interval_unit": None,
            "schedule_start_date": None,
        }

    # Single weekday: "M H * * N"
    if re.fullmatch(r'\d+', dow):
        cron_day = int(dow)
        new_day = (cron_day - 1) % 7
        return {
            "schedule_type": "daily",
            "schedule_times": json.dumps([time_str]),
            "schedule_days": json.dumps([new_day]),
            "schedule_interval_value": None,
            "schedule_interval_unit": None,
            "schedule_start_date": None,
        }

    return None


_FALLBACK = {
    "schedule_type": "daily",
    "schedule_times": json.dumps(["08:00"]),
    "schedule_days": json.dumps([0, 1, 2, 3, 4, 5, 6]),
    "schedule_interval_value": None,
    "schedule_interval_unit": None,
    "schedule_start_date": None,
}


def _backfill_protocols(conn: sa.engine.Connection) -> None:
    rows = conn.execute(sa.text("SELECT id, schedule_cron FROM protocols")).fetchall()
    log.info("--- Protocol schedule backfill: %d protocols ---", len(rows))
    fallbacks = []
    for row in rows:
        pid, cron = row[0], row[1]
        parsed = _parse_cron(cron or "")
        if parsed is None:
            parsed = _FALLBACK.copy()
            fallbacks.append((pid, cron))
            log.warning(
                "Protocol %d: unrecognised cron %r → fell back to daily-all-day-at-08:00",
                pid, cron,
            )
        conn.execute(
            sa.text(
                "UPDATE protocols SET "
                "schedule_type = :schedule_type, "
                "schedule_times = :schedule_times, "
                "schedule_days = :schedule_days, "
                "schedule_interval_value = :schedule_interval_value, "
                "schedule_interval_unit = :schedule_interval_unit, "
                "schedule_start_date = :schedule_start_date "
                "WHERE id = :id"
            ),
            {**parsed, "id": pid},
        )
        log.info(
            "Protocol %d: %r → type=%s times=%s days=%s",
            pid, cron, parsed["schedule_type"],
            parsed["schedule_times"], parsed["schedule_days"],
        )
    if fallbacks:
        log.warning(
            "--- %d protocol(s) fell back to default schedule (original schedule_cron preserved): %s ---",
            len(fallbacks), [(pid, c) for pid, c in fallbacks],
        )
    else:
        log.info("--- All protocols backfilled cleanly ---")


# ---------------------------------------------------------------------------
# Migration
# ---------------------------------------------------------------------------

def upgrade() -> None:
    conn = op.get_bind()

    # ------------------------------------------------------------------
    # 1. compounds — add 6 new columns
    # ------------------------------------------------------------------
    with op.batch_alter_table("compounds") as batch:
        batch.add_column(sa.Column("medication_type", sa.String(20), nullable=True))
        batch.add_column(sa.Column("dose_unit", sa.String(20), nullable=True))
        batch.add_column(sa.Column("strength_amount", sa.Float, nullable=True))
        batch.add_column(sa.Column("strength_unit", sa.String(20), nullable=True))
        batch.add_column(sa.Column("route", sa.String(20), nullable=True))
        batch.add_column(sa.Column("form_notes", sa.Text, nullable=True))

    conn.execute(sa.text("UPDATE compounds SET medication_type = 'injection'"))
    conn.execute(sa.text("UPDATE compounds SET dose_unit = 'mcg'"))
    conn.execute(sa.text("UPDATE compounds SET route = 'subcutaneous'"))

    with op.batch_alter_table("compounds") as batch:
        batch.alter_column("medication_type", nullable=False)
        batch.alter_column("dose_unit", nullable=False)

    # ------------------------------------------------------------------
    # 2. injections — add quantity, status, skip_reason; make
    #    injection_site and dose_mcg nullable
    # ------------------------------------------------------------------
    with op.batch_alter_table("injections") as batch:
        batch.add_column(sa.Column("quantity", sa.Float, nullable=True))
        batch.add_column(sa.Column("status", sa.String(20), nullable=True))
        batch.add_column(sa.Column("skip_reason", sa.Text, nullable=True))

    conn.execute(sa.text("UPDATE injections SET status = 'taken'"))

    # Recreate table to make injection_site and dose_mcg nullable.
    # SQLite batch mode handles this via full table copy.
    with op.batch_alter_table("injections") as batch:
        batch.alter_column("status", nullable=False)
        batch.alter_column(
            "dose_mcg",
            existing_type=sa.Integer,
            nullable=True,
        )
        batch.alter_column(
            "injection_site",
            existing_type=sa.Enum(
                "left_abdomen", "right_abdomen",
                "left_thigh", "right_thigh",
                "left_shoulder", "right_shoulder",
                "other",
                name="injectionsite",
            ),
            nullable=True,
        )

    # ------------------------------------------------------------------
    # 3. protocols — add structured schedule columns; keep schedule_cron
    # ------------------------------------------------------------------
    with op.batch_alter_table("protocols") as batch:
        batch.add_column(sa.Column("schedule_type", sa.String(20), nullable=True))
        batch.add_column(sa.Column("schedule_times", sa.JSON, nullable=True))
        batch.add_column(sa.Column("schedule_days", sa.JSON, nullable=True))
        batch.add_column(sa.Column("schedule_interval_value", sa.Integer, nullable=True))
        batch.add_column(sa.Column("schedule_interval_unit", sa.String(20), nullable=True))
        batch.add_column(sa.Column("schedule_start_date", sa.Date, nullable=True))
        batch.alter_column("dose_mcg", existing_type=sa.Integer, nullable=True)

    _backfill_protocols(conn)

    with op.batch_alter_table("protocols") as batch:
        batch.alter_column("schedule_type", nullable=False)


def downgrade() -> None:
    conn = op.get_bind()

    # protocols
    with op.batch_alter_table("protocols") as batch:
        batch.drop_column("schedule_start_date")
        batch.drop_column("schedule_interval_unit")
        batch.drop_column("schedule_interval_value")
        batch.drop_column("schedule_days")
        batch.drop_column("schedule_times")
        batch.drop_column("schedule_type")
        batch.alter_column("dose_mcg", existing_type=sa.Integer, nullable=False)

    # injections
    with op.batch_alter_table("injections") as batch:
        batch.drop_column("skip_reason")
        batch.drop_column("status")
        batch.drop_column("quantity")
        batch.alter_column("dose_mcg", existing_type=sa.Integer, nullable=False)
        batch.alter_column(
            "injection_site",
            existing_type=sa.Enum(
                "left_abdomen", "right_abdomen",
                "left_thigh", "right_thigh",
                "left_shoulder", "right_shoulder",
                "other",
                name="injectionsite",
            ),
            nullable=False,
        )

    # compounds
    with op.batch_alter_table("compounds") as batch:
        batch.drop_column("form_notes")
        batch.drop_column("route")
        batch.drop_column("strength_unit")
        batch.drop_column("strength_amount")
        batch.drop_column("dose_unit")
        batch.drop_column("medication_type")
