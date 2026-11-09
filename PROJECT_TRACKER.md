# OpsDesk — Project Implementation Tracker

> **Project type:** IT Incident Management System  
> **Current stage:** Application MVP completed; DevOps implementation is next.  
> **Documentation purpose:** Record what has been implemented, how the main components work, and what remains to be done.

---

## 1. Project Overview

OpsDesk is an IT Incident Management System designed to help users report technical issues and allow support teams to manage, assign, investigate, and resolve those incidents.

The application provides role-based access, incident tracking, comments, an operational dashboard, audit history, health checks, and in-app notifications. The current implementation is a functional application MVP. Containerization and the CI/CD and Kubernetes delivery workflow are planned as the next phase.

## 2. Technology Stack

| Area | Technology | Purpose |
|---|---|---|
| Backend API | Python, FastAPI | Implements application APIs and business logic |
| ORM / Database access | SQLAlchemy | Maps Python models to database tables and manages database queries |
| Database migrations | Alembic | Creates and updates the database schema through versioned migrations |
| Database | PostgreSQL 16 | Stores users, incidents, comments, audit records, and notifications |
| Authentication | JWT-based authentication | Protects API endpoints and identifies the signed-in user |
| Frontend | React 19, TypeScript 6 | Provides the user interface and client-side application logic |
| Frontend tooling | Vite 8 | Runs the development server and builds frontend assets |
| Icons | Lucide React | Supplies interface icons |
| Local database runtime | Docker | Runs the PostgreSQL database container during development |

**Note:** Docker is currently used to run PostgreSQL locally. The FastAPI backend and React frontend have not yet been documented as containerized services. Full application containerization is part of the upcoming DevOps phase.

## 3. High-Level Architecture

```text
                       User / Support Agent / Admin
                                  |
                                  v
                         React + TypeScript UI
                           (Vite development)
                                  |
                         HTTP requests + JWT
                                  |
                                  v
                            FastAPI Backend
                                  |
             +--------------------+--------------------+
             |                    |                    |
             v                    v                    v
       API Endpoints        Application Services   Authentication
             |                    |                    |
             +--------------------+--------------------+
                                  |
                                  v
                           SQLAlchemy ORM
                                  |
                                  v
                             PostgreSQL

       Database schema changes are managed through Alembic migrations.
```

### Component responsibilities

- **Frontend:** Displays application pages, collects user input, stores the authenticated session token as implemented by the application, calls backend APIs, and renders returned data.
- **FastAPI API layer:** Exposes HTTP endpoints, validates incoming requests, applies authentication/dependency checks, and returns responses.
- **Service layer:** Contains business operations for incidents, comments, and notification creation. This keeps important application behavior out of the route handlers.
- **SQLAlchemy models:** Define the application entities and their database mappings.
- **PostgreSQL:** Persists application records.
- **Alembic:** Tracks database schema changes and applies migrations in a controlled sequence.

## 4. Implemented Features

| Feature | Status | Description |
|---|---|---|
| User registration and login | Implemented | Users can register and log in. The backend issues JWT-based authentication for protected requests. |
| Current-user endpoint | Implemented | The frontend/backend can retrieve the identity and role of the authenticated user. |
| Role-based access | Implemented | Application behavior distinguishes Admin, Agent, and Reporter roles. Access to data and operations is scoped by role where required. |
| Incident creation | Implemented | A Reporter can submit an incident with incident details. The backend persists the incident and records an audit event. |
| Incident listing and details | Implemented | Users can retrieve incident records subject to their access scope. |
| Incident assignment | Implemented | An incident can be assigned to a support team member. The assignment is recorded in the audit history. |
| Incident status updates | Implemented | Support users can change an incident's status. The status change is recorded in the audit history. |
| Comments | Implemented | Users can add comments to incidents. Comments support `PUBLIC` and `INTERNAL` visibility. |
| Dashboard summary | Implemented | The dashboard displays incident summary information retrieved from the backend. |
| User / agent listing | Implemented | The application provides user and agent information for relevant workflows. |
| Audit logs | Implemented | The application records important incident events and displays recent updates. |
| Health check | Implemented | The API exposes a basic health endpoint. |
| Readiness check | Implemented | The readiness endpoint checks whether the service can use its database dependency. |
| In-app notifications | Implemented | The backend creates recipient-specific notifications and the frontend displays them with unread counts and read actions. |
| Dark operations dashboard UI | Implemented | The frontend includes an operations-focused interface with dashboard panels and recent updates. |
| Dockerfile for application services | Planned | Backend and frontend image builds are part of the next phase. |
| Docker Compose application stack | Planned | A single Compose configuration for the application services is not yet implemented. |
| Jenkins CI/CD | Planned | Automated build and delivery pipeline is not yet implemented. |
| Kubernetes deployment | Planned | Deploying the application to Kubernetes is part of the future delivery phase. |
| Helm packaging | Planned | Helm charts are planned after the Kubernetes manifests are established. |
| Argo CD / GitOps | Planned | Git-driven deployment reconciliation is planned. |
| Prometheus and Grafana | Planned | Metrics collection and dashboards are planned for the monitoring phase. |

