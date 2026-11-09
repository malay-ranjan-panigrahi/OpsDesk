
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.audit_log import AuditLog
from app.models.incident import Incident
from app.models.user import User

router = APIRouter(prefix="/audit-logs", tags=["Audit Logs"])

# Existing seeded role IDs:
# ADMIN = 1, AGENT = 2, REPORTER = 3


@router.get("")
def list_audit_logs(
    offset: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = (
        db.query(
            AuditLog.id,
            AuditLog.incident_id,
            AuditLog.actor_id,
            AuditLog.action,
            AuditLog.created_at,
            Incident.incident_number,
            Incident.title.label("incident_title"),
            User.full_name.label("actor_name"),
        )
        .join(Incident, AuditLog.incident_id == Incident.id)
        .outerjoin(User, AuditLog.actor_id == User.id)
    )

    # Reporters can only see events for their own incidents.
    if current_user.role_id == 3:
        query = query.filter(
            Incident.reporter_id == current_user.id
        )

    elif current_user.role_id not in (1, 2):
        return []

    records = (
        query
        .order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    return [
        {
            "id": record.id,
            "incident_id": str(record.incident_id),
            "incident_number": record.incident_number,
            "incident_title": record.incident_title,
            "actor_id": (
                str(record.actor_id)
                if record.actor_id
                else None
            ),
            "actor_name": record.actor_name or "System",
            "action": record.action,
            "created_at": record.created_at,
        }
        for record in records
    ]
