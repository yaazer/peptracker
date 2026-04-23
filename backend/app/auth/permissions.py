from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models import Injection, Protocol, User


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return current_user


def require_admin_or_assignee(protocol_id: int):
    """Dependency factory: passes if current user is admin or the protocol's assignee."""
    def _dep(
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> User:
        protocol = db.get(Protocol, protocol_id)
        if protocol is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Protocol not found")
        if current_user.role != "admin" and current_user.id != protocol.assignee_user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only the assignee or an admin can modify this protocol",
            )
        return current_user

    return _dep


def require_admin_or_logger(injection_id: int):
    """Dependency factory: passes if current user is admin or logged this injection."""
    def _dep(
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> User:
        injection = db.get(Injection, injection_id)
        if injection is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Injection not found"
            )
        if current_user.role != "admin" and current_user.id != injection.logged_by_user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only the logger or an admin can modify this injection",
            )
        return current_user

    return _dep