## 5. User Roles and Access Model

OpsDesk currently uses three application roles:

| Role | Main responsibility |
|---|---|
| `ADMIN` | Oversees the support operation and has administrative access to relevant application functions. |
| `AGENT` | Handles incidents, reviews incident details, updates status, and works with assignments and comments. |
| `REPORTER` | Creates incidents and follows the incidents they are permitted to access. |

The backend uses the authenticated user when applying access rules. For example, Reporter audit-log results are scoped to incidents reported by that user, while Agent and Admin users can access the broader audit-log view according to the implemented permissions.

> The exact permissions for each endpoint should be checked in the corresponding API endpoint and service code before making changes. Do not treat this summary as a substitute for the authorization checks in the backend.

## 6. Main Application Workflows

### 6.1 Authentication workflow

1. A user submits login credentials through the frontend.
2. The frontend sends the login request to the FastAPI backend.
3. The backend verifies the credentials.
4. On successful authentication, the backend returns a JWT.
5. The frontend uses the token in the `Authorization: Bearer <token>` header for protected API requests.
6. The backend identifies the current user from the token and applies the relevant role and ownership checks.

### 6.2 Incident creation workflow

1. A Reporter fills in the incident form.
2. The frontend sends the incident data to the backend.
3. The incident service creates and persists the incident.
4. An `INCIDENT_CREATED` audit record is added.
5. Active Admin and Agent users are selected as notification recipients.
6. The creator is excluded from the recipient list, so the creator does not receive a notification for their own action.
7. The incident and associated records are committed to the database transaction.

### 6.3 Assignment and status-update workflows

**Assignment:** The incident service updates the assignee, creates an `INCIDENT_ASSIGNED` audit record, and creates notifications for the assignee and Reporter. The actor is excluded from receiving their own notification.

**Status update:** The incident service updates the status, creates a `STATUS_CHANGED` audit record, and creates notifications for the Reporter and assignee. Again, the actor is excluded.

### 6.4 Comment workflow

Comments support two visibility values:

- **`PUBLIC`:** Intended for comments visible in the normal incident conversation. Notifications are directed to the Reporter and assignee, excluding the person who added the comment.
- **`INTERNAL`:** Intended for internal support-team discussion. Notifications are directed to active Admin and Agent users, excluding the person who added the comment.

The comment service creates the comment, writes the corresponding audit event, adds the required notifications, and commits the transaction.

### 6.5 Notification workflow

1. An incident-related action occurs in a service layer.
2. The notification service receives the recipient IDs, actor ID, incident ID, event type, and message.
3. Duplicate recipients are removed and `None` recipients are ignored.
4. The actor is excluded from the recipient list.
5. Notification records are added to the same database transaction as the triggering operation.
6. The frontend fetches the signed-in user's notifications and unread count.
7. The frontend refreshes notification data approximately every 30 seconds while the user is signed in.
8. The user can mark one notification as read or mark all notifications as read.
9. Selecting a notification opens the incidents view and selects the related incident.

This is a simple polling-based implementation. WebSockets, Redis, message brokers, and background notification workers are not part of the current MVP.

## 7. Backend API Surface

The API is mounted under `/api/v1`.

### Confirmed health endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/v1/health` | Basic API health response |
| `GET` | `/api/v1/health/ready` | Readiness check that validates database connectivity |

### Confirmed notification endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/v1/notifications` | Returns notifications belonging to the authenticated user; supports pagination parameters such as `limit` and `offset` |
| `GET` | `/api/v1/notifications/unread-count` | Returns the authenticated user's unread notification count |
| `PATCH` | `/api/v1/notifications/{notification_id}/read` | Marks one notification as read, subject to recipient ownership |
| `PATCH` | `/api/v1/notifications/read-all` | Marks the authenticated user's notifications as read |

