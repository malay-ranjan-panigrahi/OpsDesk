const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

export interface Incident {
  id: string;
  incident_number: number;
  title: string;
  description: string;
  category: string;
  environment: string;
  impact: string;
  urgency: string;
  priority: "P1" | "P2" | "P3" | "P4";
  status: string;
  reporter_id: string;
  assignee_id: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  closed_at: string | null;
}

export async function getIncidents(
  token: string,
): Promise<Incident[]> {
  const response = await fetch(`${API_BASE_URL}/incidents`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.detail || "Failed to fetch incidents");
  }

  return data as Incident[];
}
export interface CreateIncidentRequest {
  title: string;
  description: string;
  category: string;
  environment: string;
  impact: string;
  urgency: string;
}

export async function createIncident(
  token: string,
  payload: CreateIncidentRequest,
): Promise<Incident> {
  const response = await fetch(`${API_BASE_URL}/incidents`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.detail || "Incident creation failed");
  }

  return data as Incident;
}
export async function getIncidentById(
  token: string,
  incidentId: string,
): Promise<Incident> {
  const response = await fetch(
    `${API_BASE_URL}/incidents/${incidentId}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.detail || "Failed to fetch incident details");
  }

  return data as Incident;
}
export interface Comment {
  id: string;
  incident_id: string;
  author_id: string;
  body: string;
  visibility: "PUBLIC" | "INTERNAL";
  created_at: string;
}

export interface CreateCommentRequest {
  body: string;
  visibility: "PUBLIC" | "INTERNAL";
}

export async function getIncidentComments(
  token: string,
  incidentId: string,
): Promise<Comment[]> {
  const response = await fetch(
    `${API_BASE_URL}/incidents/${incidentId}/comments`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.detail || "Failed to fetch comments");
  }

  return data as Comment[];
}

export async function createIncidentComment(
  token: string,
  incidentId: string,
  payload: CreateCommentRequest,
): Promise<Comment> {
  const response = await fetch(
    `${API_BASE_URL}/incidents/${incidentId}/comments`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.detail || "Comment creation failed");
  }

  return data as Comment;
}
export interface Agent {
  id: string;
  full_name: string;
  email: string;
  role: string;
  is_active: boolean;
}

export async function getAgents(
  token: string,
): Promise<Agent[]> {
  const response = await fetch(`${API_BASE_URL}/users/agents`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.detail || "Failed to fetch agents");
  }

  return data as Agent[];
}

export async function assignIncident(
  token: string,
  incidentId: string,
  assigneeId: string,
): Promise<Incident> {
  const response = await fetch(
    `${API_BASE_URL}/incidents/${incidentId}/assign`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        assignee_id: assigneeId,
      }),
    },
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.detail || "Incident assignment failed");
  }

  return data as Incident;
}
