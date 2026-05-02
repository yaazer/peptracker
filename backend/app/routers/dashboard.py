from collections import defaultdict
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.dependencies import get_current_user
from app.models import Compound, Injection, Protocol, User
from app.schedule_utils import _fire_dates_in_range, _next_fire_structured
from app.schemas import (
    DashboardResponse,
    LastByCompoundItem,
    NextDoseItem,
    TimelinePoint,
    TimelineScheduledPoint,
    UserDoseSummary,
    WeekCompoundSummary,
    WeekSummary,
)
from app.routers.injections import _injection_to_read

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


def _build_week_summary(injections: list[Injection], db: Session) -> WeekSummary:
    compound_cache: dict[int, str] = {}

    def compound_name(cid: int) -> str:
        if cid not in compound_cache:
            c = db.get(Compound, cid)
            compound_cache[cid] = c.name if c else f"Compound #{cid}"
        return compound_cache[cid]

    # by_compound_user: {compound_name: {user_id: {user_name, count, total_mcg}}}
    by_cpd: dict[str, dict] = defaultdict(lambda: {"count": 0, "total_mcg": 0, "users": {}})

    for inj in injections:
        injector_id = inj.injected_by_user_id
        injector_name = inj.injector.name if inj.injector else "Unknown"

        if inj.component_snapshot:
            for comp in inj.component_snapshot:
                cpd = comp["name"]
                by_cpd[cpd]["count"] += 1
                by_cpd[cpd]["total_mcg"] += comp["dose_mcg"]
                u = by_cpd[cpd]["users"].setdefault(
                    injector_id, {"user_name": injector_name, "count": 0, "total_mcg": 0}
                )
                u["count"] += 1
                u["total_mcg"] += comp["dose_mcg"]
        else:
            name = compound_name(inj.compound_id)
            dose = inj.dose_mcg or 0
            by_cpd[name]["count"] += 1
            by_cpd[name]["total_mcg"] += dose
            u = by_cpd[name]["users"].setdefault(
                injector_id, {"user_name": injector_name, "count": 0, "total_mcg": 0}
            )
            u["count"] += 1
            u["total_mcg"] += dose

    return WeekSummary(
        total_injections=len(injections),
        by_compound=[
            WeekCompoundSummary(
                compound_name=n,
                count=v["count"],
                total_mcg=v["total_mcg"],
                by_user=[
                    UserDoseSummary(user_id=uid, user_name=ud["user_name"], count=ud["count"], total_mcg=ud["total_mcg"])
                    for uid, ud in v["users"].items()
                ],
            )
            for n, v in sorted(by_cpd.items(), key=lambda x: -x[1]["total_mcg"])
        ],
    )