### Other implemented API areas

The backend also provides API areas for authentication, incidents, dashboard summary, users, and audit logs. The audit-log listing endpoint is:

- `GET /api/v1/audit-logs`

Incident and comment route paths and request schemas should be read from the live OpenAPI documentation (`/docs`) or the corresponding endpoint source files rather than inferred from this overview.

## 8. Database Model Summary

The implemented application includes the following core entities:

| Entity / table | Purpose |
|---|---|
| `roles` | Stores application role definitions. |
| `users` | Stores user accounts and role associations. |
| `incidents` | Stores reported incidents, their ownership/assignment, and operational state. |
| `comments` | Stores incident discussion entries, including visibility. |
| `audit_logs` | Stores a history of important application and incident events. |
| `notifications` | Stores user-specific in-app notifications and read state. |

### Notification table details

The `notifications` table contains:

| Column | Purpose |
|---|---|
| `id` | UUID primary key |
| `recipient_id` | User who receives the notification; references `users.id` with cascade delete |
| `actor_id` | User who performed the action; nullable and set to `NULL` if that user is deleted |
| `incident_id` | Related incident; references `incidents.id` with cascade delete |
| `event_type` | Event identifier, such as `INCIDENT_CREATED`, `INCIDENT_ASSIGNED`, `STATUS_CHANGED`, `COMMENT_ADDED`, or `INTERNAL_COMMENT_ADDED` |
| `message` | Human-readable notification message |
| `is_read` | Read-state flag; defaults to `false` |
| `created_at` | Timestamp when the notification was created |
| `read_at` | Nullable timestamp for when the notification was marked as read |

Indexes are present on `(recipient_id, created_at)` and `(recipient_id, is_read)` to support recipient-scoped notification retrieval and unread-count queries.

### Migration tracking

The notification table was introduced through an Alembic migration:

- **Revision:** `70135408b4ba`
- **Parent revision:** `066f6420adab`
- **Status at the time of documentation:** Applied; Alembic reported `70135408b4ba (head)`.

Use Alembic migrations for future schema changes. Avoid changing an already-applied migration to represent a new schema change; create a new migration instead.

## 9. Audit Events

The application records these incident-related event types:

- `INCIDENT_CREATED`
- `INCIDENT_ASSIGNED`
- `STATUS_CHANGED`
- `COMMENT_ADDED`

The notification workflow also uses `INTERNAL_COMMENT_ADDED` for internal comment notifications. Audit-log responses are designed to expose safe event information rather than comment body contents. Reporter audit-log access is restricted to the Reporter's own incidents.

## 10. Frontend Behavior

The main frontend entry points currently include:

- `frontend/src/App.tsx` — Main application UI, application state, navigation, dashboard panels, and notification interactions.
- `frontend/src/App.css` — Application-specific styles.
- `frontend/src/index.css` — Global styles.
- `frontend/src/lib/notifications.ts` — Notification API client functions and notification response type.

The notification client provides functions to:

- Fetch the latest notifications.
- Fetch the unread count.
- Mark one notification as read.
- Mark all notifications as read.

The frontend loads notification data when a token is available and refreshes it every 30 seconds. The interval is cleared when the effect is cleaned up. The UI displays an unread badge and notification list; marking notifications as read updates the local UI state after the API call succeeds.

The application also includes a health panel that periodically refreshes API/database/incident checks and a Recent Updates panel backed by the audit-log API.

## 11. Repository Areas

The following paths are confirmed from the current implementation notes:

```text
opsdesk/
├── backend/
│   ├── app/
│   │   ├── api/v1/
│   │   │   ├── endpoints/
│   │   │   │   └── notifications.py
│   │   │   └── router.py
│   │   ├── models/
│   │   │   ├── __init__.py
│   │   │   └── notification.py
│   │   └── services/
│   │       ├── incident_service.py
│   │       ├── comment_service.py
│   │       └── notification_service.py
│   └── migrations/
│       ├── env.py
│       └── versions/
│           └── 70135408b4ba_create_notifications_table.py
└── frontend/
    └── src/
        ├── App.tsx
        ├── App.css
        ├── index.css
        └── lib/
            └── notifications.ts
```

This is a focused view of known implementation files, not a complete directory listing. Other application modules, configuration files, schemas, and tests may also exist.

## 12. Local Development Environment

The development environment used during implementation includes:

