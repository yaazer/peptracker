import logging
from datetime import datetime, timezone

import httpx
from apscheduler.schedulers.background import BackgroundScheduler
from croniter import croniter
from sqlalchemy.orm import joinedload

from app.database import SessionLocal
from app.models import Protocol, ReminderLog

logger = logging.getLogger(__name__)

scheduler = BackgroundScheduler(timezone="UTC")


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _send_ntfy(topic: str, title: str, body: str) -> tuple[bool, str | None]:
    """POST to ntfy topic. Returns (delivered, error_message)."""
    # Accept either a full URL or a bare topic name
    url = topic if topic.startswith("http") else f"https://ntfy.sh/{topic}"
    try:
        r = httpx.post(
            url,
            content=body.encode(),
            headers={"Title": title, "Priority": "default"},
            timeout=5.0,
        )
        r.raise_for_status()
        return True, None
    except Exception as exc:
        return False, str(exc)


def check_and_fire() -> None:
    """Check all active protocols and fire ntfy notifications when due."""
    now = _utcnow()
    db = SessionLocal()
    try:
        protocols = (
            db.query(Protocol)
            .options(joinedload(Protocol.user), joinedload(Protocol.compound))
            .filter(Protocol.active == True)  # noqa: E712
            .all()
        )
        for protocol in protocols:
            if not protocol.user.ntfy_topic:
                continue

            anchor = protocol.last_fired_at or protocol.created_at
            try:
                next_fire = croniter(protocol.schedule_cron, anchor).get_next(datetime)
            except Exception:
                continue

            if next_fire > now:
                continue

            # Due — fire notification
            compound_name = protocol.compound.name
            body = f"Time for {compound_name} — {protocol.dose_mcg} mcg"
            delivered, error = _send_ntfy(protocol.user.ntfy_topic, "peptracker", body)

            log = ReminderLog(
                protocol_id=protocol.id,
                fired_at=now,
                delivered=delivered,
                error=error,
            )
            db.add(log)
            protocol.last_fired_at = now
            db.commit()

            if delivered:
                logger.info("Reminder fired for protocol %d (%s)", protocol.id, compound_name)
            else:
                logger.warning("Reminder delivery failed for protocol %d: %s", protocol.id, error)

    except Exception:
        logger.exception("Unhandled error in check_and_fire")
        db.rollback()
    finally:
        db.close()


scheduler.add_job(check_and_fire, "interval", minutes=1, id="check_and_fire", max_instances=1)
