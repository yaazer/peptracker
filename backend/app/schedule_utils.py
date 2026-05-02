from datetime import date as date_type, datetime, time, timedelta
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.models import Protocol


def _next_fire_structured(protocol: "Protocol", anchor: datetime) -> datetime | None:
    """
    Compute the next fire datetime for a protocol using its structured schedule fields.
    Returns None if the schedule is misconfigured or no next fire can be determined.
    """
    try:
        times: list[str] = protocol.schedule_times or ["08:00"]
        stype = protocol.schedule_type or "daily"

        if stype == "daily":
            days = (
                set(protocol.schedule_days)
                if protocol.schedule_days is not None
                else set(range(7))
            )
            # Python weekday() → Mon=0 … Sun=6, same as our schema convention.
            for d_offset in range(8):
                candidate_date = (anchor + timedelta(days=d_offset)).date()
                if candidate_date.weekday() in days:
                    for time_str in sorted(times):
                        h, m = map(int, time_str.split(":"))
                        candidate = datetime.combine(candidate_date, time(h, m))
                        if candidate > anchor:
                            return candidate

        elif stype in ("interval", "weekly"):
            n = protocol.schedule_interval_value or 1
            unit = (protocol.schedule_interval_unit or "days").lower()

            if unit == "hours":
                delta = timedelta(hours=n)
                base = anchor
            else:
                delta = timedelta(weeks=n) if unit == "weeks" else timedelta(days=n)
                h, m = map(int, (times[0] if times else "08:00").split(":"))
                if protocol.schedule_start_date:
                    base = datetime.combine(protocol.schedule_start_date, time(h, m))
                else:
                    base = datetime.combine(anchor.date(), time(h, m))

            if base <= anchor:
                diff_secs = (anchor - base).total_seconds()
                steps = int(diff_secs / delta.total_seconds())
                base += delta * steps
                while base <= anchor:
                    base += delta
            return base

        return None
    except Exception:
        return None


def _fire_dates_in_range(
    protocol: "Protocol",
    range_start: date_type,
    range_end: date_type,
) -> list[date_type]:
    """Return each unique date in [range_start, range_end] when protocol fires."""
    try:
        stype = protocol.schedule_type or "daily"
        times: list[str] = protocol.schedule_times or ["08:00"]
        results: list[date_type] = []

        if stype == "daily":
            days = set(protocol.schedule_days) if protocol.schedule_days else set(range(7))
            cur = range_start
            while cur <= range_end:
                if cur.weekday() in days:
                    results.append(cur)
                cur += timedelta(days=1)

        elif stype in ("interval", "weekly"):
            n = protocol.schedule_interval_value or 1
            unit = (protocol.schedule_interval_unit or "days").lower()
            if unit == "hours":
                delta = timedelta(hours=n)
            elif unit == "weeks":
                delta = timedelta(weeks=n)
            else:
                delta = timedelta(days=n)

            h, m = map(int, (times[0] if times else "08:00").split(":"))
            if protocol.schedule_start_date:
                base = datetime.combine(protocol.schedule_start_date, time(h, m))
            else:
                base = datetime.combine(range_start, time(h, m))

            # Advance to first firing at or after range_start
            if base.date() < range_start and delta.total_seconds() > 0:
                diff = (datetime.combine(range_start, time(0, 0)) - base).total_seconds()
                steps = max(0, int(diff / delta.total_seconds()))
                base += delta * steps
                while base.date() < range_start:
                    base += delta

            seen: set[date_type] = set()
            while base.date() <= range_end:
                d = base.date()
                if d not in seen:
                    seen.add(d)
                    results.append(d)
                base += delta

        return results
    except Exception:
        return []