- Ubuntu 24.04 under WSL.
- Docker Engine 29.5.2.
- Docker Compose 5.1.3.
- PostgreSQL 16 Alpine container named `opsdesk-postgres`.
- PostgreSQL container published on host port `5432`.
- FastAPI backend running in a Python virtual environment.
- React/Vite frontend running on the Vite development server.

Local development URLs used during implementation:

| Component | Local URL |
|---|---|
| Frontend | `http://localhost:5173` |
| Backend | `http://localhost:8000` |
| FastAPI OpenAPI UI | `http://localhost:8000/docs` |
| Backend API prefix | `http://localhost:8000/api/v1` |

These are local development values, not production deployment URLs.

## 13. Basic Verification Already Performed

The following checks were completed during implementation:

- PostgreSQL container was running and reported healthy.
- Alembic migration for the notification table was applied successfully.
- Notification API routes appeared in FastAPI Swagger/OpenAPI documentation.
- Backend notification creation was verified using a test incident.
- The Agent notification list returned the generated incident notification.
- The unread-count endpoint returned the expected count for that test.
- Frontend TypeScript/Vite production build completed successfully after notification UI integration.
- The notification bell/list UI was checked in the browser.
- Recent Updates was checked with both Agent and Reporter access scopes.

These are implementation checks performed during development; they should not be interpreted as a claim of comprehensive automated test coverage.

## 14. Security and GitHub Publishing Notes

Before publishing the repository to GitHub:

1. **Do not commit `.env` files, database passwords, JWT secrets, API keys, private keys, or production credentials.**
2. Keep a `.env.example` file containing placeholder values only, if environment variables are required to configure the application.
3. Make sure `.gitignore` excludes `.env`, virtual environments, Python cache files, frontend dependencies, build output, and local database data where applicable.
4. Do not publish real user data or private operational records.
5. Do not place test-account passwords in this tracker or in the README.
6. Review `git status` and staged files before the first push.

Example pre-push review:

```bash
git status --short
git diff --cached --stat
git diff --cached
```

If a secret has already been committed, deleting it in a later commit is not sufficient. Rotate the secret and follow the repository's secret-removal procedure.

## 15. Remaining Work — DevOps Roadmap

The application MVP is treated as complete for the current scope. The next work is focused on packaging, delivery, orchestration, and observability.

| Phase | Planned work | Goal |
|---|---|---|
| 1. Docker | Create backend and frontend Dockerfiles; build and run the images | Package application services into reproducible images |
| 2. Docker Compose | Define backend, frontend, and PostgreSQL services; configure environment and persistent database storage | Start the local application stack with one Compose command |
| 3. Jenkins CI | Create a Jenkins pipeline for source checkout, build, and validation | Automate application build checks |
| 4. Container Registry | Publish versioned images to a registry | Make built images available to deployment environments |
| 5. Kubernetes | Deploy application services using Deployments, Services, ConfigMaps, and Secrets | Run the application on Kubernetes |
| 6. Helm | Package Kubernetes resources in a Helm chart | Manage configuration and repeatable releases |
| 7. Argo CD | Connect Git-managed deployment configuration to Argo CD | Implement GitOps-based deployment reconciliation |
| 8. Monitoring | Add Prometheus and Grafana | Collect and visualize application and infrastructure metrics |

**Current status:** Docker and Docker Compose versions have been verified on the development machine. Full application Dockerfiles and the Compose stack have not yet been implemented.

## 16. Definition of the Current MVP

The current OpsDesk MVP is considered complete for the agreed application scope when users can:

- Authenticate and use the application according to their role.
- Create and view permitted incidents.
- Assign incidents and update their status.
- Add public and internal comments.
- View dashboard summaries and recent audit updates.
- See API/database health and readiness information.
- Receive in-app notifications for the implemented incident and comment events.
- View unread notification counts and mark notifications as read.

Advanced real-time messaging, WebSockets, Redis-based notification delivery, message queues, and notification worker services are outside the current MVP scope.

---

## 17. Change Log

| Date | Change |
|---|---|
| 2026-11-09 | Documented the completed OpsDesk application MVP, notification implementation, backend/frontend behavior, database changes, verification performed, and upcoming DevOps roadmap. |

---

**Maintenance rule:** Update this tracker whenever a significant feature, API, database migration, deployment component, or operational workflow is added or changed. Keep implementation status factual: use `Implemented`, `In Progress`, `Planned`, or `Not Started` as appropriate.
