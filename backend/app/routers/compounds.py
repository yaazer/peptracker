from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.dependencies import get_current_user
from app.models import BlendComponent, Compound, User
from app.schemas import CompoundCreate, CompoundRead, CompoundUpdate

router = APIRouter(prefix="/api/compounds", tags=["compounds"])


def _get_owned_compound(compound_id: int, user: User, db: Session) -> Compound:
    compound = (
        db.query(Compound)
        .options(selectinload(Compound.blend_components))
        .filter(Compound.id == compound_id)
        .first()
    )
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
    q = (
        db.query(Compound)
        .options(selectinload(Compound.blend_components))
        .filter(Compound.user_id == current_user.id)
    )
    if not include_archived:
        q = q.filter(Compound.archived == False)  # noqa: E712
    return q.order_by(Compound.name).all()


@router.post("", response_model=CompoundRead, status_code=status.HTTP_201_CREATED)
def create_compound(
    body: CompoundCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    blend_components_data = body.blend_components
    compound_data = body.model_dump(exclude={"blend_components"})
    compound = Compound(user_id=current_user.id, **compound_data)
    db.add(compound)
    db.flush()
    if blend_components_data:
        for i, bc_data in enumerate(blend_components_data):
            bc = BlendComponent(
                compound_id=compound.id,
                position=bc_data.position if bc_data.position else i,
                **bc_data.model_dump(exclude={"position"}),
            )
            db.add(bc)
    db.commit()
    return (
        db.query(Compound)
        .options(selectinload(Compound.blend_components))
        .filter(Compound.id == compound.id)
        .one()
    )


@router.get("/{compound_id}", response_model=CompoundRead)
def get_compound(
    compound_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return _get_owned_compound(compound_id, current_user, db)


@router.patch("/{compound_id}", response_model=CompoundRead)
def update_compound(
    compound_id: int,
    body: CompoundUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    compound = _get_owned_compound(compound_id, current_user, db)
    update_data = body.model_dump(exclude_unset=True, exclude={"blend_components"})
    for field, value in update_data.items():
        setattr(compound, field, value)

    if body.blend_components is not None:
        for bc in list(compound.blend_components):
            db.delete(bc)
        db.flush()
        for i, bc_data in enumerate(body.blend_components):
            bc = BlendComponent(
                compound_id=compound.id,
                position=bc_data.position if bc_data.position else i,
                **bc_data.model_dump(exclude={"position"}),
            )
            db.add(bc)

    db.commit()
    return (
        db.query(Compound)
        .options(selectinload(Compound.blend_components))
        .filter(Compound.id == compound.id)
        .one()
    )


@router.delete("/{compound_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_compound(
    compound_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    compound = _get_owned_compound(compound_id, current_user, db)
    db.delete(compound)
    db.commit()
