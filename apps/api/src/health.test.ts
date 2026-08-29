import { HttpStatus } from "@nestjs/common";
import type { FastifyReply } from "fastify";
import { beforeAll, describe, expect, it, vi } from "vitest";

import type { HealthService } from "./health.js";

let HealthController: typeof import("./health.js").HealthController;
let readinessStatus: typeof import("./health.js").readinessStatus;

beforeAll(async () => {
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("DATABASE_URL", "postgresql://atlas:test@localhost:5432/atlas");
  vi.stubEnv("REDIS_URL", "redis://localhost:6379");
  vi.stubEnv("SESSION_PEPPER", "test-session-pepper-with-32-characters");
  vi.stubEnv("CSRF_SECRET", "test-csrf-secret-with-at-least-32-characters");

  ({ HealthController, readinessStatus } = await import("./health.js"));
});

describe("readiness status", () => {
  it("is ready only when both PostgreSQL and Redis are up", () => {
    expect(readinessStatus({ database: "up", redis: "up" })).toBe("ready");
    expect(readinessStatus({ database: "up", redis: "down" })).toBe(
      "not_ready",
    );
    expect(readinessStatus({ database: "down", redis: "up" })).toBe(
      "not_ready",
    );
    expect(readinessStatus({ database: "down", redis: "down" })).toBe(
      "not_ready",
    );
  });
});

describe("HealthController", () => {
  it("returns HTTP 503 with dependency details when the service is unready", async () => {
    const result = {
      status: "not_ready" as const,
      checks: { database: "up" as const, redis: "down" as const },
    };
    const health = { readiness: vi.fn().mockResolvedValue(result) };
    const response = {
      status: vi.fn(),
    } as unknown as FastifyReply;
    const controller = new HealthController(health as unknown as HealthService);

    await expect(controller.readiness(response)).resolves.toEqual(result);
    expect(response.status).toHaveBeenCalledWith(
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  });

  it("keeps the default success status when every dependency is ready", async () => {
    const result = {
      status: "ready" as const,
      checks: { database: "up" as const, redis: "up" as const },
    };
    const health = { readiness: vi.fn().mockResolvedValue(result) };
    const response = {
      status: vi.fn(),
    } as unknown as FastifyReply;
    const controller = new HealthController(health as unknown as HealthService);

    await expect(controller.readiness(response)).resolves.toEqual(result);
    expect(response.status).not.toHaveBeenCalled();
  });
});
