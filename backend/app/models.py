import enum
from datetime import datetime

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

    compounds: Mapped[list["Compound"]] = relationship(
        "Compound", back_populates="user", cascade="all, delete-orphan"
    )
    injections: Mapped[list["Injection"]] = relationship(
        "Injection", back_populates="user", cascade="all, delete-orphan"
    )
    protocols: Mapped[list["Protocol"]] = relationship(
        "Protocol", back_populates="user", cascade="all, delete-orphan"
    )


class Compound(Base):
    __tablename__ = "compounds"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
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

    user: Mapped["User"] = relationship("User", back_populates="compounds")
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
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    compound_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("compounds.id", ondelete="CASCADE"), nullable=False
    )
    dose_mcg: Mapped[int] = mapped_column(Integer, nullable=False)
    injection_site: Mapped[InjectionSite] = mapped_column(Enum(InjectionSite), nullable=False)
    injected_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    draw_volume_ml: Mapped[float | None] = mapped_column(sa.Float, nullable=True)
    dose_mode: Mapped[str] = mapped_column(String(20), default="total", nullable=False)
    component_snapshot: Mapped[list | None] = mapped_column(sa.JSON(), nullable=True)

    user: Mapped["User"] = relationship("User", back_populates="injections")
    compound: Mapped["Compound"] = relationship("Compound", back_populates="injections")


class Protocol(Base):
    __tablename__ = "protocols"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    compound_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("compounds.id", ondelete="CASCADE"), nullable=False
    )
    dose_mcg: Mapped[int] = mapped_column(Integer, nullable=False)
    schedule_cron: Mapped[str] = mapped_column(String(100), nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    last_fired_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    dose_mode: Mapped[str] = mapped_column(String(20), default="total", nullable=False)
    anchor_component_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("blend_components.id", ondelete="SET NULL"), nullable=True
    )

    user: Mapped["User"] = relationship("User", back_populates="protocols")
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
