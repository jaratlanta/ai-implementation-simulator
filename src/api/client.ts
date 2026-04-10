/**
 * API Client for backend communication
 */

// In production, API is served from the same origin (Express serves both)
const API_BASE_URL = import.meta.env.VITE_API_URL || '';

interface ApiResponse<T> {
  data?: T;
  error?: string;
}

/**
 * Make an API request
 */
async function request<T>(
  endpoint: string,
  options: RequestInit & { params?: Record<string, string> } = {}
): Promise<ApiResponse<T>> {
  let url = endpoint;
  if (options.params) {
    const searchParams = new URLSearchParams(options.params);
    url += (url.includes('?') ? '&' : '?') + searchParams.toString();
  }

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  try {
    const response = await fetch(`${API_BASE_URL}${url}`, {
      ...options,
      headers,
    });

    const data = await response.json();

    if (!response.ok) {
      return { error: data.error || 'Request failed' };
    }

    return { data };
  } catch (error) {
    console.error('[API] Request error:', error);
    return { error: 'Network error' };
  }
}

export async function get<T>(endpoint: string, params?: Record<string, string>): Promise<ApiResponse<T>> {
  return request<T>(endpoint, { method: 'GET', params });
}

export async function post<T>(endpoint: string, body?: any): Promise<ApiResponse<T>> {
  return request<T>(endpoint, {
    method: 'POST',
    body: body ? JSON.stringify(body) : undefined,
  });
}

export async function patch<T>(endpoint: string, body?: any): Promise<ApiResponse<T>> {
  return request<T>(endpoint, {
    method: 'PATCH',
    body: body ? JSON.stringify(body) : undefined,
  });
}

export default { get, post, patch };
