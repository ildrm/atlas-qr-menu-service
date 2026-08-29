import { HttpException, HttpStatus } from "@nestjs/common";
import { describe, expect, it } from "vitest";

import { assertPlanLimit } from "./business.js";

function expectHttpException(run: () => void, status: number, code: string) {
  try {
    run();
    throw new Error("Expected an HttpException");
  } catch (error) {
    expect(error).toBeInstanceOf(HttpException);
    const exception = error as HttpException;
    expect(exception.getStatus()).toBe(status);
    expect(exception.getResponse()).toMatchObject({ code });
  }
}

describe("plan limits", () => {
  it.each(["past_due", "canceled", "expired"])(
    "fails closed for a %s subscription",
    (subscriptionStatus) => {
      expectHttpException(
        () =>
          assertPlanLimit(
            { status: subscriptionStatus, planActive: true, value: 10 },
            "max.items",
            0,
          ),
        HttpStatus.PAYMENT_REQUIRED,
        "SUBSCRIPTION_INACTIVE",
      );
    },
  );

  it("fails closed when the subscription or active plan is missing", () => {
    expectHttpException(
      () => assertPlanLimit(undefined, "max.catalogs", 0),
      HttpStatus.PAYMENT_REQUIRED,
      "SUBSCRIPTION_INACTIVE",
    );
    expectHttpException(
      () =>
        assertPlanLimit(
          { status: "active", planActive: false, value: 10 },
          "max.catalogs",
          0,
        ),
      HttpStatus.PAYMENT_REQUIRED,
      "SUBSCRIPTION_INACTIVE",
    );
  });

  it("rejects missing or malformed entitlement configuration", () => {
    for (const value of [null, true, -1, 1.5]) {
      expectHttpException(
        () =>
          assertPlanLimit(
            { status: "active", planActive: true, value },
            "max.qr_codes",
            0,
          ),
        HttpStatus.SERVICE_UNAVAILABLE,
        "ENTITLEMENT_CONFIGURATION_ERROR",
      );
    }
  });

  it("supports explicit unlimited plans and enforces numeric limits", () => {
    expect(() =>
      assertPlanLimit(
        { status: "active", planActive: true, value: "unlimited" },
        "max.items",
        50_000,
      ),
    ).not.toThrow();
    expectHttpException(
      () =>
        assertPlanLimit(
          { status: "grace", planActive: true, value: 2 },
          "max.branches",
          2,
        ),
      HttpStatus.CONFLICT,
      "LIMIT_REACHED",
    );
  });
});
