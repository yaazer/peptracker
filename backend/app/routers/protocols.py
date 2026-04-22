from datetime import datetime, timezone

from croniter import croniter
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

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
        user_id=p.user_id,
        compound_id=p.compound_id,
        compound_name=p.compound.name,
        dose_mcg=p.dose_mcg,
        schedule_cron=p.schedule_cron,
        active=p.active,
        notes=p.notes,
        created_at=p.created_at,
        last_fired_at=p.last_fired_at,
        next_fire_at=next_fire,
    )


def _get_owned(protocol_id: int, user: User, db: Session) -> Protocol:
    p = db.query(Protocol).filter(Protocol.id == protocol_id).first()
    if not p:
        raise HTTPException(404, "Protocol not found")
    if p.user_id != user.id:
        raise HTTPException(403, "Not your protocol")
    return p


@router.get("", response_model=list[ProtocolRead])
def list_protocols(
    include_inactive: bool = False,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = db.query(Protocol).filter(Protocol.user_id == user.id)
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

    compound = db.query(Compound).filter(
        Compound.id == body.compound_id, Compound.user_id == user.id
    ).first()
    if not compound:
        raise HTTPException(404, "Compound not found")

    p = Protocol(
        user_id=user.id,
        compound_id=body.compound_id,
        dose_mcg=body.dose_mcg,
        schedule_cron=body.schedule_cron,
        active=body.active,
        notes=body.notes,
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    return _to_read(p)


@router.patch("/{protocol_id}", response_model=ProtocolRead)
def update_protocol(
    protocol_id: int,
    body: ProtocolUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    p = _get_owned(protocol_id, user, db)

    data = body.model_dump(exclude_unset=True)
    if "schedule_cron" in data and not croniter.is_valid(data["schedule_cron"]):
        raise HTTPException(422, "Invalid cron expression")

    for field, value in data.items():
        setattr(p, field, value)
    db.commit()
    db.refresh(p)
    return _to_read(p)


@router.delete("/{protocol_id}", status_code=204)
def delete_protocol(
    protocol_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    p = _get_owned(protocol_id, user, db)
    db.delete(p)
    db.commit()
