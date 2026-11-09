from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.notification import Notification
from app.models.role import Role
from app.models.user import User


def get_active_team_member_ids(db: Session) -> list[UUID]:
    """Return IDs of active ADMIN and AGENT users."""

    return list(
        db.scalars(
            select(User.id)
            .join(User.role)
            .where(
                User.is_active.is_(True),
                Role.name.in_(("ADMIN", "AGENT")),
            )
        ).all()
    )


def add_notifications(
    db: Session,
    *,
    recipient_ids: list[UUID | None],
    actor_id: UUID,
    incident_id: UUID,
    event_type: str,
    message: str,
) -> None:
    """
    Add notification records to the current transaction.
    Does not commit; the calling service controls the transaction.
    """

    unique_recipients = {
        recipient_id
        for recipient_id in recipient_ids
        if recipient_id is not None and recipient_id != actor_id
    }

    if not unique_recipients:
        return

    db.add_all(
        [
            Notification(
                recipient_id=recipient_id,
                actor_id=actor_id,
                incident_id=incident_id,
                event_type=event_type,
                message=message,
            )
            for recipient_id in unique_recipients
        ]
    )
