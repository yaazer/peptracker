from fastapi import APIRouter, Depends
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models import User
from app.scheduler import _send_ntfy
from app.schemas import UserRead, UserUpdate

router = APIRouter(prefix="/api/profile", tags=["profile"])

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


@router.get("", response_model=UserRead)
def get_profile(user: User = Depends(get_current_user)):
    return user


@router.patch("", response_model=UserRead)
def update_profile(
    body: UserUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    data = body.model_dump(exclude_unset=True)
    if "password" in data and data["password"]:
        user.hashed_password = pwd_context.hash(data.pop("password"))
        user.force_password_change = False
    for field, value in data.items():
        setattr(user, field, value)
    db.commit()
    db.refresh(user)
    return user


@router.post("/test-notification")
def test_notification(user: User = Depends(get_current_user)):
    if not user.ntfy_topic:
        return {"ok": False, "error": "No ntfy topic configured"}
    delivered, error = _send_ntfy(
        user.ntfy_topic,
        "PepTracker v1",
        "Test notification — your reminders are working!",
    )
    return {"ok": delivered, "error": error}
