
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

export interface HealthResponse {
  status: string;
  service: string;
}

export interface ReadinessResponse {
  status: string;
  service: string;
  dependencies: {
    database: string;
  };
}

async function healthRequest<T>(endpoint: string): Promise<T> {
  if (!API_BASE_URL) {
    throw new Error("Backend API URL is not configured");
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(`Health check failed: HTTP ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export function getHealth(): Promise<HealthResponse> {
  return healthRequest<HealthResponse>("/health");
}

export function getReadiness(): Promise<ReadinessResponse> {
  return healthRequest<ReadinessResponse>("/health/ready");
}
