
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

export interface AuditLog {
  id: number;
  incident_id: string;
  incident_number: number;
  incident_title: string;
  actor_id: string | null;
  actor_name: string;
  action: string;
  created_at: string;
}

export async function getAuditLogs(
  token: string,
  offset = 0,
  limit = 10,
): Promise<AuditLog[]> {
  const response = await fetch(
    `${API_BASE_URL}/audit-logs?offset=${offset}&limit=${limit}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.detail || "Audit logs request failed");
  }

  return data as AuditLog[];
}
