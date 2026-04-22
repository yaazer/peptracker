from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, EmailStr

from app.models import InjectionSite


# ---------------------------------------------------------------------------
# User
# ---------------------------------------------------------------------------

class UserCreate(BaseModel):
    email: EmailStr
    password: str
    name: str


class LoginRequest(BaseModel):
    email: str
    password: str


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    name: str
    created_at: datetime


# ---------------------------------------------------------------------------
# Compound
# ---------------------------------------------------------------------------

class CompoundCreate(BaseModel):
    name: str
    concentration_mg_per_ml: Decimal | None = None
    vial_size_mg: Decimal | None = None
    bac_water_ml: Decimal | None = None
    notes: str | None = None
    archived: bool = False


class CompoundUpdate(BaseModel):
    name: str | None = None
    concentration_mg_per_ml: Decimal | None = None
    vial_size_mg: Decimal | None = None
    bac_water_ml: Decimal | None = None
    notes: str | None = None
    archived: bool | None = None


class CompoundRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    name: str
    concentration_mg_per_ml: Decimal | None
    vial_size_mg: Decimal | None
    bac_water_ml: Decimal | None
    notes: str | None
    created_at: datetime
    archived: bool


# ---------------------------------------------------------------------------
# Injection
# ---------------------------------------------------------------------------

class InjectionCreate(BaseModel):
    compound_id: int
    dose_mcg: int
    injection_site: InjectionSite
    injected_at: datetime
    notes: str | None = None


class InjectionUpdate(BaseModel):
    compound_id: int | None = None
    dose_mcg: int | None = None
    injection_site: InjectionSite | None = None
    injected_at: datetime | None = None
    notes: str | None = None


class InjectionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    compound_id: int
    dose_mcg: int
    injection_site: InjectionSite
    injected_at: datetime
    notes: str | None
    created_at: datetime


# ---------------------------------------------------------------------------
# Protocol
# ---------------------------------------------------------------------------

class ProtocolCreate(BaseModel):
    compound_id: int
    dose_mcg: int
    schedule_cron: str
    active: bool = True
    notes: str | None = None


class ProtocolUpdate(BaseModel):
    compound_id: int | None = None
    dose_mcg: int | None = None
    schedule_cron: str | None = None
    active: bool | None = None
    notes: str | None = None


class ProtocolRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    compound_id: int
    dose_mcg: int
    schedule_cron: str
    active: bool
    notes: str | None
    created_at: datetime


# ---------------------------------------------------------------------------
# ReminderLog
# ---------------------------------------------------------------------------

class ReminderLogRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    protocol_id: int
    fired_at: datetime
    delivered: bool
    error: str | None


# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------

class NextDoseItem(BaseModel):
    protocol_id: int
    compound_name: str
    dose_mcg: int
    next_fire_at: datetime
    schedule_cron: str


class LastByCompoundItem(BaseModel):
    compound_id: int
    compound_name: str
    dose_mcg: int
    injection_site: InjectionSite
    injected_at: datetime


class WeekCompoundSummary(BaseModel):
    compound_name: str
    count: int
    total_mcg: int


class WeekSummary(BaseModel):
    total_injections: int
    by_compound: list[WeekCompoundSummary]


class TimelinePoint(BaseModel):
    date: str
    compound_id: int
    compound_name: str
    total_mcg: int
    count: int


class DashboardResponse(BaseModel):
    next_doses: list[NextDoseItem]
    last_by_compound: list[LastByCompoundItem]
    week_summary: WeekSummary
    recent: list[InjectionRead]
    timeline: list[TimelinePoint]
