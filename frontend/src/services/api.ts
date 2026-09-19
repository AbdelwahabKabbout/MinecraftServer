import axios from "axios";

export interface ApiBase {
  success: boolean;
}

export interface ApiSuccess<T> extends ApiBase {
  success: true;
  data: T;
}

export interface ApiFailure extends ApiBase {
  success: false;
  error: { code: string; message: string; details?: unknown };
}

export type ApiResult<T> = ApiSuccess<T> | ApiFailure;

export class ApiClientError extends Error {
  readonly code: string;
  readonly details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiClientError";
    this.code = code;
    this.details = details;
  }
}

const http = axios.create({
  baseURL: "/api",
  timeout: 15_000,
});

http.interceptors.response.use(
  (response) => response,
  (error) => {
    if (axios.isAxiosError(error)) {
      const payload = error.response?.data as ApiFailure | undefined;
      if (payload && !payload.success) {
        return Promise.reject(
          new ApiClientError(payload.error.code, payload.error.message, payload.error.details),
        );
      }
      if (!error.response) {
        return Promise.reject(new ApiClientError("NETWORK_ERROR", "Cannot reach the manager backend."));
      }
      return Promise.reject(new ApiClientError("HTTP_ERROR", `Request failed (${error.response.status}).`));
    }
    return Promise.reject(error);
  },
);

export async function apiGet<T>(url: string): Promise<T> {
  const { data } = await http.get<ApiResult<T>>(url);
  if (!data.success) throw new ApiClientError(data.error.code, data.error.message, data.error.details);
  return data.data;
}

export async function apiPost<T>(url: string, body?: unknown): Promise<T> {
  const { data } = await http.post<ApiResult<T>>(url, body);
  if (!data.success) throw new ApiClientError(data.error.code, data.error.message, data.error.details);
  return data.data;
}

export async function apiPut<T>(url: string, body?: unknown): Promise<T> {
  const { data } = await http.put<ApiResult<T>>(url, body);
  if (!data.success) throw new ApiClientError(data.error.code, data.error.message, data.error.details);
  return data.data;
}

export async function apiDelete<T>(url: string): Promise<T> {
  const { data } = await http.delete<ApiResult<T>>(url);
  if (!data.success) throw new ApiClientError(data.error.code, data.error.message, data.error.details);
  return data.data;
}