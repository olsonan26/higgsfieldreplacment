"use client";

export class ClientApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ClientApiError";
  }
}

export async function apiRequest<T>(
  url: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    headers: {
      ...(init.body && !(init.body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
      ...(init.headers || {}),
    },
  });
  const payload = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  if (!response.ok)
    throw new ClientApiError(
      response.status,
      String(payload.code || "RequestFailed"),
      String(payload.error || "The request could not be completed"),
      payload.issues || payload.fields,
    );
  return payload as T;
}
