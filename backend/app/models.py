import enum
from datetime import date, datetime

import sqlalchemy as sa
from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class InjectionSite(enum.Enum):
    left_abdomen = "left_abdomen"
    right_abdomen = "right_abdomen"
    left_thigh = "left_thigh"
    right_thigh = "right_thigh"
    left_shoulder = "left_shoulder"
    right_shoulder = "right_shoulder"
    other = "other"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    ntfy_topic: Mapped[str | None] = mapped_column(String(500), nullable=True)
    role: Mapped[str] = mapped_column(String(10), nullable=False, default="member")
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    force_password_change: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    # Compounds this user created (audit trail, does not control visibility)
    created_compounds: Mapped[list["Compound"]] = relationship(
        "Compound",
        foreign_keys="Compound.created_by_user_id",
        back_populates="creator",
    )

    # Protocols assigned to this user (they receive reminders)
    assigned_protocols: Mapped[list["Protocol"]] = relationship(
        "Protocol",
        foreign_keys="Protocol.assignee_user_id",
        back_populates="assignee",
        cascade="all, delete-orphan",
    )

    # Protocols created by this user
    created_protocols: Mapped[list["Protocol"]] = relationship(
        "Protocol",
        foreign_keys="Protocol.created_by_user_id",
        back_populates="creator",
    )

    # Injections this user logged (operated the app)
    logged_injections: Mapped[list["Injection"]] = relationship(
        "Injection",
        foreign_keys="Injection.logged_by_user_id",
        back_populates="logger",
    )

    # Injections received by this user (physically injected)
    received_injections: Mapped[list["Injection"]] = relationship(
        "Injection",
        foreign_keys="Injection.injected_by_user_id",
        back_populates="injector",
    )


class Compound(Base):
    __tablename__ = "compounds"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    created_by_user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    # medication_type: injection | tablet | capsule | liquid | topical | sublingual | inhaled | other
    medication_type: Mapped[str] = mapped_column(String(20), nullable=False, default="injection")
    dose_unit: Mapped[str] = mapped_column(String(20), nullable=False, default="mcg")
    strength_amount: Mapped[float | None] = mapped_column(sa.Float, nullable=True)
    strength_unit: Mapped[str | None] = mapped_column(String(20), nullable=True)
    route: Mapped[str | None] = mapped_column(String(20), nullable=True)
    form_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    concentration_mg_per_ml: Mapped[float | None] = mapped_column(Numeric(10, 4), nullable=True)
    vial_size_mg: Mapped[float | None] = mapped_column(Numeric(10, 4), nullable=True)
    bac_water_ml: Mapped[float | None] = mapped_column(Numeric(10, 4), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    archived: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    preset_vial_sizes: Mapped[list | None] = mapped_column(sa.JSON(), nullable=True)
    default_syringe_type: Mapped[str | None] = mapped_column(String(10), nullable=True)
    default_syringe_ml: Mapped[float | None] = mapped_column(Numeric(5, 2), nullable=True)
    is_blend: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    aliases: Mapped[str | None] = mapped_column(String(500), nullable=True)
    reference_url: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    reference_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    molecular_weight: Mapped[float | None] = mapped_column(sa.Float, nullable=True)
    half_life_hours: Mapped[float | None] = mapped_column(sa.Float, nullable=True)
    typical_dose_mcg_min: Mapped[float | None] = mapped_column(sa.Float, nullable=True)
    typical_dose_mcg_max: Mapped[float | None] = mapped_column(sa.Float, nullable=True)
    # Inventory tracking
    quantity_on_hand: Mapped[float | None] = mapped_column(sa.Float, nullable=True)
    quantity_unit: Mapped[str | None] = mapped_column(String(30), nullable=True)
    low_stock_threshold: Mapped[float | None] = mapped_column(sa.Float, nullable=True)
    low_stock_days: Mapped[float | None] = mapped_column(sa.Float, nullable=True)
    last_low_stock_alert_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    creator: Mapped["User"] = relationship(
        "User", foreign_keys=[created_by_user_id], back_populates="created_compounds"
    )
    injections: Mapped[list["Injection"]] = relationship(
        "Injection", back_populates="compound", cascade="all, delete-orphan"
    )
    protocols: Mapped[list["Protocol"]] = relationship(
        "Protocol", back_populates="compound", cascade="all, delete-orphan"
    )
    blend_components: Mapped[list["BlendComponent"]] = relationship(
        "BlendComponent",
        foreign_keys="BlendComponent.compound_id",
        back_populates="compound",
        cascade="all, delete-orphan",
        order_by="BlendComponent.position",
    )
    prescriptions: Mapped[list["Prescription"]] = relationship(
        "Prescription", back_populates="compound", cascade="all, delete-orphan"
    )
    refill_logs: Mapped[list["RefillLog"]] = relationship(
        "RefillLog", back_populates="compound", cascade="all, delete-orphan"
    )


class BlendComponent(Base):
    __tablename__ = "blend_components"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    compound_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("compounds.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    linked_compound_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("compounds.id", ondelete="SET NULL"), nullable=True
    )
    amount_mg: Mapped[float] = mapped_column(Numeric(10, 4), nullable=False)
    is_anchor: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    position: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    compound: Mapped["Compound"] = relationship(
        "Compound", foreign_keys=[compound_id], back_populates="blend_components"
    )


class Injection(Base):
    __tablename__ = "injections"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    logged_by_user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=False
    )
    injected_by_user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=False
    )
    compound_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("compounds.id", ondelete="CASCADE"), nullable=False
    )
    dose_mcg: Mapped[int | None] = mapped_column(Integer, nullable=True)
    injection_site: Mapped[InjectionSite | None] = mapped_column(Enum(InjectionSite), nullable=True)
    injected_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    draw_volume_ml: Mapped[float | None] = mapped_column(sa.Float, nullable=True)
    dose_mode: Mapped[str] = mapped_column(String(20), default="total", nullable=False)
    component_snapshot: Mapped[list | None] = mapped_column(sa.JSON(), nullable=True)
    quantity: Mapped[float | None] = mapped_column(sa.Float, nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="taken")
    skip_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    logger: Mapped["User"] = relationship(
        "User", foreign_keys=[logged_by_user_id], back_populates="logged_injections"
    )
    injector: Mapped["User"] = relationship(
        "User", foreign_keys=[injected_by_user_id], back_populates="received_injections"
    )
    compound: Mapped["Compound"] = relationship("Compound", back_populates="injections")


