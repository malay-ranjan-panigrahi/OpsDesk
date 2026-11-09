from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.api.deps import require_roles
from app.db.session import get_db
from app.models.user import User
from app.models.role import Role
from app.schemas.auth import UserResponse


router = APIRouter(prefix="/users", tags=["Users"])


@router.get(
    "/agents",
    response_model=list[UserResponse],
)
def get_active_agents(
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles("ADMIN", "AGENT")
    ),
):
    statement = (
        select(User)
        .join(User.role)
        .options(joinedload(User.role))
        .where(
            Role.name == "AGENT",
            User.is_active.is_(True),
        )
        .order_by(User.full_name.asc())
    )

    agents = db.scalars(statement).all()

    return [
        UserResponse(
            id=agent.id,
            full_name=agent.full_name,
            email=agent.email,
            role=agent.role.name,
            is_active=agent.is_active,
        )
        for agent in agents
    ]
