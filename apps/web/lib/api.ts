const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";
const CSRF_STORAGE_KEY = "atlasqr:csrf";

let csrfToken: string | undefined;

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

function readCsrfToken() {
  const cookie = readCookie("atlas_csrf");
  if (cookie) {
    try {
      return decodeURIComponent(cookie);
    } catch {
      // Fall through to the login-response token if the cookie is malformed.
    }
  }
  if (csrfToken) return csrfToken;
  if (typeof sessionStorage === "undefined") return undefined;
  return sessionStorage.getItem(CSRF_STORAGE_KEY) ?? undefined;
}

function rememberCsrfToken(value: string | undefined) {
  csrfToken = value;
  if (typeof sessionStorage === "undefined") return;
  if (value) sessionStorage.setItem(CSRF_STORAGE_KEY, value);
  else sessionStorage.removeItem(CSRF_STORAGE_KEY);
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type"))
    headers.set("Content-Type", "application/json");
  if (init.method && !["GET", "HEAD"].includes(init.method.toUpperCase())) {
    const csrf = readCsrfToken();
    if (csrf) headers.set("x-csrf-token", csrf);
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
  if (
    typeof body.data === "object" &&
    body.data !== null &&
    "csrfToken" in body.data &&
    typeof body.data.csrfToken === "string"
  ) {
    rememberCsrfToken(body.data.csrfToken);
  }
  if (path === "/auth/logout") rememberCsrfToken(undefined);
  return body.data;
}

export function publicApiUrl(path: string) {
  return `${API_URL}${path}`;
}
