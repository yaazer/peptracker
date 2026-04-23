from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from app.auth.permissions import require_admin
from app.database import get_db
from app.dependencies import get_current_user
from app.models import Protocol, User
from app.schemas import HouseholdUser, UserAdminUpdate, UserInvite, UserRead

router = APIRouter(prefix="/api/users", tags=["users"])

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


@router.get("/household", response_model=list[HouseholdUser])
def list_household_members(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Lightweight list for all authenticated users (e.g. for 'Who injected this?' dropdown)."""
    return (
        db.query(User)
        .filter(User.deleted_at == None)  # noqa: E711
        .order_by(User.name)
        .all()
    )


@router.get("", response_model=list[UserRead])
def list_users(
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    return (
        db.query(User)
        .filter(User.deleted_at == None)  # noqa: E711
        .order_by(User.name)
        .all()
    )


@router.post("/invite", response_model=UserRead, status_code=status.HTTP_201_CREATED)
def invite_user(
    body: UserInvite,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    if db.query(User).filter(User.email == body.email).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")
    user = User(
        email=body.email,
        name=body.name,
        hashed_password=pwd_context.hash(body.temporary_password),
        role="member",
        force_password_change=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.patch("/{user_id}", response_model=UserRead)
def update_user(
    user_id: int,
    body: UserAdminUpdate,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    user = db.get(User, user_id)
    if not user or user.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    # Prevent demoting the last admin
    if body.role == "member" and user.role == "admin":
        admin_count = (
            db.query(User)
            .filter(User.role == "admin", User.deleted_at == None, User.id != user_id)  # noqa: E711
            .count()
        )
        if admin_count == 0:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Cannot demote the last admin",
            )

    data = body.model_dump(exclude_unset=True)
    for field, value in data.items():
        setattr(user, field, value)
    db.commit()
    db.refresh(user)
    return user


@router.post("/{user_id}/reset-password", response_model=UserRead)
def reset_password(
    user_id: int,
    body: dict,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    user = db.get(User, user_id)
    if not user or user.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    temporary_password = body.get("temporary_password")
    if not temporary_password:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="temporary_password required")

    user.hashed_password = pwd_context.hash(temporary_password)
    user.force_password_change = True
    db.commit()
    db.refresh(user)
    return user


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: int,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    user = db.get(User, user_id)
    if not user or user.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    # Cannot self-delete
    if user.id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot delete your own account",
        )

    # Guard: last admin
    if user.role == "admin":
        admin_count = (
            db.query(User)
            .filter(User.role == "admin", User.deleted_at == None, User.id != user_id)  # noqa: E711
            .count()
        )
        if admin_count == 0:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Cannot delete the last admin",
            )

    # Guard: active protocol assignee
    active_protocol_count = (
        db.query(Protocol)
        .filter(Protocol.assignee_user_id == user_id, Protocol.active == True)  # noqa: E712
        .count()
    )
    if active_protocol_count > 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Cannot deactivate: {active_protocol_count} active protocol(s) are assigned to this user. "
                "Reassign or deactivate them first."
            ),
        )

    user.deleted_at = datetime.utcnow()
    db.commit()
