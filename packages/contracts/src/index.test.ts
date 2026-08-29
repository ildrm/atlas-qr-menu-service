import { describe, expect, it } from "vitest";

import {
  createItemSchema,
  createQrSchema,
  ingestAnalyticsSchema,
  registerSchema,
} from "./index.js";

describe("shared API contracts", () => {
  it("rejects floating-point minor-unit prices", () => {
    const result = createItemSchema.safeParse({
      catalogId: "b3156ee2-a19d-4cef-8d4e-3a817324d684",
      categoryId: "b3156ee2-a19d-4cef-8d4e-3a817324d685",
      name: "Haircut",
      slug: "haircut",
      priceMinor: 20.5,
      currency: "USD",
    });
    expect(result.success).toBe(false);
  });

  it("requires an adaptive-hash-worthy password length", () => {
    expect(
      registerSchema.safeParse({
        email: "owner@example.com",
        password: "short",
        displayName: "Mina",
      }).success,
    ).toBe(false);
  });

  it("only accepts QR targets implemented by the public resolver", () => {
    const common = {
      name: "Front desk",
      targetId: "b3156ee2-a19d-4cef-8d4e-3a817324d684",
    };

    expect(
      createQrSchema.safeParse({ ...common, targetType: "catalog" }).success,
    ).toBe(true);
    expect(
      createQrSchema.safeParse({ ...common, targetType: "item" }).success,
    ).toBe(false);
    expect(
      createQrSchema.safeParse({
        ...common,
        targetType: "catalog",
        style: { foreground: "#FFFFFF", background: "#FFFFFF" },
      }).success,
    ).toBe(false);
  });

  it("bounds anonymous analytics properties", () => {
    const base = {
      eventName: "catalog_viewed",
      businessId: "b3156ee2-a19d-4cef-8d4e-3a817324d684",
      catalogId: "b3156ee2-a19d-4cef-8d4e-3a817324d685",
    };

    expect(
      ingestAnalyticsSchema.safeParse({
        ...base,
        properties: { action: "view" },
      }).success,
    ).toBe(true);
    expect(
      ingestAnalyticsSchema.safeParse({
        ...base,
        properties: { payload: "x".repeat(501) },
      }).success,
    ).toBe(false);
    expect(
      ingestAnalyticsSchema.safeParse({
        ...base,
        properties: Object.fromEntries(
          Array.from({ length: 31 }, (_, index) => [`key_${index}`, index]),
        ),
      }).success,
    ).toBe(false);
  });

  it("requires entity references appropriate to each analytics event", () => {
    const businessId = "b3156ee2-a19d-4cef-8d4e-3a817324d684";
    const catalogId = "b3156ee2-a19d-4cef-8d4e-3a817324d685";
    const categoryId = "b3156ee2-a19d-4cef-8d4e-3a817324d686";
    const itemId = "b3156ee2-a19d-4cef-8d4e-3a817324d687";

    expect(
      ingestAnalyticsSchema.safeParse({
        eventName: "catalog_viewed",
        businessId,
      }).success,
    ).toBe(false);
    expect(
      ingestAnalyticsSchema.safeParse({
        eventName: "category_viewed",
        businessId,
        catalogId,
      }).success,
    ).toBe(false);
    expect(
      ingestAnalyticsSchema.safeParse({
        eventName: "item_shared",
        businessId,
        catalogId,
      }).success,
    ).toBe(false);
    expect(
      ingestAnalyticsSchema.safeParse({
        eventName: "item_viewed",
        businessId,
        catalogId,
        itemId,
      }).success,
    ).toBe(true);
    expect(
      ingestAnalyticsSchema.safeParse({
        eventName: "category_viewed",
        businessId,
        catalogId,
        categoryId,
      }).success,
    ).toBe(true);
  });
});