class Protocol(Base):
    __tablename__ = "protocols"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    assignee_user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    created_by_user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=False
    )
    compound_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("compounds.id", ondelete="CASCADE"), nullable=False
    )
    dose_mcg: Mapped[int | None] = mapped_column(Integer, nullable=True)
    schedule_cron: Mapped[str] = mapped_column(String(100), nullable=False)
    # Structured schedule (replaces schedule_cron for new protocols)
    schedule_type: Mapped[str] = mapped_column(String(20), nullable=False, default="daily")
    schedule_times: Mapped[list | None] = mapped_column(sa.JSON(), nullable=True)
    schedule_days: Mapped[list | None] = mapped_column(sa.JSON(), nullable=True)
    schedule_interval_value: Mapped[int | None] = mapped_column(Integer, nullable=True)
    schedule_interval_unit: Mapped[str | None] = mapped_column(String(20), nullable=True)
    schedule_start_date: Mapped[date | None] = mapped_column(sa.Date, nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    last_fired_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    dose_mode: Mapped[str] = mapped_column(String(20), default="total", nullable=False)
    anchor_component_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("blend_components.id", ondelete="SET NULL"), nullable=True
    )
    take_with_food: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    dosing_instructions: Mapped[str | None] = mapped_column(Text, nullable=True)

    assignee: Mapped["User"] = relationship(
        "User", foreign_keys=[assignee_user_id], back_populates="assigned_protocols"
    )
    creator: Mapped["User"] = relationship(
        "User", foreign_keys=[created_by_user_id], back_populates="created_protocols"
    )
    compound: Mapped["Compound"] = relationship("Compound", back_populates="protocols")
    reminder_logs: Mapped[list["ReminderLog"]] = relationship(
        "ReminderLog", back_populates="protocol", cascade="all, delete-orphan"
    )


class ReminderLog(Base):
    __tablename__ = "reminder_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    protocol_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("protocols.id", ondelete="CASCADE"), nullable=False
    )
    fired_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    delivered: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)

    protocol: Mapped["Protocol"] = relationship("Protocol", back_populates="reminder_logs")


class Prescription(Base):
    __tablename__ = "prescriptions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    compound_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("compounds.id", ondelete="CASCADE"), nullable=False
    )
    created_by_user_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    prescriber_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    pharmacy_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    rx_number: Mapped[str | None] = mapped_column(String(100), nullable=True)
    refills_remaining: Mapped[int | None] = mapped_column(Integer, nullable=True)
    expiry_date: Mapped[date | None] = mapped_column(sa.Date, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    last_expiry_alert_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    compound: Mapped["Compound"] = relationship("Compound", back_populates="prescriptions")
    creator: Mapped["User | None"] = relationship("User", foreign_keys=[created_by_user_id])


class RefillLog(Base):
    __tablename__ = "refill_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    compound_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("compounds.id", ondelete="CASCADE"), nullable=False
    )
    logged_by_user_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    amount: Mapped[float] = mapped_column(sa.Float, nullable=False)
    quantity_unit: Mapped[str | None] = mapped_column(String(30), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    logged_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    compound: Mapped["Compound"] = relationship("Compound", back_populates="refill_logs")
    logger: Mapped["User | None"] = relationship("User", foreign_keys=[logged_by_user_id])
