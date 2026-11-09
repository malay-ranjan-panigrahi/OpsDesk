const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

export interface NotificationItem {
  id: string;
  incident_id: string;
  incident_number: number;
  incident_title: string;
  actor_id: string | null;
  actor_name: string;
  event_type: string;
  message: string;
  is_read: boolean;
  created_at: string;
  read_at: string | null;
}

async function notificationRequest<T>(
  token: string,
  endpoint: string,
  method = "GET",
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}/notifications${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.detail || "Notification request failed");
  }

  return data as T;
}

export function getNotifications(
  token: string,
): Promise<NotificationItem[]> {
  return notificationRequest<NotificationItem[]>(token, "?limit=20");
}

export function getUnreadCount(token: string): Promise<{ unread_count: number }> {
  return notificationRequest(token, "/unread-count");
}

export function markNotificationRead(
  token: string,
  notificationId: string,
): Promise<unknown> {
  return notificationRequest(token, `/${notificationId}/read`, "PATCH");
}

export function markAllNotificationsRead(token: string): Promise<unknown> {
  return notificationRequest(token, "/read-all", "PATCH");
}
