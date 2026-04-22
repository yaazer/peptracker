from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, selectinload

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


def _compute_blend_data(
    compound: Compound, dose_mcg: int, dose_mode: str
) -> tuple[float | None, list | None]:
    """Return (draw_volume_ml, component_snapshot) for a blend compound."""
    components = sorted(compound.blend_components, key=lambda c: c.position)
    if not components:
        return None, None

    total_amount_mg = sum(float(c.amount_mg) for c in components)
    bac_ml = float(compound.bac_water_ml) if compound.bac_water_ml else None
    if not total_amount_mg or not bac_ml:
        return None, None

    if dose_mode == "anchor":
        anchor = next((c for c in components if c.is_anchor), components[0])
        anchor_conc = float(anchor.amount_mg) / bac_ml
        draw_volume_ml = dose_mcg / 1000.0 / anchor_conc if anchor_conc > 0 else None
        anchor_fraction = float(anchor.amount_mg) / total_amount_mg
        total_dose_mcg = dose_mcg / anchor_fraction if anchor_fraction > 0 else dose_mcg
    else:
        concentration = total_amount_mg / bac_ml
        draw_volume_ml = dose_mcg / 1000.0 / concentration if concentration > 0 else None
        total_dose_mcg = dose_mcg

    snapshot = [
        {
            "name": c.name,
            "amount_mg": float(c.amount_mg),
            "dose_mcg": round(total_dose_mcg * float(c.amount_mg) / total_amount_mg),
            "linked_compound_id": c.linked_compound_id,
        }
        for c in components
    ]
    return draw_volume_ml, snapshot


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
    compound = (
        db.query(Compound)
        .options(selectinload(Compound.blend_components))
        .filter(Compound.id == body.compound_id)
        .first()
    )
    if compound is None or compound.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Compound not found")

    draw_volume_ml: float | None = None
    component_snapshot: list | None = None

    if compound.is_blend:
        draw_volume_ml, component_snapshot = _compute_blend_data(
            compound, body.dose_mcg, body.dose_mode
        )
    elif compound.concentration_mg_per_ml:
        conc = float(compound.concentration_mg_per_ml)
        if conc > 0:
            draw_volume_ml = body.dose_mcg / 1000.0 / conc

    injection = Injection(
        user_id=current_user.id,
        compound_id=body.compound_id,
        dose_mcg=body.dose_mcg,
        injection_site=body.injection_site,
        injected_at=body.injected_at,
        notes=body.notes,
        dose_mode=body.dose_mode,
        draw_volume_ml=draw_volume_ml,
        component_snapshot=component_snapshot,
    )
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
