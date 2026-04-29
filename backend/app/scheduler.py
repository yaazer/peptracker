import logging
from datetime import date, datetime, timedelta, timezone

import httpx
from apscheduler.schedulers.background import BackgroundScheduler
from sqlalchemy.orm import joinedload, selectinload

from app.database import SessionLocal
from app.models import Compound, Injection, Prescription, Protocol, ReminderLog, User
from app.schedule_utils import _next_fire_structured

logger = logging.getLogger(__name__)

scheduler = BackgroundScheduler(timezone="UTC")

LOW_STOCK_ALERT_COOLDOWN_HOURS = 24
RX_EXPIRY_WARNING_DAYS = 14
RX_EXPIRY_ALERT_COOLDOWN_HOURS = 24


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _send_ntfy(topic: str, title: str, body: str) -> tuple[bool, str | None]:
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


def _build_message(protocol: Protocol, compound: Compound, assignee_name: str) -> str:
    prefix = f"{assignee_name}, "
    compound_name = compound.name

    if compound.medication_type != "injection":
        if protocol.dose_mcg and compound.strength_amount and compound.strength_unit:
            su = compound.strength_unit.lower()
            sa = float(compound.strength_amount)
            unit_mcg = sa * 1000 if "mg" in su else (sa if "mcg" in su else None)
            if unit_mcg:
                qty = protocol.dose_mcg / unit_mcg
                du = compound.dose_unit or "dose"
                qty_str = str(int(qty)) if qty == int(qty) else f"{qty:.1f}"
                msg = f"{prefix}time for {qty_str} {du} of {compound_name} ({sa:g} {compound.strength_unit})"
            else:
                msg = f"{prefix}time for {compound_name}"
        else:
            msg = f"{prefix}time for {compound_name}"
    elif not compound.is_blend:
        dose_str = f"{protocol.dose_mcg:,}" if protocol.dose_mcg else "?"
        msg = f"{prefix}time for {dose_str} mcg {compound_name}"
    else:
        total_mg = sum(float(bc.amount_mg) for bc in compound.blend_components)
        draw = _blend_draw_ml(protocol, compound)
        draw_str = f", draw {draw:.3f} mL" if draw is not None else ""

        if protocol.dose_mode == "anchor" and protocol.anchor_component_id:
            anchor = next(
                (bc for bc in compound.blend_components if bc.id == protocol.anchor_component_id),
                None,
            )
            if anchor:
                msg = (
                    f"{prefix}time for {protocol.dose_mcg} mcg {anchor.name} via {compound_name}"
                    f" — total {total_mg:g} mg{draw_str}"
                )
            else:
                msg = f"{prefix}time for {total_mg:g} mg {compound_name}{draw_str}"
        else:
            msg = f"{prefix}time for {total_mg:g} mg {compound_name}{draw_str}"

    # Append dosing instructions
    if protocol.take_with_food:
        msg += "\n⚠ Take with food"
    if protocol.dosing_instructions:
        msg += f"\n{protocol.dosing_instructions}"

    return msg


def check_and_fire() -> None:
    now = _utcnow()
    db = SessionLocal()
    try:
        protocols = (
            db.query(Protocol)
            .options(
                joinedload(Protocol.assignee),
                joinedload(Protocol.compound).selectinload(Compound.blend_components),
            )
            .filter(Protocol.active == True)  # noqa: E712
            .all()
        )
        for protocol in protocols:
            assignee = protocol.assignee
            if not assignee or not assignee.ntfy_topic:
                if assignee:
                    anchor = protocol.last_fired_at or protocol.created_at
                    next_fire = _next_fire_structured(protocol, anchor)
                    if next_fire is None:
                        continue
                    if next_fire <= now:
                        log = ReminderLog(
                            protocol_id=protocol.id,
                            fired_at=now,
                            delivered=False,
                            error="Assignee has no ntfy endpoint configured",
                        )
                        db.add(log)
                        protocol.last_fired_at = now
                        db.commit()
                continue

            anchor = protocol.last_fired_at or protocol.created_at
            next_fire = _next_fire_structured(protocol, anchor)
            if next_fire is None:
                continue

            if next_fire > now:
                continue

            body = _build_message(protocol, protocol.compound, assignee.name)
            delivered, error = _send_ntfy(assignee.ntfy_topic, "DoseLog", body)

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
                logger.info(
                    "Reminder fired for protocol %d (%s) → %s",
                    protocol.id, compound_name, assignee.name,
                )
            else:
                logger.warning(
                    "Reminder delivery failed for protocol %d: %s", protocol.id, error
                )

    except Exception:
        logger.exception("Unhandled error in check_and_fire")
        db.rollback()
    finally:
        db.close()


def _doses_per_day(protocol: Protocol) -> float:
    """Estimate doses per day for a protocol (for low-stock day calculations)."""
    st = protocol.schedule_type
    times = protocol.schedule_times or ["08:00"]
    n_times = len(times)
    if st == "daily":
        days = protocol.schedule_days
        if days:
            return n_times * len(days) / 7
        return float(n_times)
    if st == "weekly":
        days = protocol.schedule_days or []
        return n_times * len(days) / 7 if days else n_times / 7
    if st == "interval":
        val = protocol.schedule_interval_value or 1
        unit = protocol.schedule_interval_unit or "days"
        if unit == "hours":
            return 24 / val
        if unit == "weeks":
            return n_times / (val * 7)
        return n_times / val
    return float(n_times)


