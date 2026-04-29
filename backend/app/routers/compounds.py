import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, selectinload

from app.auth.permissions import require_admin
from app.database import get_db
from app.dependencies import get_current_user
from app.models import BlendComponent, Compound, Injection, RefillLog, User
from app.schemas import CompoundCreate, CompoundRead, CompoundUpdate, RefillCreate, RefillLogRead

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/compounds", tags=["compounds"])


def _get_compound(compound_id: int, db: Session) -> Compound:
    compound = (
        db.query(Compound)
        .options(selectinload(Compound.blend_components))
        .filter(Compound.id == compound_id)
        .first()
    )
    if compound is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Compound not found")
    return compound


@router.get("", response_model=list[CompoundRead])
def list_compounds(
    include_archived: bool = False,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = db.query(Compound).options(selectinload(Compound.blend_components))
    if not include_archived:
        q = q.filter(Compound.archived == False)  # noqa: E712
    return q.order_by(Compound.name).all()


@router.post("", response_model=CompoundRead, status_code=status.HTTP_201_CREATED)
def create_compound(
    body: CompoundCreate,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    blend_components_data = body.blend_components
    compound_data = body.model_dump(exclude={"blend_components"})
    compound = Compound(created_by_user_id=current_user.id, **compound_data)
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
    return _get_compound(compound_id, db)


@router.patch("/{compound_id}", response_model=CompoundRead)
def update_compound(
    compound_id: int,
    body: CompoundUpdate,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    compound = _get_compound(compound_id, db)
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
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    compound = _get_compound(compound_id, db)

    injection_count = (
        db.query(Injection).filter(Injection.compound_id == compound_id).count()
    )
    if injection_count > 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Cannot delete: {injection_count} injection record(s) reference this compound. "
                "Archive it instead."
            ),
        )

    db.delete(compound)
    db.commit()


@router.post("/{compound_id}/refill", response_model=CompoundRead)
def log_refill(
    compound_id: int,
    body: RefillCreate,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    compound = _get_compound(compound_id, db)
    if compound.quantity_on_hand is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Inventory tracking is not enabled for this compound. Set quantity_on_hand first.",
        )
    compound.quantity_on_hand = (compound.quantity_on_hand or 0) + body.amount
    refill = RefillLog(
        compound_id=compound_id,
        logged_by_user_id=current_user.id,
        amount=body.amount,
        quantity_unit=compound.quantity_unit,
        notes=body.notes,
        logged_at=datetime.utcnow(),
    )
    db.add(refill)
    db.commit()
    return (
        db.query(Compound)
        .options(selectinload(Compound.blend_components))
        .filter(Compound.id == compound_id)
        .one()
    )


@router.get("/{compound_id}/refill-history", response_model=list[RefillLogRead])
def get_refill_history(
    compound_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _get_compound(compound_id, db)
    return (
        db.query(RefillLog)
        .filter(RefillLog.compound_id == compound_id)
        .order_by(RefillLog.logged_at.desc())
        .all()
    )
