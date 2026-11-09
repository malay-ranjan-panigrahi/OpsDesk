import uuid
from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
    Uuid,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Comment(Base):
    __tablename__ = "comments"

    __table_args__ = (
        CheckConstraint(
            "LENGTH(BTRIM(body)) > 0 AND LENGTH(body) <= 5000",
            name="comments_body_chk",
        ),
        CheckConstraint(
            "visibility IN ('PUBLIC', 'INTERNAL')",
            name="comments_visibility_chk",
        ),
        Index(
            "comments_incident_created_idx",
            "incident_id",
            "created_at",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid, primary_key=True, default=uuid.uuid4
    )

    incident_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("incidents.id", ondelete="RESTRICT"),
        nullable=False,
    )

    author_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
    )

    body: Mapped[str] = mapped_column(Text, nullable=False)

    visibility: Mapped[str] = mapped_column(
        String(10),
        nullable=False,
        server_default=text("'PUBLIC'"),
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
