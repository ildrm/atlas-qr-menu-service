import { describe, expect, it } from "vitest";

import { createItemSchema, registerSchema } from "./index.js";

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
});
