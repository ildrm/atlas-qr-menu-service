import type { ExecutionContext } from "@nestjs/common";
import { ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { beforeAll, describe, expect, it, vi } from "vitest";

import type { AuthService } from "./auth.js";
import type { AuthenticatedRequest } from "./common.js";

let SessionGuard: typeof import("./session.guard.js").SessionGuard;

beforeAll(async () => {
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("DATABASE_URL", "postgresql://atlas:test@localhost:5432/atlas");
  vi.stubEnv("REDIS_URL", "redis://localhost:6379");
  vi.stubEnv("SESSION_PEPPER", "test-session-pepper-with-32-characters");
  vi.stubEnv("CSRF_SECRET", "test-csrf-secret-with-at-least-32-characters");
  vi.stubEnv("SESSION_COOKIE_NAME", "atlas_session");
  vi.stubEnv("WEB_ORIGIN", "http://localhost:3000");

  ({ SessionGuard } = await import("./session.guard.js"));
});

function createGuard() {
  const authService = {
    authenticate: vi.fn().mockResolvedValue({
      userId: "user-id",
      sessionId: "session-id",
    }),
    validateCsrf: vi.fn().mockResolvedValue(true),
  };
  const guard = new SessionGuard(
    new Reflector(),
    authService as unknown as AuthService,
  );
  return { authService, guard };
}

function createContext(
  method: string,
  headers: Record<string, string | string[] | undefined> = {},
) {
  const request = {
    method,
    headers,
    cookies: {
      atlas_session: "session-token",
      atlas_csrf: "cookie-only-token",
    },
  } as unknown as AuthenticatedRequest;
  class TestController {}
  const handler = () => undefined;
  const context = {
    getHandler: () => handler,
    getClass: () => TestController,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { context, request };
}

describe("SessionGuard request security", () => {
  it("accepts an unsafe request only with the exact origin and explicit CSRF header", async () => {
    const { authService, guard } = createGuard();
    const { context, request } = createContext("POST", {
      origin: "http://localhost:3000",
      "x-csrf-token": "header-token",
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(authService.validateCsrf).toHaveBeenCalledWith(
      "session-id",
      "header-token",
    );
    expect(request.auth).toEqual({
      userId: "user-id",
      sessionId: "session-id",
    });
  });

  it("never falls back to the readable CSRF cookie", async () => {
    const { authService, guard } = createGuard();
    const { context } = createContext("POST", {
      origin: "http://localhost:3000",
    });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(authService.validateCsrf).not.toHaveBeenCalled();
  });

  it("rejects absent or non-exact origins before validating CSRF", async () => {
    const { authService, guard } = createGuard();
    const { context } = createContext("PATCH", {
      origin: "http://localhost:3000/",
      "x-csrf-token": "header-token",
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      "Request origin is not allowed",
    );
    expect(authService.validateCsrf).not.toHaveBeenCalled();
  });

  it("does not require origin or CSRF proof for safe authenticated reads", async () => {
    const { authService, guard } = createGuard();
    const { context } = createContext("GET");

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(authService.validateCsrf).not.toHaveBeenCalled();
  });
});
