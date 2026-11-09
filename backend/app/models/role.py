from sqlalchemy import CheckConstraint, Identity, SmallInteger, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Role(Base):
    __tablename__ = "roles"

    __table_args__ = (
        CheckConstraint(
            "name IN ('ADMIN', 'AGENT', 'REPORTER')",
            name="roles_name_chk",
        ),
    )

    id: Mapped[int] = mapped_column(
        SmallInteger,
        Identity(always=True),
        primary_key=True,
    )

    name: Mapped[str] = mapped_column(
        String(30),
        unique=True,
        nullable=False,
    )

    description: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )

    users: Mapped[list["User"]] = relationship(
        back_populates="role",
    )