def check_low_stock() -> None:
    """Alert assignees when a compound's inventory crosses the low-stock threshold."""
    now = _utcnow()
    cooldown = timedelta(hours=LOW_STOCK_ALERT_COOLDOWN_HOURS)
    db = SessionLocal()
    try:
        compounds = (
            db.query(Compound)
            .filter(
                Compound.archived == False,  # noqa: E712
                Compound.quantity_on_hand != None,  # noqa: E711
            )
            .all()
        )
        for compound in compounds:
            if compound.quantity_on_hand is None:
                continue

            # Determine threshold in same unit as quantity_on_hand
            threshold: float | None = None
            if compound.low_stock_threshold is not None:
                threshold = compound.low_stock_threshold
            elif compound.low_stock_days is not None:
                # Sum doses_per_day across active protocols for this compound
                protocols = (
                    db.query(Protocol)
                    .filter(Protocol.compound_id == compound.id, Protocol.active == True)  # noqa: E712
                    .all()
                )
                total_per_day = sum(_doses_per_day(p) for p in protocols)
                if total_per_day > 0:
                    threshold = compound.low_stock_days * total_per_day

            if threshold is None or compound.quantity_on_hand > threshold:
                continue

            # Cooldown: don't spam the same alert
            if compound.last_low_stock_alert_at and (now - compound.last_low_stock_alert_at) < cooldown:
                continue

            # Find recipients: assignees of active protocols + admins, all with ntfy_topic
            assignee_ids: set[int] = set()
            for p in db.query(Protocol).filter(
                Protocol.compound_id == compound.id, Protocol.active == True  # noqa: E712
            ).all():
                assignee_ids.add(p.assignee_user_id)

            recipients = (
                db.query(User)
                .filter(
                    User.ntfy_topic != None,  # noqa: E711
                    User.deleted_at == None,  # noqa: E711
                    (User.id.in_(assignee_ids)) | (User.role == "admin"),
                )
                .all()
            )

            unit = compound.quantity_unit or "units"
            qty_str = f"{compound.quantity_on_hand:g} {unit}"
            title = f"Low stock — {compound.name}"
            body_text = f"Only {qty_str} remaining. Time to refill."
            if compound.low_stock_days:
                body_text += f" (threshold: {compound.low_stock_days} days of doses)"

            sent = False
            for user in recipients:
                ok, _ = _send_ntfy(user.ntfy_topic, title, body_text)
                if ok:
                    sent = True

            if sent or recipients:
                compound.last_low_stock_alert_at = now
                db.commit()
                logger.info("Low-stock alert sent for compound %d (%s)", compound.id, compound.name)

    except Exception:
        logger.exception("Unhandled error in check_low_stock")
        db.rollback()
    finally:
        db.close()


def check_rx_expiry() -> None:
    """Alert when an active prescription expires within RX_EXPIRY_WARNING_DAYS days."""
    now = _utcnow()
    today = now.date()
    cooldown = timedelta(hours=RX_EXPIRY_ALERT_COOLDOWN_HOURS)
    cutoff = today + timedelta(days=RX_EXPIRY_WARNING_DAYS)
    db = SessionLocal()
    try:
        rxs = (
            db.query(Prescription)
            .filter(
                Prescription.is_active == True,  # noqa: E712
                Prescription.expiry_date != None,  # noqa: E711
                Prescription.expiry_date <= cutoff,
                Prescription.expiry_date >= today,
            )
            .all()
        )
        for rx in rxs:
            if rx.last_expiry_alert_at and (now - rx.last_expiry_alert_at) < cooldown:
                continue

            compound = db.get(Compound, rx.compound_id)
            if compound is None or compound.archived:
                continue

            days_left = (rx.expiry_date - today).days
            title = f"Rx expiring — {compound.name}"
            body_text = (
                f"Prescription for {compound.name} expires in {days_left} day{'s' if days_left != 1 else ''}."
            )
            if rx.rx_number:
                body_text += f" Rx #{rx.rx_number}"
            if rx.pharmacy_name:
                body_text += f" at {rx.pharmacy_name}"
            body_text += ". Time to renew."

            # Recipients: assignees of active protocols + admins with ntfy_topic
            assignee_ids: set[int] = set()
            for p in db.query(Protocol).filter(
                Protocol.compound_id == compound.id, Protocol.active == True  # noqa: E712
            ).all():
                assignee_ids.add(p.assignee_user_id)

            recipients = (
                db.query(User)
                .filter(
                    User.ntfy_topic != None,  # noqa: E711
                    User.deleted_at == None,  # noqa: E711
                    (User.id.in_(assignee_ids)) | (User.role == "admin"),
                )
                .all()
            )

            sent = False
            for user in recipients:
                ok, _ = _send_ntfy(user.ntfy_topic, title, body_text)
                if ok:
                    sent = True

            if sent or recipients:
                rx.last_expiry_alert_at = now
                db.commit()
                logger.info("Rx expiry alert sent for prescription %d (compound %d)", rx.id, rx.compound_id)

    except Exception:
        logger.exception("Unhandled error in check_rx_expiry")
        db.rollback()
    finally:
        db.close()


scheduler.add_job(check_and_fire, "interval", minutes=1, id="check_and_fire", max_instances=1)
scheduler.add_job(check_low_stock, "interval", minutes=30, id="check_low_stock", max_instances=1)
scheduler.add_job(check_rx_expiry, "interval", hours=6, id="check_rx_expiry", max_instances=1)
