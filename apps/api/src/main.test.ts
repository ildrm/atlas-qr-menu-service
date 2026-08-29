import { beforeAll, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  app: {
    enableCors: vi.fn(),
    enableShutdownHooks: vi.fn(),
    listen: vi.fn().mockResolvedValue(undefined),
    register: vi.fn().mockResolvedValue(undefined),
  },
  swaggerDocument: { openapi: "3.0.0" },
  swaggerSetup: vi.fn(),
}));

vi.mock("@fastify/cookie", () => ({ default: Symbol("cookie-plugin") }));
vi.mock("@fastify/helmet", () => ({ default: Symbol("helmet-plugin") }));
vi.mock("@fastify/rate-limit", () => ({
  default: Symbol("rate-limit-plugin"),
}));
vi.mock("@nestjs/core", () => ({
  NestFactory: {
    create: vi.fn().mockResolvedValue(harness.app),
  },
}));
vi.mock("@nestjs/platform-fastify", () => ({
  FastifyAdapter: class FastifyAdapter {},
}));
vi.mock("@nestjs/swagger", () => ({
  DocumentBuilder: class DocumentBuilder {
    setTitle() {
      return this;
    }

    setDescription() {
      return this;
    }

    setVersion() {
      return this;
    }

    addCookieAuth() {
      return this;
    }

    build() {
      return {};
    }
  },
  SwaggerModule: {
    createDocument: vi.fn(() => harness.swaggerDocument),
    setup: harness.swaggerSetup,
  },
}));
vi.mock("./app.module.js", () => ({ AppModule: class AppModule {} }));
vi.mock("./config.js", () => ({
  appConfig: {
    API_PORT: 4000,
    NODE_ENV: "development",
    SESSION_COOKIE_NAME: "atlas_session",
    TRUST_PROXY_HOPS: 0,
    WEB_ORIGIN: "http://localhost:3000",
  },
}));

let requestIdFromHeader: typeof import("./main.js").requestIdFromHeader;

beforeAll(async () => {
  ({ requestIdFromHeader } = await import("./main.js"));
});

describe("API bootstrap security", () => {
  it("mounts non-production Swagger at the documented /docs path", () => {
    expect(harness.swaggerSetup).toHaveBeenCalledWith(
      "docs",
      harness.app,
      harness.swaggerDocument,
    );
  });

  it("allows self-hosted Swagger assets in the non-production CSP", () => {
    const helmetOptions = harness.app.register.mock.calls[1]?.[1] as {
      contentSecurityPolicy?: {
        directives?: { scriptSrc?: string[]; styleSrc?: string[] };
      };
    };
    expect(helmetOptions.contentSecurityPolicy?.directives?.scriptSrc).toEqual(
      expect.arrayContaining(["'self'", "'unsafe-inline'"]),
    );
    expect(helmetOptions.contentSecurityPolicy?.directives?.styleSrc).toEqual(
      expect.arrayContaining(["'self'", "'unsafe-inline'"]),
    );
  });

  it("preserves bounded, log-safe request IDs", () => {
    expect(requestIdFromHeader("trace-123_ABC.foo:bar")).toBe(
      "trace-123_ABC.foo:bar",
    );
  });

  it("replaces unsafe, duplicated, or oversized request IDs", () => {
    const unsafeValues: Array<string | string[]> = [
      "unsafe\r\nforged-log: true",
      ["first", "second"],
      "a".repeat(101),
    ];

    for (const value of unsafeValues) {
      const requestId = requestIdFromHeader(value);
      expect(requestId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
      expect(requestId).not.toBe(value);
    }
  });
});
