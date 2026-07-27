/**
 * Typed client-side fetch helpers for the Slipway API.
 * Same-origin (dashboard) and Bearer-token (CLI) friendly.
 */

export class ApiError extends Error {
  status: number
  body: unknown
  constructor(status: number, message: string, body?: unknown) {
    super(message)
    this.status = status
    this.body = body
  }
}

async function request<T>(
  url: string,
  opts: RequestInit = {}
): Promise<T> {
  const res = await fetch(url, {
    ...opts,
    headers: {
      "content-type": "application/json",
      ...(opts.headers || {}),
    },
    credentials: "include",
  })
  const text = await res.text()
  const body = text ? safeJson(text) : null
  if (!res.ok) {
    let message = `Request failed (${res.status})`
    if (body && typeof body === "object" && "error" in body) {
      const err = String((body as { error: unknown }).error)
      if (err) message = err
    }
    throw new ApiError(res.status, message, body)
  }
  return body as T
}

function safeJson(text: string): unknown {
  try { return JSON.parse(text) } catch { return text }
}

export const api = {
  get: <T>(url: string) => request<T>(url),
  post: <T>(url: string, data?: unknown) =>
    request<T>(url, { method: "POST", body: data ? JSON.stringify(data) : undefined }),
  patch: <T>(url: string, data?: unknown) =>
    request<T>(url, { method: "PATCH", body: data ? JSON.stringify(data) : undefined }),
  put: <T>(url: string, data?: unknown) =>
    request<T>(url, { method: "PUT", body: data ? JSON.stringify(data) : undefined }),
  del: <T>(url: string) => request<T>(url, { method: "DELETE" }),
}