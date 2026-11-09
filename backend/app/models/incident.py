import uuid
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    Computed,
    DateTime,
    ForeignKey,
    Identity,
    Index,
    String,
    Text,
    Uuid,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Incident(Base):
    __tablename__ = "incidents"

    __table_args__ = (
        CheckConstraint(
            "LENGTH(BTRIM(title)) > 0",
            name="incidents_title_chk",
        ),
        CheckConstraint(
            "LENGTH(BTRIM(description)) > 0",
            name="incidents_description_chk",
        ),
        CheckConstraint(
            "category IN ('APPLICATION', 'DATABASE', 'NETWORK', "
            "'INFRASTRUCTURE', 'SECURITY', 'OTHER')",
            name="incidents_category_chk",
        ),
        CheckConstraint(
            "environment IN ('DEVELOPMENT', 'TEST', 'STAGING', 'PRODUCTION')",
            name="incidents_environment_chk",
        ),
        CheckConstraint(
            "impact IN ('HIGH', 'MEDIUM', 'LOW')",
            name="incidents_impact_chk",
        ),
        CheckConstraint(
            "urgency IN ('HIGH', 'MEDIUM', 'LOW')",
            name="incidents_urgency_chk",
        ),
        CheckConstraint(
            "status IN ('NEW', 'ACKNOWLEDGED', 'IN_PROGRESS', "
            "'PENDING', 'RESOLVED', 'REOPENED', 'CLOSED')",
            name="incidents_status_chk",
        ),
        CheckConstraint(
            """
            (
                status IN ('RESOLVED', 'CLOSED')
                AND resolved_at IS NOT NULL
                AND resolution_summary IS NOT NULL
                AND LENGTH(BTRIM(resolution_summary)) > 0
            )
            OR
            (
                status NOT IN ('RESOLVED', 'CLOSED')
                AND resolved_at IS NULL
                AND resolution_summary IS NULL
            )
            """,
            name="incidents_resolution_chk",
        ),
        CheckConstraint(
            """
            (status = 'CLOSED' AND closed_at IS NOT NULL)
            OR
            (status <> 'CLOSED' AND closed_at IS NULL)
            """,
            name="incidents_closed_at_chk",
        ),
        Index(
            "incidents_status_priority_created_idx",
            "status",
            "priority",
            "created_at",
        ),
        Index(
            "incidents_assignee_status_updated_idx",
            "assignee_id",
            "status",
            "updated_at",
        ),
        Index(
            "incidents_reporter_created_idx",
            "reporter_id",
            "created_at",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        primary_key=True,
        default=uuid.uuid4,
    )

    incident_number: Mapped[int] = mapped_column(
        BigInteger,
        Identity(always=True),
        unique=True,
        nullable=False,
    )

    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)

    category: Mapped[str] = mapped_column(String(32), nullable=False)
    environment: Mapped[str] = mapped_column(String(20), nullable=False)

    impact: Mapped[str] = mapped_column(String(10), nullable=False)
    urgency: Mapped[str] = mapped_column(String(10), nullable=False)

    priority: Mapped[str] = mapped_column(
        String(2),
        Computed(
            """
            CASE
                WHEN impact = 'HIGH' AND urgency = 'HIGH' THEN 'P1'
                WHEN impact = 'HIGH' AND urgency = 'MEDIUM' THEN 'P2'
                WHEN impact = 'HIGH' AND urgency = 'LOW' THEN 'P3'
                WHEN impact = 'MEDIUM' AND urgency = 'HIGH' THEN 'P2'
                WHEN impact = 'MEDIUM' AND urgency IN ('MEDIUM', 'LOW')
                    THEN 'P3'
                WHEN impact = 'LOW' AND urgency = 'HIGH' THEN 'P3'
                ELSE 'P4'
            END
            """,
            persisted=True,
        ),
    )

    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        server_default=text("'NEW'"),
    )

    reporter_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
    )

    assignee_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid,
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=True,
    )

    acknowledged_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
    )

    resolution_summary: Mapped[str | None] = mapped_column(Text)
    resolved_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
    )
    closed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    reporter = relationship("User", foreign_keys=[reporter_id])
    assignee = relationship("User", foreign_keys=[assignee_id])
