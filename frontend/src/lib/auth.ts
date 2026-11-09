const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

export interface User {
  id: string;
  full_name: string;
  email: string;
  role: "ADMIN" | "AGENT" | "REPORTER";
  is_active: boolean;
}

export interface LoginResponse {
  access_token: string;
  token_type: "bearer";
}

export interface RegisterRequest {
  full_name: string;
  email: string;
  password: string;
}

async function handleResponse<T>(response: Response): Promise<T> {
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.detail || `HTTP ${response.status}`);
  }

  return data as T;
}

export async function login(
  email: string,
  password: string,
): Promise<LoginResponse> {
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  return handleResponse<LoginResponse>(response);
}

export async function register(
  payload: RegisterRequest,
): Promise<User> {
  const response = await fetch(`${API_BASE_URL}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  return handleResponse<User>(response);
}

export async function getCurrentUser(token: string): Promise<User> {
  const response = await fetch(`${API_BASE_URL}/auth/me`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return handleResponse<User>(response);
}
