from fastapi import APIRouter

from app.api.v1.endpoints import (
    audit_logs,
    auth,
    dashboard,
    health,
    incidents,
    notifications,
    users,
)

api_router = APIRouter()

api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(incidents.router)
api_router.include_router(dashboard.router)
api_router.include_router(users.router)
api_router.include_router(audit_logs.router)
api_router.include_router(notifications.router)