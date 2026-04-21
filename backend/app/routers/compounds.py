from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models import Compound, User
from app.schemas import CompoundCreate, CompoundRead, CompoundUpdate

router = APIRouter(prefix="/api/compounds", tags=["compounds"])


def _get_owned_compound(compound_id: int, user: User, db: Session) -> Compound:
    compound = db.get(Compound, compound_id)
    if compound is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Compound not found")
    if compound.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your compound")
    return compound


@router.get("", response_model=list[CompoundRead])
def list_compounds(
    include_archived: bool = False,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = db.query(Compound).filter(Compound.user_id == current_user.id)
    if not include_archived:
        q = q.filter(Compound.archived == False)  # noqa: E712
    return q.order_by(Compound.name).all()


@router.post("", response_model=CompoundRead, status_code=status.HTTP_201_CREATED)
def create_compound(
    body: CompoundCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    compound = Compound(user_id=current_user.id, **body.model_dump())
    db.add(compound)
    db.commit()
    db.refresh(compound)
    return compound


@router.patch("/{compound_id}", response_model=CompoundRead)
def update_compound(
    compound_id: int,
    body: CompoundUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    compound = _get_owned_compound(compound_id, current_user, db)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(compound, field, value)
    db.commit()
    db.refresh(compound)
    return compound


@router.delete("/{compound_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_compound(
    compound_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    compound = _get_owned_compound(compound_id, current_user, db)
    db.delete(compound)
    db.commit()
