from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.incident import Incident
from app.models.user import User


def get_dashboard_summary(
    db: Session,
    current_user: User,
) -> dict:

    base_query = select(Incident)

    if current_user.role.name == "REPORTER":
        base_query = base_query.where(
            Incident.reporter_id == current_user.id
        )

    total = db.scalar(
        select(func.count()).select_from(
            base_query.subquery()
        )
    )

    statuses = db.execute(
        select(Incident.status, func.count())
        .where(
            Incident.id.in_(base_query.with_only_columns(Incident.id))
        )
        .group_by(Incident.status)
    ).all()

    priorities = db.execute(
        select(Incident.priority, func.count())
        .where(
            Incident.id.in_(base_query.with_only_columns(Incident.id))
        )
        .group_by(Incident.priority)
    ).all()

    status_counts = dict(statuses)
    priority_counts = dict(priorities)

    return {
        "total_incidents": total,
        "open_incidents": sum(
            status_counts.get(status, 0)
            for status in (
                "NEW", "ACKNOWLEDGED", "IN_PROGRESS",
                "PENDING", "REOPENED"
            )
        ),
        "resolved_incidents": status_counts.get("RESOLVED", 0),
        "closed_incidents": status_counts.get("CLOSED", 0),
        "status_counts": status_counts,
        "priority_counts": {
            priority: priority_counts.get(priority, 0)
            for priority in ("P1", "P2", "P3", "P4")
        },
    }
