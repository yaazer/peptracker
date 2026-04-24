"""Unit tests for _next_fire_structured — no DB required."""
from datetime import date, datetime
from types import SimpleNamespace

import pytest

from app.schedule_utils import _next_fire_structured


def proto(
    schedule_type="daily",
    schedule_times=None,
    schedule_days=None,
    schedule_interval_value=None,
    schedule_interval_unit=None,
    schedule_start_date=None,
):
    """Build a minimal protocol-like object for testing."""
    return SimpleNamespace(
        schedule_type=schedule_type,
        schedule_times=schedule_times or ["08:00"],
        schedule_days=schedule_days,
        schedule_interval_value=schedule_interval_value,
        schedule_interval_unit=schedule_interval_unit,
        schedule_start_date=schedule_start_date,
    )


# ---------------------------------------------------------------------------
# Daily — all days
# ---------------------------------------------------------------------------

class TestDailyAllDays:
    def test_before_fire_time_same_day(self):
        anchor = datetime(2026, 4, 21, 6, 0)  # Tuesday 06:00
        result = _next_fire_structured(proto(schedule_times=["08:00"]), anchor)
        assert result == datetime(2026, 4, 21, 8, 0)

    def test_after_fire_time_rolls_to_next_day(self):
        anchor = datetime(2026, 4, 21, 10, 0)  # Tuesday 10:00
        result = _next_fire_structured(proto(schedule_times=["08:00"]), anchor)
        assert result == datetime(2026, 4, 22, 8, 0)

    def test_multiple_times_picks_earliest_after_anchor(self):
        anchor = datetime(2026, 4, 21, 9, 0)  # between 08:00 and 20:00
        result = _next_fire_structured(proto(schedule_times=["08:00", "20:00"]), anchor)
        assert result == datetime(2026, 4, 21, 20, 0)

    def test_multiple_times_all_past_rolls_to_next_day(self):
        anchor = datetime(2026, 4, 21, 21, 0)
        result = _next_fire_structured(proto(schedule_times=["08:00", "20:00"]), anchor)
        assert result == datetime(2026, 4, 22, 8, 0)


# ---------------------------------------------------------------------------
# Daily — specific weekdays (Mon=0 … Sun=6)
# ---------------------------------------------------------------------------

class TestDailyWeekdays:
    def test_same_day_before_time(self):
        # 2026-04-20 is Monday (weekday=0)
        anchor = datetime(2026, 4, 20, 6, 0)
        p = proto(schedule_days=[0, 2, 4])  # Mon, Wed, Fri
        result = _next_fire_structured(p, anchor)
        assert result == datetime(2026, 4, 20, 8, 0)

    def test_skips_to_next_matching_day(self):
        # 2026-04-21 is Tuesday (weekday=1) — not in [0,2,4]
        anchor = datetime(2026, 4, 21, 9, 0)
        p = proto(schedule_days=[0, 2, 4])
        result = _next_fire_structured(p, anchor)
        # Next matching day: Wednesday 2026-04-22
        assert result == datetime(2026, 4, 22, 8, 0)

    def test_single_day_weekly(self):
        # 2026-04-21 is Tuesday; next Friday = 2026-04-24
        anchor = datetime(2026, 4, 21, 9, 0)
        p = proto(schedule_days=[4])  # Friday
        result = _next_fire_structured(p, anchor)
        assert result == datetime(2026, 4, 24, 8, 0)


# ---------------------------------------------------------------------------
# Interval — days
# ---------------------------------------------------------------------------

class TestIntervalDays:
    def test_every_3_days_no_start_date(self):
        # anchor: Monday 06:00. Base = Monday 08:00 (same day, schedule_times=["08:00"])
        anchor = datetime(2026, 4, 20, 6, 0)
        p = proto(
            schedule_type="interval",
            schedule_interval_value=3,
            schedule_interval_unit="days",
        )
        result = _next_fire_structured(p, anchor)
        assert result == datetime(2026, 4, 20, 8, 0)

    def test_every_3_days_after_same_day_time(self):
        anchor = datetime(2026, 4, 20, 10, 0)
        p = proto(
            schedule_type="interval",
            schedule_interval_value=3,
            schedule_interval_unit="days",
        )
        result = _next_fire_structured(p, anchor)
        assert result == datetime(2026, 4, 23, 8, 0)

    def test_every_3_days_with_start_date(self):
        # start_date: 2026-04-01 (base = 2026-04-01 08:00)
        # anchor: 2026-04-15 12:00
        # base advances: +3d each step → 04-01, 04-04, 04-07, 04-10, 04-13, 04-16
        anchor = datetime(2026, 4, 15, 12, 0)
        p = proto(
            schedule_type="interval",
            schedule_interval_value=3,
            schedule_interval_unit="days",
            schedule_start_date=date(2026, 4, 1),
        )
        result = _next_fire_structured(p, anchor)
        assert result == datetime(2026, 4, 16, 8, 0)


# ---------------------------------------------------------------------------
# Interval — hours
# ---------------------------------------------------------------------------

class TestIntervalHours:
    def test_every_12_hours(self):
        anchor = datetime(2026, 4, 21, 10, 0)
        p = proto(
            schedule_type="interval",
            schedule_interval_value=12,
            schedule_interval_unit="hours",
        )
        result = _next_fire_structured(p, anchor)
        assert result == datetime(2026, 4, 21, 22, 0)


# ---------------------------------------------------------------------------
# Interval — weeks (schedule_type="weekly")
# ---------------------------------------------------------------------------

class TestWeekly:
    def test_weekly_no_start_date(self):
        anchor = datetime(2026, 4, 20, 6, 0)  # Monday 06:00
        p = proto(
            schedule_type="weekly",
            schedule_interval_value=1,
            schedule_interval_unit="weeks",
        )
        result = _next_fire_structured(p, anchor)
        assert result == datetime(2026, 4, 20, 8, 0)

    def test_weekly_after_fire_time(self):
        anchor = datetime(2026, 4, 20, 10, 0)
        p = proto(
            schedule_type="weekly",
            schedule_interval_value=1,
            schedule_interval_unit="weeks",
        )
        result = _next_fire_structured(p, anchor)
        assert result == datetime(2026, 4, 27, 8, 0)


# ---------------------------------------------------------------------------
# Edge cases
# ---------------------------------------------------------------------------

class TestEdgeCases:
    def test_bad_schedule_type_returns_none(self):
        anchor = datetime(2026, 4, 21, 10, 0)
        p = proto(schedule_type="unknown")
        assert _next_fire_structured(p, anchor) is None

    def test_none_schedule_times_falls_back_to_default(self):
        p = SimpleNamespace(
            schedule_type="daily",
            schedule_times=None,
            schedule_days=None,
            schedule_interval_value=None,
            schedule_interval_unit=None,
            schedule_start_date=None,
        )
        anchor = datetime(2026, 4, 21, 6, 0)
        result = _next_fire_structured(p, anchor)
        assert result == datetime(2026, 4, 21, 8, 0)
