from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload, selectinload

from app.database import get_db
from app.dependencies import get_current_user
from app.models import Compound, Injection, User
from app.schemas import InjectionCreate, InjectionRead, InjectionUpdate

router = APIRouter(prefix="/api/injections", tags=["injections"])


def _injection_to_read(inj: Injection) -> InjectionRead:
    return InjectionRead(
        id=inj.id,
        logged_by_user_id=inj.logged_by_user_id,
        injected_by_user_id=inj.injected_by_user_id,
        compound_id=inj.compound_id,
        dose_mcg=inj.dose_mcg,
        injection_site=inj.injection_site,
        injected_at=inj.injected_at,
        notes=inj.notes,
        created_at=inj.created_at,
        draw_volume_ml=inj.draw_volume_ml,
        dose_mode=inj.dose_mode,
        component_snapshot=inj.component_snapshot,
        logger_name=inj.logger.name if inj.logger else "Unknown",
        injector_name=inj.injector.name if inj.injector else "Unknown",
    )


def _load_injection(injection_id: int, db: Session) -> Injection:
    inj = (
        db.query(Injection)
        .options(joinedload(Injection.logger), joinedload(Injection.injector))
        .filter(Injection.id == injection_id)
        .first()
    )
    if inj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Injection not found")
    return inj


def _compute_blend_data(
    compound: Compound, dose_mcg: int, dose_mode: str
) -> tuple[float | None, list | None]:
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
    injected_by: Optional[int] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = (
        db.query(Injection)
        .options(joinedload(Injection.logger), joinedload(Injection.injector))
    )
    if compound_id is not None:
        q = q.filter(Injection.compound_id == compound_id)
    if from_ is not None:
        q = q.filter(Injection.injected_at >= from_)
    if to is not None:
        q = q.filter(Injection.injected_at <= to)
    if injected_by is not None:
        q = q.filter(Injection.injected_by_user_id == injected_by)
    return [_injection_to_read(i) for i in q.order_by(Injection.injected_at.desc()).all()]


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
    if compound is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Compound not found")

    # Resolve who physically received the injection
    if body.injected_by_user_id is not None and body.injected_by_user_id != current_user.id:
        injector = db.get(User, body.injected_by_user_id)
        if not injector or injector.deleted_at is not None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Injected-by user not found"
            )
        injected_by_id = body.injected_by_user_id
    else:
        injected_by_id = current_user.id

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
        logged_by_user_id=current_user.id,
        injected_by_user_id=injected_by_id,
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
    return _injection_to_read(_load_injection(injection.id, db))


@router.patch("/{injection_id}", response_model=InjectionRead)
def update_injection(
    injection_id: int,
    body: InjectionUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    inj = _load_injection(injection_id, db)
    if current_user.role != "admin" and current_user.id != inj.logged_by_user_id:
        raise HTTPException(403, "Only the logger or an admin can modify this injection")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(inj, field, value)
    db.commit()
    db.refresh(inj)
    return _injection_to_read(_load_injection(inj.id, db))


@router.delete("/{injection_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_injection(
    injection_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    inj = _load_injection(injection_id, db)
    if current_user.role != "admin" and current_user.id != inj.logged_by_user_id:
        raise HTTPException(403, "Only the logger or an admin can delete this injection")
    db.delete(inj)
    db.commit()
