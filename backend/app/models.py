import enum
from datetime import datetime

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

    user: Mapped["User"] = relationship("User", back_populates="compounds")
    injections: Mapped[list["Injection"]] = relationship(
        "Injection", back_populates="compound", cascade="all, delete-orphan"
    )
    protocols: Mapped[list["Protocol"]] = relationship(
        "Protocol", back_populates="compound", cascade="all, delete-orphan"
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
