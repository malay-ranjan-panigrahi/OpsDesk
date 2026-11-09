from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models.role import Role
from app.models.user import User
from app.schemas.auth import RegisterRequest


def register_user(db: Session, data: RegisterRequest) -> User:
    role = db.scalar(
        select(Role).where(Role.name == "REPORTER")
    )

    if role is None:
        raise RuntimeError("REPORTER role is not configured")

    user = User(
        full_name=data.full_name.strip(),
        email=str(data.email).lower(),
        password_hash=hash_password(data.password),
        role_id=role.id,
    )

    try:
        db.add(user)
        db.commit()
        db.refresh(user)
        return user
    except Exception:
        db.rollback()
        raise
