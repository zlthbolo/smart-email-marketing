import type { ApiFailure, ApiMeta, ApiSuccess } from '../types';

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '/api/v1').replace(/\/$/, '');

export const apiUrl = (path: string) => `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;

export class ApiError extends Error {
  code: string;
  status: number;
  details?: unknown;

  constructor(message: string, code = 'REQUEST_FAILED', status = 0, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  rawBody?: BodyInit;
}

export interface ApiResult<T> {
  data: T;
  meta?: ApiMeta;
}

function safelyParse(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<ApiResult<T>> {
  const headers = new Headers(options.headers);
  let body = options.rawBody;
  if (options.body !== undefined) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(options.body);
  }
  headers.set('Accept', 'application/json');

  let response: Response;
  try {
    response = await fetch(apiUrl(path), {
      ...options,
      headers,
      body,
      credentials: 'include',
    });
  } catch (error) {
    throw new ApiError(
      error instanceof Error ? `تعذّر الوصول إلى الخادم: ${error.message}` : 'تعذّر الوصول إلى الخادم',
      'NETWORK_ERROR',
    );
  }

  const payload = safelyParse(await response.text()) as ApiSuccess<T> | ApiFailure | T | null;
  if (!response.ok) {
    const failure = payload as ApiFailure | null;
    throw new ApiError(
      failure && typeof failure === 'object' && 'error' in failure
        ? failure.error.message
        : `فشل الطلب (${response.status})`,
      failure && typeof failure === 'object' && 'error' in failure ? failure.error.code : 'HTTP_ERROR',
      response.status,
      failure && typeof failure === 'object' && 'error' in failure ? failure.error.details : payload,
    );
  }

  if (payload && typeof payload === 'object' && 'ok' in payload) {
    if (payload.ok === false) {
      throw new ApiError(payload.error.message, payload.error.code, response.status, payload.error.details);
    }
    return { data: payload.data, meta: payload.meta };
  }

  // Backward-compatible parsing while the backend is migrated to the v1 envelope.
  return { data: payload as T };
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => apiRequest<T>(path, { signal }),
  post: <T>(path: string, body?: unknown) => apiRequest<T>(path, { method: 'POST', body }),
  put: <T>(path: string, body?: unknown) => apiRequest<T>(path, { method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown) => apiRequest<T>(path, { method: 'PATCH', body }),
  delete: <T>(path: string) => apiRequest<T>(path, { method: 'DELETE' }),
};

export function queryString(params: Record<string, string | number | boolean | null | undefined>) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  });
  const encoded = search.toString();
  return encoded ? `?${encoded}` : '';
}

export function getApiErrorMessage(error: unknown) {
  return error instanceof ApiError || error instanceof Error ? error.message : 'حدث خطأ غير متوقع';
}
