from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models import Compound, Injection, User
from app.schemas import InjectionCreate, InjectionRead, InjectionUpdate

router = APIRouter(prefix="/api/injections", tags=["injections"])


def _get_owned_injection(injection_id: int, user: User, db: Session) -> Injection:
    injection = db.get(Injection, injection_id)
    if injection is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Injection not found")
    if injection.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your injection")
    return injection


@router.get("", response_model=list[InjectionRead])
def list_injections(
    compound_id: Optional[int] = None,
    from_: Optional[datetime] = Query(None, alias="from"),
    to: Optional[datetime] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = db.query(Injection).filter(Injection.user_id == current_user.id)
    if compound_id is not None:
        q = q.filter(Injection.compound_id == compound_id)
    if from_ is not None:
        q = q.filter(Injection.injected_at >= from_)
    if to is not None:
        q = q.filter(Injection.injected_at <= to)
    return q.order_by(Injection.injected_at.desc()).all()


@router.post("", response_model=InjectionRead, status_code=status.HTTP_201_CREATED)
def create_injection(
    body: InjectionCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    compound = db.get(Compound, body.compound_id)
    if compound is None or compound.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Compound not found")
    injection = Injection(user_id=current_user.id, **body.model_dump())
    db.add(injection)
    db.commit()
    db.refresh(injection)
    return injection


@router.patch("/{injection_id}", response_model=InjectionRead)
def update_injection(
    injection_id: int,
    body: InjectionUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    injection = _get_owned_injection(injection_id, current_user, db)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(injection, field, value)
    db.commit()
    db.refresh(injection)
    return injection


@router.delete("/{injection_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_injection(
    injection_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    injection = _get_owned_injection(injection_id, current_user, db)
    db.delete(injection)
    db.commit()
