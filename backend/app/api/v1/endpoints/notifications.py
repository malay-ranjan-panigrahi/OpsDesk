import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.incident import Incident
from app.models.notification import Notification
from app.models.user import User

router = APIRouter(prefix="/notifications", tags=["Notifications"])


@router.get("")
def list_notifications(
    offset: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    records = (
        db.query(
            Notification,
            Incident.incident_number,
            Incident.title.label("incident_title"),
            User.full_name.label("actor_name"),
        )
        .join(Incident, Notification.incident_id == Incident.id)
        .outerjoin(User, Notification.actor_id == User.id)
        .filter(Notification.recipient_id == current_user.id)
        .order_by(
            Notification.created_at.desc(),
            Notification.id.desc(),
        )
        .offset(offset)
        .limit(limit)
        .all()
    )

    return [
        {
            "id": str(notification.id),
            "incident_id": str(notification.incident_id),
            "incident_number": incident_number,
            "incident_title": incident_title,
            "actor_id": str(notification.actor_id) if notification.actor_id else None,
            "actor_name": actor_name or "System",
            "event_type": notification.event_type,
            "message": notification.message,
            "is_read": notification.is_read,
            "created_at": notification.created_at,
            "read_at": notification.read_at,
        }
        for notification, incident_number, incident_title, actor_name in records
    ]


@router.get("/unread-count")
def get_unread_count(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    count = (
        db.query(func.count(Notification.id))
        .filter(
            Notification.recipient_id == current_user.id,
            Notification.is_read.is_(False),
        )
        .scalar()
    )

    return {"unread_count": count or 0}


@router.patch("/{notification_id}/read")
def mark_notification_read(
    notification_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    notification = (
        db.query(Notification)
        .filter(
            Notification.id == notification_id,
            Notification.recipient_id == current_user.id,
        )
        .first()
    )

    if notification is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification not found",
        )

    if not notification.is_read:
        notification.is_read = True
        notification.read_at = datetime.now(timezone.utc)
        db.commit()

    return {
        "message": "Notification marked as read",
        "notification_id": str(notification.id),
        "is_read": notification.is_read,
    }


@router.patch("/read-all")
def mark_all_notifications_read(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    updated_count = (
        db.query(Notification)
        .filter(
            Notification.recipient_id == current_user.id,
            Notification.is_read.is_(False),
        )
        .update(
            {
                Notification.is_read: True,
                Notification.read_at: func.now(),
            },
            synchronize_session=False,
        )
    )

    db.commit()

    return {
        "message": "All notifications marked as read",
        "updated_count": updated_count,
    }
