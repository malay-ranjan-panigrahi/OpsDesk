from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.audit_log import AuditLog
from app.models.comment import Comment
from app.models.incident import Incident
from app.models.user import User
from app.schemas.comment import CommentCreate

from app.services.notification_service import (
    add_notifications,
    get_active_team_member_ids,
)


def create_comment(
    db: Session,
    incident_id: UUID,
    current_user: User,
    data: CommentCreate,
) -> Comment:

    incident = db.scalar(
        select(Incident).where(Incident.id == incident_id)
    )

    if incident is None:
        raise LookupError("Incident not found")

    if (
        current_user.role.name == "REPORTER"
        and incident.reporter_id != current_user.id
    ):
        raise LookupError("Incident not found")

    if (
        data.visibility.value == "INTERNAL"
        and current_user.role.name not in ("ADMIN", "AGENT")
    ):
        raise PermissionError("Cannot create internal comments")

    comment = Comment(
        incident_id=incident_id,
        author_id=current_user.id,
        body=data.body,
        visibility=data.visibility.value,
    )

    try:
        db.add(comment)
        db.flush()

        audit = AuditLog(
            incident_id=incident_id,
            actor_id=current_user.id,
            action="COMMENT_ADDED",
            new_values={
                "visibility": comment.visibility,
                "comment_id": str(comment.id),
            },
        )

        db.add(audit)

        if comment.visibility == "INTERNAL":
            recipient_ids = get_active_team_member_ids(db)
            event_type = "INTERNAL_COMMENT_ADDED"
            message = f"New internal comment on incident: {incident.title}"
        else:
            recipient_ids = [
                incident.reporter_id,
                incident.assignee_id,
            ]
            event_type = "COMMENT_ADDED"
            message = f"New public comment on incident: {incident.title}"

        add_notifications(
            db,
            recipient_ids=recipient_ids,
            actor_id=current_user.id,
            incident_id=incident.id,
            event_type=event_type,
            message=message,
        )

        db.commit()
        db.refresh(comment)

        return comment

    except Exception:
        db.rollback()
        raise


def list_comments(
    db: Session,
    incident_id: UUID,
    current_user: User,
) -> list[Comment]:

    incident = db.scalar(
        select(Incident).where(Incident.id == incident_id)
    )

    if incident is None:
        raise LookupError("Incident not found")

    query = select(Comment).where(
        Comment.incident_id == incident_id
    )

    if current_user.role.name == "REPORTER":
        if incident.reporter_id != current_user.id:
            raise LookupError("Incident not found")

        query = query.where(Comment.visibility == "PUBLIC")

    return list(
        db.scalars(query.order_by(Comment.created_at.asc())).all()
    )