@router.get("", response_model=DashboardResponse)
def get_dashboard(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    now = datetime.utcnow()

    # ------------------------------------------------------------------
    # 1. Next scheduled dose per active protocol (all household protocols)
    # ------------------------------------------------------------------
    protocols = (
        db.query(Protocol)
        .options(joinedload(Protocol.assignee), joinedload(Protocol.compound))
        .filter(Protocol.active == True)  # noqa: E712
        .all()
    )

    next_doses: list[NextDoseItem] = []
    for protocol in protocols:
        last_inj = (
            db.query(Injection)
            .filter(Injection.compound_id == protocol.compound_id)
            .order_by(Injection.injected_at.desc())
            .first()
        )
        base_dt = last_inj.injected_at if last_inj else now
        next_fire = _next_fire_structured(protocol, base_dt)
        if next_fire is None:
            continue

        compound = protocol.compound
        next_doses.append(
            NextDoseItem(
                protocol_id=protocol.id,
                compound_id=protocol.compound_id,
                compound_name=compound.name if compound else f"Compound #{protocol.compound_id}",
                dose_mcg=protocol.dose_mcg,
                next_fire_at=next_fire,
                schedule_cron=protocol.schedule_cron,
                schedule_type=protocol.schedule_type,
                schedule_times=protocol.schedule_times,
                assignee_user_id=protocol.assignee_user_id,
                assignee_name=protocol.assignee.name if protocol.assignee else "Unknown",
            )
        )

    next_doses.sort(key=lambda x: x.next_fire_at)

    # ------------------------------------------------------------------
    # 2. Last injection per active compound (household-wide)
    # ------------------------------------------------------------------
    compounds = (
        db.query(Compound)
        .filter(Compound.archived == False)  # noqa: E712
        .order_by(Compound.name)
        .all()
    )

    last_by_compound: list[LastByCompoundItem] = []
    for compound in compounds:
        last_inj = (
            db.query(Injection)
            .options(joinedload(Injection.logger), joinedload(Injection.injector))
            .filter(Injection.compound_id == compound.id, Injection.status == "taken")
            .order_by(Injection.injected_at.desc())
            .first()
        )
        if last_inj:
            last_by_compound.append(
                LastByCompoundItem(
                    compound_id=compound.id,
                    compound_name=compound.name,
                    dose_mcg=last_inj.dose_mcg,
                    quantity=last_inj.quantity,
                    injection_site=last_inj.injection_site,
                    injected_at=last_inj.injected_at,
                    injected_by_user_id=last_inj.injected_by_user_id,
                    injector_name=last_inj.injector.name if last_inj.injector else "Unknown",
                    logged_by_user_id=last_inj.logged_by_user_id,
                    logger_name=last_inj.logger.name if last_inj.logger else "Unknown",
                )
            )

    last_by_compound.sort(key=lambda x: x.injected_at, reverse=True)

    # ------------------------------------------------------------------
    # 3. Week summary — household-wide and current-user-only
    # ------------------------------------------------------------------
    week_start = now - timedelta(days=7)
    week_injections = (
        db.query(Injection)
        .options(joinedload(Injection.injector))
        .filter(Injection.injected_at >= week_start, Injection.status == "taken")
        .all()
    )

    week_summary = _build_week_summary(week_injections, db)

    my_week_injections = [
        i for i in week_injections
        if i.injected_by_user_id == current_user.id or i.logged_by_user_id == current_user.id
    ]
    my_week_summary = _build_week_summary(my_week_injections, db)

    # ------------------------------------------------------------------
    # 4. Recent activity — last 5, household-wide
    # ------------------------------------------------------------------
    recent_rows = (
        db.query(Injection)
        .options(joinedload(Injection.logger), joinedload(Injection.injector))
        .order_by(Injection.injected_at.desc())
        .limit(5)
        .all()
    )
    recent = [_injection_to_read(r) for r in recent_rows]

    # ------------------------------------------------------------------
    # 5. 30-day timeline grouped by date + compound/component
    # ------------------------------------------------------------------
    thirty_ago = now - timedelta(days=30)
    timeline_rows = (
        db.query(Injection)
        .options(joinedload(Injection.injector))
        .filter(Injection.injected_at >= thirty_ago, Injection.status == "taken")
        .all()
    )

    compound_cache: dict[int, str] = {}

    def compound_name(cid: int) -> str:
        if cid not in compound_cache:
            c = db.get(Compound, cid)
            compound_cache[cid] = c.name if c else f"Compound #{cid}"
        return compound_cache[cid]

    # key: (date, user_id, compound_id, compound_name)
    tl_map: dict[tuple, dict] = {}
    for inj in timeline_rows:
        date_str = inj.injected_at.strftime("%Y-%m-%d")
        user_id = inj.injected_by_user_id
        user_name = inj.injector.name if inj.injector else "Unknown"
        if inj.component_snapshot:
            for comp in inj.component_snapshot:
                key = (date_str, user_id, inj.compound_id, comp["name"])
                if key not in tl_map:
                    tl_map[key] = {"total_mcg": 0, "count": 0, "user_name": user_name}
                tl_map[key]["total_mcg"] += comp["dose_mcg"]
                tl_map[key]["count"] += 1
        else:
            key = (date_str, user_id, inj.compound_id, compound_name(inj.compound_id))
            if key not in tl_map:
                tl_map[key] = {"total_mcg": 0, "count": 0, "user_name": user_name}
            tl_map[key]["total_mcg"] += inj.dose_mcg or 0
            tl_map[key]["count"] += 1

    timeline = [
        TimelinePoint(
            date=k[0],
            user_id=k[1],
            compound_id=k[2],
            compound_name=k[3],
            user_name=v["user_name"],
            total_mcg=v["total_mcg"],
            count=v["count"],
        )
        for k, v in sorted(tl_map.items())
    ]

    # ------------------------------------------------------------------
    # 6. Projected scheduled doses — active protocols with no logged dose
    #    on a given date for that compound (shows unlogged upcoming/past doses)
    # ------------------------------------------------------------------
    logged_date_compound: set[tuple] = {
        (inj.compound_id, inj.injected_at.strftime("%Y-%m-%d"))
        for inj in timeline_rows
    }

    sched_map: dict[tuple, dict] = {}
    for protocol in protocols:
        compound = protocol.compound
        assignee = protocol.assignee
        if not compound or not assignee or not protocol.active:
            continue

        fire_dates = _fire_dates_in_range(protocol, thirty_ago.date(), now.date())
        for d in fire_dates:
            date_str = d.strftime("%Y-%m-%d")
            if (protocol.compound_id, date_str) in logged_date_compound:
                continue
            key = (date_str, protocol.assignee_user_id, protocol.compound_id)
            if key not in sched_map:
                sched_map[key] = {
                    "compound_name": compound.name,
                    "user_name": assignee.name,
                    "count": 0,
                    "dose_mcg": 0,
                }
            sched_map[key]["count"] += 1
            sched_map[key]["dose_mcg"] += protocol.dose_mcg or 0

    timeline_scheduled = [
        TimelineScheduledPoint(
            date=k[0],
            user_id=k[1],
            compound_id=k[2],
            compound_name=v["compound_name"],
            user_name=v["user_name"],
            count=v["count"],
            dose_mcg=v["dose_mcg"] or None,
        )
        for k, v in sorted(sched_map.items())
    ]

    return DashboardResponse(
        next_doses=next_doses,
        last_by_compound=last_by_compound,
        week_summary=week_summary,
        my_week_summary=my_week_summary,
        recent=recent,
        timeline=timeline,
        timeline_scheduled=timeline_scheduled,
    )
