from collections import defaultdict
from datetime import datetime, timedelta

from croniter import croniter
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models import Compound, Injection, Protocol, User
from app.schemas import (
    DashboardResponse,
    InjectionRead,
    LastByCompoundItem,
    NextDoseItem,
    TimelinePoint,
    WeekCompoundSummary,
    WeekSummary,
)

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("", response_model=DashboardResponse)
def get_dashboard(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    now = datetime.utcnow()

    # ------------------------------------------------------------------
    # 1. Next scheduled dose per active protocol
    # ------------------------------------------------------------------
    protocols = (
        db.query(Protocol)
        .filter(Protocol.user_id == current_user.id, Protocol.active == True)  # noqa: E712
        .all()
    )

    next_doses: list[NextDoseItem] = []
    for protocol in protocols:
        last_inj = (
            db.query(Injection)
            .filter(
                Injection.user_id == current_user.id,
                Injection.compound_id == protocol.compound_id,
            )
            .order_by(Injection.injected_at.desc())
            .first()
        )
        base_dt = last_inj.injected_at if last_inj else now
        try:
            cron = croniter(protocol.schedule_cron, base_dt)
            next_fire = cron.get_next(datetime)
        except Exception:
            continue

        compound = db.get(Compound, protocol.compound_id)
        next_doses.append(
            NextDoseItem(
                protocol_id=protocol.id,
                compound_name=compound.name if compound else f"Compound #{protocol.compound_id}",
                dose_mcg=protocol.dose_mcg,
                next_fire_at=next_fire,
                schedule_cron=protocol.schedule_cron,
            )
        )

    next_doses.sort(key=lambda x: x.next_fire_at)

    # ------------------------------------------------------------------
    # 2. Last injection per active compound
    # ------------------------------------------------------------------
    compounds = (
        db.query(Compound)
        .filter(Compound.user_id == current_user.id, Compound.archived == False)  # noqa: E712
        .order_by(Compound.name)
        .all()
    )

    last_by_compound: list[LastByCompoundItem] = []
    for compound in compounds:
        last_inj = (
            db.query(Injection)
            .filter(Injection.compound_id == compound.id)
            .order_by(Injection.injected_at.desc())
            .first()
        )
        if last_inj:
            last_by_compound.append(
                LastByCompoundItem(
                    compound_id=compound.id,
                    compound_name=compound.name,
                    dose_mcg=last_inj.dose_mcg,
                    injection_site=last_inj.injection_site,
                    injected_at=last_inj.injected_at,
                )
            )

    last_by_compound.sort(key=lambda x: x.injected_at, reverse=True)

    # ------------------------------------------------------------------
    # 3. This week's summary (per-component for blends)
    # ------------------------------------------------------------------
    week_start = now - timedelta(days=7)
    week_injections = (
        db.query(Injection)
        .filter(
            Injection.user_id == current_user.id,
            Injection.injected_at >= week_start,
        )
        .all()
    )

    compound_cache: dict[int, str] = {}

    def compound_name(cid: int) -> str:
        if cid not in compound_cache:
            c = db.get(Compound, cid)
            compound_cache[cid] = c.name if c else f"Compound #{cid}"
        return compound_cache[cid]

    by_cpd: dict[str, dict] = defaultdict(lambda: {"count": 0, "total_mcg": 0})
    for inj in week_injections:
        if inj.component_snapshot:
            for comp in inj.component_snapshot:
                by_cpd[comp["name"]]["count"] += 1
                by_cpd[comp["name"]]["total_mcg"] += comp["dose_mcg"]
        else:
            name = compound_name(inj.compound_id)
            by_cpd[name]["count"] += 1
            by_cpd[name]["total_mcg"] += inj.dose_mcg

    week_summary = WeekSummary(
        total_injections=len(week_injections),
        by_compound=[
            WeekCompoundSummary(compound_name=n, **v)
            for n, v in sorted(by_cpd.items(), key=lambda x: -x[1]["total_mcg"])
        ],
    )

    # ------------------------------------------------------------------
    # 4. Recent activity (last 5)
    # ------------------------------------------------------------------
    recent_rows = (
        db.query(Injection)
        .filter(Injection.user_id == current_user.id)
        .order_by(Injection.injected_at.desc())
        .limit(5)
        .all()
    )
    recent = [InjectionRead.model_validate(r) for r in recent_rows]

    # ------------------------------------------------------------------
    # 5. 30-day timeline grouped by date + compound/component
    # ------------------------------------------------------------------
    thirty_ago = now - timedelta(days=30)
    timeline_rows = (
        db.query(Injection)
        .filter(
            Injection.user_id == current_user.id,
            Injection.injected_at >= thirty_ago,
        )
        .all()
    )

    tl_map: dict[tuple, dict] = defaultdict(lambda: {"total_mcg": 0, "count": 0})
    for inj in timeline_rows:
        date_str = inj.injected_at.strftime("%Y-%m-%d")
        if inj.component_snapshot:
            for comp in inj.component_snapshot:
                key = (date_str, inj.compound_id, comp["name"])
                tl_map[key]["total_mcg"] += comp["dose_mcg"]
                tl_map[key]["count"] += 1
        else:
            key = (date_str, inj.compound_id, compound_name(inj.compound_id))
            tl_map[key]["total_mcg"] += inj.dose_mcg
            tl_map[key]["count"] += 1

    timeline = [
        TimelinePoint(date=k[0], compound_id=k[1], compound_name=k[2], **v)
        for k, v in sorted(tl_map.items())
    ]

    return DashboardResponse(
        next_doses=next_doses,
        last_by_compound=last_by_compound,
        week_summary=week_summary,
        recent=recent,
        timeline=timeline,
    )
