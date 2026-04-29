from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, field_validator, model_validator

from app.models import InjectionSite

MEDICATION_TYPES = frozenset(
    {"injection", "tablet", "capsule", "liquid", "topical", "sublingual", "inhaled", "other"}
)
DOSE_UNITS = frozenset(
    {"mcg", "mg", "g", "ml", "tablet", "capsule", "drop", "puff", "patch", "other"}
)
ROUTES = frozenset(
    {"oral", "subcutaneous", "intramuscular", "sublingual", "topical",
     "inhaled", "intranasal", "rectal", "other"}
)
SCHEDULE_TYPES = frozenset({"daily", "weekly", "interval"})
INTERVAL_UNITS = frozenset({"days", "hours", "weeks"})


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
    medication_type: str = "injection"
    dose_unit: str = "mcg"
    strength_amount: float | None = None
    strength_unit: str | None = None
    route: str | None = None
    form_notes: str | None = None
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
    quantity_on_hand: float | None = None
    quantity_unit: str | None = None
    low_stock_threshold: float | None = None
    low_stock_days: float | None = None

    @model_validator(mode="after")
    def validate_medication_fields(self) -> "CompoundCreate":
        if self.medication_type not in MEDICATION_TYPES:
            raise ValueError(f"medication_type must be one of {sorted(MEDICATION_TYPES)}")
        if self.dose_unit not in DOSE_UNITS:
            raise ValueError(f"dose_unit must be one of {sorted(DOSE_UNITS)}")
        if self.route is not None and self.route not in ROUTES:
            raise ValueError(f"route must be one of {sorted(ROUTES)}")

        if self.medication_type == "injection":
            if self.route is None:
                self.route = "subcutaneous"
        else:
            # Non-injection: injection-specific fields must not be set
            if self.concentration_mg_per_ml is not None or self.vial_size_mg is not None:
                raise ValueError(
                    "concentration_mg_per_ml and vial_size_mg are only valid for injection medications"
                )
            # Require strength fields for pill/liquid types
            if self.medication_type in ("tablet", "capsule", "liquid"):
                if self.strength_amount is None or not self.strength_unit:
                    raise ValueError(
                        f"strength_amount and strength_unit are required for {self.medication_type} medications"
                    )
        return self


class CompoundUpdate(BaseModel):
    name: str | None = None
    medication_type: str | None = None
    dose_unit: str | None = None
    strength_amount: float | None = None
    strength_unit: str | None = None
    route: str | None = None
    form_notes: str | None = None
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
    quantity_on_hand: float | None = None
    quantity_unit: str | None = None
    low_stock_threshold: float | None = None
    low_stock_days: float | None = None

    @model_validator(mode="after")
    def validate_medication_fields(self) -> "CompoundUpdate":
        if self.medication_type is not None and self.medication_type not in MEDICATION_TYPES:
            raise ValueError(f"medication_type must be one of {sorted(MEDICATION_TYPES)}")
        if self.dose_unit is not None and self.dose_unit not in DOSE_UNITS:
            raise ValueError(f"dose_unit must be one of {sorted(DOSE_UNITS)}")
        if self.route is not None and self.route not in ROUTES:
            raise ValueError(f"route must be one of {sorted(ROUTES)}")
        return self


class CompoundRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_by_user_id: int
    name: str
    medication_type: str
    dose_unit: str
    strength_amount: float | None
    strength_unit: str | None
    route: str | None
    form_notes: str | None
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
    quantity_on_hand: float | None
    quantity_unit: str | None
    low_stock_threshold: float | None
    low_stock_days: float | None


# ---------------------------------------------------------------------------
# Injection
# ---------------------------------------------------------------------------

class InjectionCreate(BaseModel):
    compound_id: int
    dose_mcg: int | None = None
    injection_site: InjectionSite | None = None
    injected_at: datetime
    notes: str | None = None
    dose_mode: str = "total"
    injected_by_user_id: int | None = None  # defaults to logged_by on server
    quantity: float | None = None
    status: str = "taken"
    skip_reason: str | None = None


class InjectionUpdate(BaseModel):
    compound_id: int | None = None
    dose_mcg: int | None = None
    injection_site: InjectionSite | None = None
    injected_at: datetime | None = None
    notes: str | None = None
    quantity: float | None = None
    status: str | None = None
    skip_reason: str | None = None


class SkipRequest(BaseModel):
    skip_reason: str | None = None


class InjectionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    logged_by_user_id: int
    injected_by_user_id: int
    compound_id: int
    dose_mcg: int | None
    injection_site: InjectionSite | None
    injected_at: datetime
    notes: str | None
    created_at: datetime
    draw_volume_ml: float | None
    dose_mode: str
    component_snapshot: list | None
    quantity: float | None
    status: str
    skip_reason: str | None
    logger_name: str
    injector_name: str


# ---------------------------------------------------------------------------
# Protocol
# ---------------------------------------------------------------------------

import re as _re

