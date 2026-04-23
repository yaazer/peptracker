import logging
from datetime import datetime, timezone

import httpx
from apscheduler.schedulers.background import BackgroundScheduler
from croniter import croniter
from sqlalchemy.orm import joinedload, selectinload

from app.database import SessionLocal
from app.models import Compound, Protocol, ReminderLog

logger = logging.getLogger(__name__)

scheduler = BackgroundScheduler(timezone="UTC")


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _send_ntfy(topic: str, title: str, body: str) -> tuple[bool, str | None]:
    """POST to ntfy topic. Returns (delivered, error_message)."""
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


def _blend_draw_ml(protocol: Protocol, compound: Compound) -> float | None:
    """Compute draw volume in mL for a blend protocol, or None if data is missing."""
    bac = float(compound.bac_water_ml or 0)
    if not bac or not compound.blend_components:
        return None
    total_mg = sum(float(bc.amount_mg) for bc in compound.blend_components)
    if not total_mg:
        return None
    if protocol.dose_mode == "anchor" and protocol.anchor_component_id:
        anchor = next(
            (bc for bc in compound.blend_components if bc.id == protocol.anchor_component_id),
            None,
        )
        if anchor:
            anchor_conc = float(anchor.amount_mg) / bac
            return protocol.dose_mcg / 1000 / anchor_conc if anchor_conc else None
    concentration = total_mg / bac
    return protocol.dose_mcg / 1000 / concentration


def _build_message(protocol: Protocol, compound: Compound) -> str:
    """Build the ntfy notification body for a protocol firing."""
    compound_name = compound.name

    if not compound.is_blend:
        return f"Time for {compound_name} — {protocol.dose_mcg} mcg"

    total_mg = sum(float(bc.amount_mg) for bc in compound.blend_components)
    draw = _blend_draw_ml(protocol, compound)
    draw_str = f", draw {draw:.3f} mL" if draw is not None else ""

    if protocol.dose_mode == "anchor" and protocol.anchor_component_id:
        anchor = next(
            (bc for bc in compound.blend_components if bc.id == protocol.anchor_component_id),
            None,
        )
        if anchor:
            return (
                f"Time for {protocol.dose_mcg} mcg {anchor.name} via {compound_name}"
                f" — total {total_mg:g} mg{draw_str}"
            )

    return f"Time for {total_mg:g} mg {compound_name}{draw_str}"


def check_and_fire() -> None:
    """Check all active protocols and fire ntfy notifications when due."""
    now = _utcnow()
    db = SessionLocal()
    try:
        protocols = (
            db.query(Protocol)
            .options(
                joinedload(Protocol.user),
                joinedload(Protocol.compound).selectinload(Compound.blend_components),
            )
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

            body = _build_message(protocol, protocol.compound)
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

            compound_name = protocol.compound.name
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
