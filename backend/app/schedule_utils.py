from datetime import datetime, time, timedelta
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
