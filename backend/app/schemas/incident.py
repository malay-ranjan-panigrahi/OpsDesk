from datetime import datetime
from enum import StrEnum
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


class IncidentCategory(StrEnum):
    APPLICATION = "APPLICATION"
    DATABASE = "DATABASE"
    NETWORK = "NETWORK"
    INFRASTRUCTURE = "INFRASTRUCTURE"
    SECURITY = "SECURITY"
    OTHER = "OTHER"


class Environment(StrEnum):
    DEVELOPMENT = "DEVELOPMENT"
    TEST = "TEST"
    STAGING = "STAGING"
    PRODUCTION = "PRODUCTION"


class Impact(StrEnum):
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"


class Urgency(StrEnum):
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"


class IncidentCreate(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    description: str = Field(min_length=5)
    category: IncidentCategory
    environment: Environment
    impact: Impact
    urgency: Urgency

    @field_validator("title", "description")
    @classmethod
    def strip_whitespace(cls, value: str) -> str:
        return value.strip()


class IncidentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    incident_number: int
    title: str
    description: str
    category: IncidentCategory
    environment: Environment
    impact: Impact
    urgency: Urgency
    priority: str
    status: str
    reporter_id: UUID
    assignee_id: UUID | None
    created_at: datetime
    updated_at: datetime
    resolved_at: datetime | None
    closed_at: datetime | None
class IncidentStatus(StrEnum):
    NEW = "NEW"
    ACKNOWLEDGED = "ACKNOWLEDGED"
    IN_PROGRESS = "IN_PROGRESS"
    PENDING = "PENDING"
    RESOLVED = "RESOLVED"
    REOPENED = "REOPENED"
    CLOSED = "CLOSED"


class IncidentStatusUpdate(BaseModel):
    status: IncidentStatus
    resolution_summary: str | None = Field(
        default=None,
        max_length=5000,
    )
class IncidentAssignmentUpdate(BaseModel):
    assignee_id: UUID
