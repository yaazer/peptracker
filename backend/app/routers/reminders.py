from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.dependencies import get_current_user
from app.models import Protocol, ReminderLog, User
from app.schemas import ReminderLogRead

router = APIRouter(prefix="/api/reminders", tags=["reminders"])


@router.get("", response_model=list[ReminderLogRead])
def list_reminders(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    logs = (
        db.query(ReminderLog)
        .join(Protocol, ReminderLog.protocol_id == Protocol.id)
        .options(
            joinedload(ReminderLog.protocol).joinedload(Protocol.compound)
        )
        .filter(Protocol.user_id == user.id)
        .order_by(ReminderLog.fired_at.desc())
        .limit(50)
        .all()
    )
    return [
        ReminderLogRead(
            id=log.id,
            protocol_id=log.protocol_id,
            compound_name=log.protocol.compound.name,
            protocol_dose_mcg=log.protocol.dose_mcg,
            fired_at=log.fired_at,
            delivered=log.delivered,
            error=log.error,
        )
        for log in logs
    ]