def _validate_schedule_fields(
    schedule_type: str,
    schedule_times: list[str],
    schedule_days: list[int] | None,
    schedule_interval_value: int | None,
    schedule_interval_unit: str | None,
) -> None:
    if schedule_type not in SCHEDULE_TYPES:
        raise ValueError(f"schedule_type must be one of {sorted(SCHEDULE_TYPES)}")
    if not schedule_times:
        raise ValueError("schedule_times must contain at least one entry")
    for t in schedule_times:
        if not _re.fullmatch(r"\d{2}:\d{2}", t):
            raise ValueError(f"schedule_times entries must be HH:MM format, got {t!r}")
    if schedule_type in ("interval", "weekly"):
        if schedule_interval_value is None or schedule_interval_unit is None:
            raise ValueError(
                "schedule_interval_value and schedule_interval_unit are required for "
                f"{schedule_type} schedules"
            )
        if schedule_interval_unit not in INTERVAL_UNITS:
            raise ValueError(f"schedule_interval_unit must be one of {sorted(INTERVAL_UNITS)}")



class ProtocolCreate(BaseModel):
    compound_id: int
    dose_mcg: int | None = None
    # Structured schedule — required for new protocols
    schedule_type: str = "daily"
    schedule_times: list[str] = ["08:00"]
    schedule_days: list[int] | None = None   # None = all days
    schedule_interval_value: int | None = None
    schedule_interval_unit: str | None = None
    schedule_start_date: date | None = None
    active: bool = True
    notes: str | None = None
    dose_mode: str = "total"
    anchor_component_id: int | None = None
    assignee_user_id: int | None = None  # admin may set; members get self assigned
    take_with_food: bool = False
    dosing_instructions: str | None = None

    @model_validator(mode="after")
    def validate_schedule(self) -> "ProtocolCreate":
        _validate_schedule_fields(
            self.schedule_type, self.schedule_times,
            self.schedule_days, self.schedule_interval_value,
            self.schedule_interval_unit,
        )
        return self


class ProtocolUpdate(BaseModel):
    compound_id: int | None = None
    dose_mcg: int | None = None
    schedule_type: str | None = None
    schedule_times: list[str] | None = None
    schedule_days: list[int] | None = None
    schedule_interval_value: int | None = None
    schedule_interval_unit: str | None = None
    schedule_start_date: date | None = None
    active: bool | None = None
    notes: str | None = None
    dose_mode: str | None = None
    anchor_component_id: int | None = None
    assignee_user_id: int | None = None
    take_with_food: bool | None = None
    dosing_instructions: str | None = None


class ProtocolRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    assignee_user_id: int
    assignee_name: str
    created_by_user_id: int
    compound_id: int
    compound_name: str
    dose_mcg: int | None
    schedule_cron: str
    schedule_type: str
    schedule_times: list[str] | None
    schedule_days: list[int] | None
    schedule_interval_value: int | None
    schedule_interval_unit: str | None
    schedule_start_date: date | None
    active: bool
    notes: str | None
    created_at: datetime
    last_fired_at: datetime | None
    next_fire_at: datetime | None
    dose_mode: str
    anchor_component_id: int | None
    take_with_food: bool
    dosing_instructions: str | None


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
    compound_id: int
    compound_name: str
    dose_mcg: int | None
    next_fire_at: datetime
    schedule_cron: str
    schedule_type: str
    schedule_times: list[str] | None
    assignee_user_id: int
    assignee_name: str


class LastByCompoundItem(BaseModel):
    compound_id: int
    compound_name: str
    dose_mcg: int | None
    quantity: float | None
    injection_site: InjectionSite | None
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
    user_id: int
    user_name: str
    total_mcg: int
    count: int


class DashboardResponse(BaseModel):
    next_doses: list[NextDoseItem]
    last_by_compound: list[LastByCompoundItem]
    week_summary: WeekSummary
    my_week_summary: WeekSummary
    recent: list[InjectionRead]
    timeline: list[TimelinePoint]


# ---------------------------------------------------------------------------
# Prescription
# ---------------------------------------------------------------------------

class PrescriptionCreate(BaseModel):
    prescriber_name: str | None = None
    pharmacy_name: str | None = None
    rx_number: str | None = None
    refills_remaining: int | None = None
    expiry_date: date | None = None
    notes: str | None = None
    is_active: bool = True


class PrescriptionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    compound_id: int
    created_by_user_id: int | None
    prescriber_name: str | None
    pharmacy_name: str | None
    rx_number: str | None
    refills_remaining: int | None
    expiry_date: date | None
    notes: str | None
    is_active: bool
    created_at: datetime


class RefillCreate(BaseModel):
    amount: float
    notes: str | None = None


class RefillLogRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    compound_id: int
    logged_by_user_id: int | None
    amount: float
    quantity_unit: str | None
    notes: str | None
    logged_at: datetime


# ---------------------------------------------------------------------------
# Reference
# ---------------------------------------------------------------------------

class ReferenceResult(BaseModel):
    source: str  # "rxnorm" | "local"
    rxcui: str | None
    name: str
    display_name: str
    medication_type: str
    strength_amount: float | None
    strength_unit: str | None
    dose_unit: str
    route: str
    aliases: list[str]
