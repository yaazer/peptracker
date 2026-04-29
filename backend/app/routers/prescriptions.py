from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth.permissions import require_admin
from app.database import get_db
from app.dependencies import get_current_user
from app.models import Compound, Prescription, User
from app.schemas import PrescriptionCreate, PrescriptionRead

router = APIRouter(prefix="/api/compounds", tags=["prescriptions"])
global_router = APIRouter(prefix="/api/prescriptions", tags=["prescriptions"])

RX_EXPIRY_WARNING_DAYS = 14


def _get_compound_or_404(compound_id: int, db: Session) -> Compound:
    compound = db.get(Compound, compound_id)
    if compound is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Compound not found")
    return compound


def _get_rx_or_404(rx_id: int, compound_id: int, db: Session) -> Prescription:
    rx = db.query(Prescription).filter(
        Prescription.id == rx_id, Prescription.compound_id == compound_id
    ).first()
    if rx is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Prescription not found")
    return rx


@router.get("/{compound_id}/prescriptions", response_model=list[PrescriptionRead])
def list_prescriptions(
    compound_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _get_compound_or_404(compound_id, db)
    return (
        db.query(Prescription)
        .filter(Prescription.compound_id == compound_id)
        .order_by(Prescription.created_at.desc())
        .all()
    )


@router.post(
    "/{compound_id}/prescriptions",
    response_model=PrescriptionRead,
    status_code=status.HTTP_201_CREATED,
)
def create_prescription(
    compound_id: int,
    body: PrescriptionCreate,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    _get_compound_or_404(compound_id, db)

    # Deactivate all existing prescriptions for this compound if new one is active
    if body.is_active:
        db.query(Prescription).filter(
            Prescription.compound_id == compound_id, Prescription.is_active == True  # noqa: E712
        ).update({"is_active": False})

    rx = Prescription(
        compound_id=compound_id,
        created_by_user_id=current_user.id,
        **body.model_dump(),
    )
    db.add(rx)
    db.commit()
    db.refresh(rx)
    return rx


@router.patch("/{compound_id}/prescriptions/{rx_id}", response_model=PrescriptionRead)
def update_prescription(
    compound_id: int,
    rx_id: int,
    body: PrescriptionCreate,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    rx = _get_rx_or_404(rx_id, compound_id, db)

    if body.is_active and not rx.is_active:
        db.query(Prescription).filter(
            Prescription.compound_id == compound_id,
            Prescription.is_active == True,  # noqa: E712
            Prescription.id != rx_id,
        ).update({"is_active": False})

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(rx, field, value)

    db.commit()
    db.refresh(rx)
    return rx


@router.delete(
    "/{compound_id}/prescriptions/{rx_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_prescription(
    compound_id: int,
    rx_id: int,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    rx = _get_rx_or_404(rx_id, compound_id, db)
    db.delete(rx)
    db.commit()


@global_router.get("", response_model=list[PrescriptionRead])
def list_all_prescriptions(
    active_only: bool = True,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = db.query(Prescription)
    if active_only:
        q = q.filter(Prescription.is_active == True)  # noqa: E712
    return q.order_by(Prescription.compound_id, Prescription.created_at.desc()).all()


def get_expiring_prescriptions(db: Session, within_days: int = RX_EXPIRY_WARNING_DAYS) -> list[Prescription]:
    """Return active prescriptions expiring within `within_days` days."""
    today = date.today()
    cutoff = today + timedelta(days=within_days)
    return (
        db.query(Prescription)
        .filter(
            Prescription.is_active == True,  # noqa: E712
            Prescription.expiry_date != None,  # noqa: E711
            Prescription.expiry_date <= cutoff,
            Prescription.expiry_date >= today,
        )
        .all()
    )
