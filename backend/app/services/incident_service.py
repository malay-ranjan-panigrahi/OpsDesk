
from datetime import datetime, timezone
from sqlalchemy import select
from app.models.audit_log import AuditLog
from app.schemas.incident import IncidentStatus

from uuid import UUID
from sqlalchemy import select
from app.models.user import User

from sqlalchemy.orm import Session

from app.models.incident import Incident
from app.models.audit_log import AuditLog
from app.schemas.incident import IncidentCreate

from app.services.notification_service import (
    add_notifications,
    get_active_team_member_ids,
)


def create_incident(
    db: Session,
    data: IncidentCreate,
    reporter_id: UUID,
) -> Incident:

    incident = Incident(
        title=data.title,
        description=data.description,
        category=data.category.value,
        environment=data.environment.value,
        impact=data.impact.value,
        urgency=data.urgency.value,
        reporter_id=reporter_id,
    )

    try:
        db.add(incident)
        db.flush()

        audit = AuditLog(
            incident_id=incident.id,
            actor_id=reporter_id,
            action="INCIDENT_CREATED",
            new_values={
                "incident_number": incident.incident_number,
                "status": incident.status,
                "priority": incident.priority,
            },
            event_metadata={"source": "api"},
        )

        db.add(audit)
        add_notifications(
            db,
            recipient_ids=get_active_team_member_ids(db),
            actor_id=reporter_id,
            incident_id=incident.id,
            event_type="INCIDENT_CREATED",
            message=f"New incident created: {incident.title}",
        )

        db.commit()
        db.refresh(incident)

        return incident

    except Exception:
        db.rollback()
        raise
def list_incidents(
    db: Session,
    current_user: User,
    offset: int = 0,
    limit: int = 20,
) -> list[Incident]:

    query = select(Incident)

    if current_user.role.name == "REPORTER":
        query = query.where(
            Incident.reporter_id == current_user.id
        )

    query = (
        query
        .order_by(Incident.created_at.desc())
        .offset(offset)
        .limit(limit)
    )

    return list(db.scalars(query).all())
def get_incident(
    db: Session,
    incident_id: UUID,
    current_user: User,
) -> Incident | None:

    query = select(Incident).where(
        Incident.id == incident_id
    )

    if current_user.role.name == "REPORTER":
        query = query.where(
            Incident.reporter_id == current_user.id
        )

    return db.scalar(query)
ALLOWED_TRANSITIONS = {
    "NEW": {"ACKNOWLEDGED"},
    "ACKNOWLEDGED": {"IN_PROGRESS"},
    "IN_PROGRESS": {"PENDING", "RESOLVED"},
    "PENDING": {"IN_PROGRESS"},
    "RESOLVED": {"REOPENED", "CLOSED"},
    "REOPENED": {"IN_PROGRESS"},
    "CLOSED": set(),
}


def update_incident_status(
    db: Session,
    incident_id: UUID,
    actor_id: UUID,
    new_status: IncidentStatus,
    resolution_summary: str | None = None,
) -> Incident | None:

    try:
        incident = db.scalar(
            select(Incident)
            .where(Incident.id == incident_id)
            .with_for_update()
        )

        if incident is None:
            return None

        old_status = incident.status
        target_status = new_status.value

        if target_status not in ALLOWED_TRANSITIONS[old_status]:
            raise ValueError(
                f"Invalid transition: {old_status} -> {target_status}"
            )

        now = datetime.now(timezone.utc)

        if target_status == "ACKNOWLEDGED":
            incident.acknowledged_at = now

        elif target_status == "RESOLVED":
            if not resolution_summary or not resolution_summary.strip():
                raise ValueError(
                    "Resolution summary is required"
                )

            incident.resolution_summary = resolution_summary.strip()
            incident.resolved_at = now

        elif target_status == "CLOSED":
            incident.closed_at = now

        elif target_status == "REOPENED":
            incident.resolution_summary = None
            incident.resolved_at = None
            incident.closed_at = None

        incident.status = target_status

        db.add(
            AuditLog(
                incident_id=incident.id,
                actor_id=actor_id,
                action="STATUS_CHANGED",
                old_values={"status": old_status},
                new_values={"status": target_status},
            )
        )
        add_notifications(
            db,
            recipient_ids=[
                incident.reporter_id,
                incident.assignee_id,
            ],
            actor_id=actor_id,
            incident_id=incident.id,
            event_type="STATUS_CHANGED",
            message=f"Incident status changed to {target_status}: {incident.title}",
        )

        db.commit()
        db.refresh(incident)

        return incident

    except Exception:
        db.rollback()
        raise
def assign_incident(
    db: Session,
    incident_id: UUID,
    assignee_id: UUID,
    actor_id: UUID,
) -> Incident | None:

    from app.models.role import Role
    from app.models.user import User

    try:
        incident = db.scalar(
            select(Incident)
            .where(Incident.id == incident_id)
            .with_for_update()
        )

        if incident is None:
            return None
        if incident.status in {"RESOLVED", "CLOSED"}:
            raise ValueError( "cannot assign a resolved or closed incident")

        assignee = db.scalar(
            select(User)
            .join(User.role)
            .where(
                User.id == assignee_id,
                User.is_active.is_(True),
                Role.name == "AGENT",
            )
        )

        if assignee is None:
            raise ValueError("Assignee must be an active AGENT")

        old_assignee = incident.assignee_id

        incident.assignee_id = assignee.id

        db.add(
            AuditLog(
                incident_id=incident.id,
                actor_id=actor_id,
                action="INCIDENT_ASSIGNED",
                old_values={
                    "assignee_id": (
                        str(old_assignee) if old_assignee else None
                    )
                },
                new_values={
                    "assignee_id": str(assignee.id)
                },
            )
        )
        add_notifications(
            db,
            recipient_ids=[
                assignee.id,
                incident.reporter_id,
            ],
            actor_id=actor_id,
            incident_id=incident.id,
            event_type="INCIDENT_ASSIGNED",
            message=f"Incident assigned: {incident.title}",
        )

        db.commit()
        db.refresh(incident)

        return incident

    except Exception:
        db.rollback()
        raise
