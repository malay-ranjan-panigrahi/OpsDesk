const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

export interface DashboardSummary {
  total_incidents: number;
  open_incidents: number;
  resolved_incidents: number;
  closed_incidents: number;
  status_counts: Record<string, number>;
  priority_counts: Record<string, number>;
}

export async function getDashboardSummary(
  token: string,
): Promise<DashboardSummary> {
  const response = await fetch(
    `${API_BASE_URL}/dashboard/summary`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.detail || "Dashboard request failed");
  }

  return data as DashboardSummary;
}
