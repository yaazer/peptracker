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
    ntfy_topic: str | None
    created_at: datetime
    role: str
    force_password_change: bool
    last_login_at: datetime | None


class UserUpdate(BaseModel):
    """Self-service profile update (anyone can call on their own account)."""
    ntfy_topic: str | None = None
    name: str | None = None
    password: str | None = None


class UserAdminUpdate(BaseModel):
    """Admin-only fields for PATCH /api/users/{id}."""
    role: str | None = None
    name: str | None = None
    email: str | None = None
    ntfy_topic: str | None = None


class UserInvite(BaseModel):
    email: EmailStr
    name: str
    temporary_password: str


class HouseholdUser(BaseModel):
    """Lightweight user record for household member lists."""
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    role: str


# ---------------------------------------------------------------------------
# Blend component
# ---------------------------------------------------------------------------

class BlendComponentCreate(BaseModel):
    name: str
    linked_compound_id: int | None = None
    amount_mg: float
    is_anchor: bool = False
    position: int = 0


class BlendComponentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    linked_compound_id: int | None
    amount_mg: float
    is_anchor: bool
    position: int


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
    preset_vial_sizes: list[float] | None = None
    default_syringe_type: str | None = None
    default_syringe_ml: float | None = None
    is_blend: bool = False
    blend_components: list[BlendComponentCreate] | None = None
    aliases: str | None = None
    reference_url: str | None = None
    reference_notes: str | None = None
    molecular_weight: float | None = None
    half_life_hours: float | None = None
    typical_dose_mcg_min: float | None = None
    typical_dose_mcg_max: float | None = None


class CompoundUpdate(BaseModel):
    name: str | None = None
    concentration_mg_per_ml: Decimal | None = None
    vial_size_mg: Decimal | None = None
    bac_water_ml: Decimal | None = None
    notes: str | None = None
    archived: bool | None = None
    preset_vial_sizes: list[float] | None = None
    default_syringe_type: str | None = None
    default_syringe_ml: float | None = None
    is_blend: bool | None = None
    blend_components: list[BlendComponentCreate] | None = None
    aliases: str | None = None
    reference_url: str | None = None
    reference_notes: str | None = None
    molecular_weight: float | None = None
    half_life_hours: float | None = None
    typical_dose_mcg_min: float | None = None
    typical_dose_mcg_max: float | None = None


class CompoundRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_by_user_id: int
    name: str
    concentration_mg_per_ml: Decimal | None
    vial_size_mg: Decimal | None
    bac_water_ml: Decimal | None
    notes: str | None
    created_at: datetime
    archived: bool
    preset_vial_sizes: list[float] | None
    default_syringe_type: str | None
    default_syringe_ml: float | None
    is_blend: bool
    blend_components: list[BlendComponentRead]
    aliases: str | None
    reference_url: str | None
    reference_notes: str | None
    molecular_weight: float | None
    half_life_hours: float | None
    typical_dose_mcg_min: float | None
    typical_dose_mcg_max: float | None


# ---------------------------------------------------------------------------
# Injection
# ---------------------------------------------------------------------------

class InjectionCreate(BaseModel):
    compound_id: int
    dose_mcg: int
    injection_site: InjectionSite
    injected_at: datetime
    notes: str | None = None
    dose_mode: str = "total"
    injected_by_user_id: int | None = None  # defaults to logged_by on server


class InjectionUpdate(BaseModel):
    compound_id: int | None = None
    dose_mcg: int | None = None
    injection_site: InjectionSite | None = None
    injected_at: datetime | None = None
    notes: str | None = None


class InjectionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    logged_by_user_id: int
    injected_by_user_id: int
    compound_id: int
    dose_mcg: int
    injection_site: InjectionSite
    injected_at: datetime
    notes: str | None
    created_at: datetime
    draw_volume_ml: float | None
    dose_mode: str
    component_snapshot: list | None
    logger_name: str
    injector_name: str

    @classmethod
    def from_orm_with_names(cls, inj: object) -> "InjectionRead":
        """Build from ORM object, resolving logger/injector names from loaded relationships."""
        obj = cls.model_validate(inj)
        return obj

    @staticmethod
    def _resolve_names(inj: object) -> dict:
        logger_name = inj.logger.name if inj.logger else "Unknown"
        injector_name = inj.injector.name if inj.injector else "Unknown"
        return {"logger_name": logger_name, "injector_name": injector_name}


# ---------------------------------------------------------------------------
# Protocol
# ---------------------------------------------------------------------------

class ProtocolCreate(BaseModel):
    compound_id: int
    dose_mcg: int
    schedule_cron: str
    active: bool = True
    notes: str | None = None
    dose_mode: str = "total"
    anchor_component_id: int | None = None
    assignee_user_id: int | None = None  # admin may set; members get self assigned


class ProtocolUpdate(BaseModel):
    compound_id: int | None = None
    dose_mcg: int | None = None
    schedule_cron: str | None = None
    active: bool | None = None
    notes: str | None = None
    dose_mode: str | None = None
    anchor_component_id: int | None = None
    assignee_user_id: int | None = None


class ProtocolRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    assignee_user_id: int
    assignee_name: str
    created_by_user_id: int
    compound_id: int
    compound_name: str
    dose_mcg: int
    schedule_cron: str
    active: bool
    notes: str | None
    created_at: datetime
    last_fired_at: datetime | None
    next_fire_at: datetime | None
    dose_mode: str
    anchor_component_id: int | None


# ---------------------------------------------------------------------------
# ReminderLog
# ---------------------------------------------------------------------------

class ReminderLogRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    protocol_id: int
    compound_name: str
    protocol_dose_mcg: int
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
    assignee_user_id: int
    assignee_name: str


class LastByCompoundItem(BaseModel):
    compound_id: int
    compound_name: str
    dose_mcg: int
    injection_site: InjectionSite
    injected_at: datetime
    injected_by_user_id: int
    injector_name: str
    logged_by_user_id: int
    logger_name: str


class UserDoseSummary(BaseModel):
    user_id: int
    user_name: str
    count: int
    total_mcg: int


class WeekCompoundSummary(BaseModel):
    compound_name: str
    count: int
    total_mcg: int
    by_user: list[UserDoseSummary]


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
    my_week_summary: WeekSummary
    recent: list[InjectionRead]
    timeline: list[TimelinePoint]
