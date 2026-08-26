const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

export class ApiClientError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
  }
}

function readCookie(name: string) {
  if (typeof document === "undefined") return undefined;
  return document.cookie
    .split("; ")
    .find((part) => part.startsWith(`${name}=`))
    ?.split("=")
    .slice(1)
    .join("=");
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type"))
    headers.set("Content-Type", "application/json");
  if (init.method && !["GET", "HEAD"].includes(init.method.toUpperCase())) {
    const csrf = readCookie("atlas_csrf");
    if (csrf) headers.set("x-csrf-token", decodeURIComponent(csrf));
  }
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers,
    credentials: "include",
  });
  const body = (await response.json().catch(() => null)) as {
    data?: T;
    error?: {
      code: string;
      message: string;
      fieldErrors?: Record<string, string[]>;
    };
  } | null;
  if (!response.ok || !body?.data) {
    throw new ApiClientError(
      body?.error?.code ?? "NETWORK_ERROR",
      body?.error?.message ?? "The request could not be completed.",
      response.status,
      body?.error?.fieldErrors,
    );
  }
  return body.data;
}

export function publicApiUrl(path: string) {
  return `${API_URL}${path}`;
}
