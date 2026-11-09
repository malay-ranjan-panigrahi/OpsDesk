from app.schemas.comment import CommentCreate, CommentResponse
from app.services.comment_service import create_comment, list_comments
from app.schemas.incident import IncidentAssignmentUpdate
from app.services.incident_service import assign_incident

from uuid import UUID
from fastapi import HTTPException
from app.services.incident_service import get_incident
from app.api.deps import require_roles
from app.schemas.incident import IncidentStatusUpdate
from app.services.incident_service import update_incident_status

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from fastapi import Query
from app.services.incident_service import list_incidents

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.incident import IncidentCreate, IncidentResponse
from app.services.incident_service import create_incident

router = APIRouter(prefix="/incidents", tags=["Incidents"])


@router.post(
    "",
    response_model=IncidentResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_new_incident(
    data: IncidentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return create_incident(
        db=db,
        data=data,
        reporter_id=current_user.id,
    )
@router.get("", response_model=list[IncidentResponse])
def get_incidents(
    offset: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return list_incidents(
        db=db,
        current_user=current_user,
        offset=offset,
        limit=limit,
    )
@router.get("/{incident_id}", response_model=IncidentResponse)
def get_incident_by_id(
    incident_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    incident = get_incident(db, incident_id, current_user)

    if incident is None:
        raise HTTPException(
            status_code=404,
            detail="Incident not found",
        )

    return incident
@router.patch(
    "/{incident_id}/status",
    response_model=IncidentResponse,
)
def change_incident_status(
    incident_id: UUID,
    data: IncidentStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles("ADMIN", "AGENT")
    ),
):
    try:
        incident = update_incident_status(
            db=db,
            incident_id=incident_id,
            actor_id=current_user.id,
            new_status=data.status,
            resolution_summary=data.resolution_summary,
        )

        if incident is None:
            raise HTTPException(
                status_code=404,
                detail="Incident not found",
            )

        return incident

    except ValueError as exc:
        raise HTTPException(
            status_code=422,
            detail=str(exc),
        )
@router.post(
    "/{incident_id}/comments",
    response_model=CommentResponse,
    status_code=201,
)
def add_incident_comment(
    incident_id: UUID,
    data: CommentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        return create_comment(
            db=db,
            incident_id=incident_id,
            current_user=current_user,
            data=data,
        )
    except LookupError:
        raise HTTPException(status_code=404, detail="Incident not found")
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc))


@router.get(
    "/{incident_id}/comments",
    response_model=list[CommentResponse],
)
def get_incident_comments(
    incident_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        return list_comments(
            db=db,
            incident_id=incident_id,
            current_user=current_user,
        )
    except LookupError:
        raise HTTPException(status_code=404, detail="Incident not found")
@router.patch(
    "/{incident_id}/assign",
    response_model=IncidentResponse,
)
def assign_incident_to_agent(
    incident_id: UUID,
    data: IncidentAssignmentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles("ADMIN", "AGENT")
    ),
):
    try:
        incident = assign_incident(
            db=db,
            incident_id=incident_id,
            assignee_id=data.assignee_id,
            actor_id=current_user.id,
        )

        if incident is None:
            raise HTTPException(
                status_code=404,
                detail="Incident not found",
            )

        return incident

    except ValueError as exc:
        raise HTTPException(
            status_code=422,
            detail=str(exc),
        )
