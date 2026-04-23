from datetime import datetime, timezone

from croniter import croniter
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from app.auth.permissions import require_admin_or_assignee
from app.database import get_db
from app.dependencies import get_current_user
from app.models import Compound, Protocol, User
from app.schemas import ProtocolCreate, ProtocolRead, ProtocolUpdate

router = APIRouter(prefix="/api/protocols", tags=["protocols"])


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _next_fire(schedule_cron: str, anchor: datetime) -> datetime | None:
    try:
        return croniter(schedule_cron, anchor).get_next(datetime)
    except Exception:
        return None


def _to_read(p: Protocol) -> ProtocolRead:
    anchor = p.last_fired_at or p.created_at
    next_fire = _next_fire(p.schedule_cron, anchor)
    return ProtocolRead(
        id=p.id,
        assignee_user_id=p.assignee_user_id,
        assignee_name=p.assignee.name if p.assignee else "Unknown",
        created_by_user_id=p.created_by_user_id,
        compound_id=p.compound_id,
        compound_name=p.compound.name,
        dose_mcg=p.dose_mcg,
        schedule_cron=p.schedule_cron,
        active=p.active,
        notes=p.notes,
        created_at=p.created_at,
        last_fired_at=p.last_fired_at,
        next_fire_at=next_fire,
        dose_mode=p.dose_mode,
        anchor_component_id=p.anchor_component_id,
    )


def _load_protocol(protocol_id: int, db: Session) -> Protocol:
    p = (
        db.query(Protocol)
        .options(joinedload(Protocol.assignee), joinedload(Protocol.compound))
        .filter(Protocol.id == protocol_id)
        .first()
    )
    if not p:
        raise HTTPException(404, "Protocol not found")
    return p


@router.get("", response_model=list[ProtocolRead])
def list_protocols(
    include_inactive: bool = False,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = (
        db.query(Protocol)
        .options(joinedload(Protocol.assignee), joinedload(Protocol.compound))
    )
    if not include_inactive:
        q = q.filter(Protocol.active == True)  # noqa: E712
    return [_to_read(p) for p in q.order_by(Protocol.created_at).all()]


@router.post("", response_model=ProtocolRead, status_code=201)
def create_protocol(
    body: ProtocolCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not croniter.is_valid(body.schedule_cron):
        raise HTTPException(422, "Invalid cron expression")

    compound = db.query(Compound).filter(Compound.id == body.compound_id).first()
    if not compound:
        raise HTTPException(404, "Compound not found")

    # Determine assignee: admins may specify any user, members are forced to self
    if user.role == "admin" and body.assignee_user_id is not None:
        assignee_id = body.assignee_user_id
        assignee = db.get(User, assignee_id)
        if not assignee or assignee.deleted_at is not None:
            raise HTTPException(404, "Assignee user not found")
    else:
        if body.assignee_user_id is not None and body.assignee_user_id != user.id:
            raise HTTPException(403, "Members can only create protocols assigned to themselves")
        assignee_id = user.id

    p = Protocol(
        assignee_user_id=assignee_id,
        created_by_user_id=user.id,
        compound_id=body.compound_id,
        dose_mcg=body.dose_mcg,
        schedule_cron=body.schedule_cron,
        active=body.active,
        notes=body.notes,
        dose_mode=body.dose_mode,
        anchor_component_id=body.anchor_component_id,
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    return _to_read(_load_protocol(p.id, db))


@router.patch("/{protocol_id}", response_model=ProtocolRead)
def update_protocol(
    protocol_id: int,
    body: ProtocolUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Inline permission check (can't use factory dependency cleanly with body)
    p = _load_protocol(protocol_id, db)
    if user.role != "admin" and user.id != p.assignee_user_id:
        raise HTTPException(403, "Only the assignee or an admin can modify this protocol")

    data = body.model_dump(exclude_unset=True)
    if "schedule_cron" in data and not croniter.is_valid(data["schedule_cron"]):
        raise HTTPException(422, "Invalid cron expression")

    # Members cannot change the assignee
    if "assignee_user_id" in data and user.role != "admin":
        raise HTTPException(403, "Only admins can reassign a protocol")

    if "assignee_user_id" in data and data["assignee_user_id"] is not None:
        assignee = db.get(User, data["assignee_user_id"])
        if not assignee or assignee.deleted_at is not None:
            raise HTTPException(404, "Assignee user not found")

    for field, value in data.items():
        setattr(p, field, value)
    db.commit()
    db.refresh(p)
    return _to_read(_load_protocol(p.id, db))


@router.delete("/{protocol_id}", status_code=204)
def delete_protocol(
    protocol_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    p = _load_protocol(protocol_id, db)
    if user.role != "admin" and user.id != p.assignee_user_id:
        raise HTTPException(403, "Only the assignee or an admin can delete this protocol")
    db.delete(p)
    db.commit()
