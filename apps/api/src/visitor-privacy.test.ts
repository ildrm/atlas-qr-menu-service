import { describe, expect, it } from "vitest";

import {
  classifyDevice,
  hashPublicVisitor,
  normalizePublicLocale,
} from "./visitor-privacy.js";

describe("public visitor privacy", () => {
  const secret = "test-only-secret-with-at-least-32-characters";
  const businessId = "b3156ee2-a19d-4cef-8d4e-3a817324d684";

  it("separates visitor hashes by domain and tenant", () => {
    const analyticsHash = hashPublicVisitor(
      secret,
      "analytics",
      businessId,
      "visitor",
    );

    expect(analyticsHash).toMatch(/^[a-f0-9]{64}$/);
    expect(analyticsHash).toBe(
      hashPublicVisitor(secret, "analytics", businessId, "visitor"),
    );
    expect(analyticsHash).not.toBe(
      hashPublicVisitor(secret, "qr", businessId, "visitor"),
    );
    expect(analyticsHash).not.toBe(
      hashPublicVisitor(
        secret,
        "analytics",
        "b3156ee2-a19d-4cef-8d4e-3a817324d685",
        "visitor",
      ),
    );
  });

  it("reduces user agents to a bounded device class", () => {
    expect(classifyDevice(undefined)).toBe("unknown");
    expect(classifyDevice("Mozilla/5.0 (iPhone) Mobile")).toBe("mobile");
    expect(classifyDevice("Mozilla/5.0 (iPad) Mobile")).toBe("tablet");
    expect(classifyDevice("ExampleCrawler/1.0")).toBe("bot");
    expect(classifyDevice("Mozilla/5.0 (Windows NT 10.0)")).toBe("desktop");
  });

  it("canonicalizes a bounded locale without retaining the full header", () => {
    expect(normalizePublicLocale(undefined, "fa-IR,fa;q=0.9")).toBe("fa-IR");
    expect(normalizePublicLocale("en-US", "fa-IR,fa;q=0.9")).toBe("en-US");
    expect(normalizePublicLocale(undefined, "not a locale")).toBeUndefined();
  });
});
