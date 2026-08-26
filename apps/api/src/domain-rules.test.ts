import { describe, expect, it } from "vitest";

import {
  can,
  isSafeExternalQrTarget,
  isScheduleActive,
  isWithinEntitlement,
  translationFallback,
  validateSelectionCount,
} from "./domain-rules.js";

describe("authorization and entitlement rules", () => {
  it("checks permissions, never role labels", () => {
    expect(can(["catalog.read", "item.update"], "item.update")).toBe(true);
    expect(can(["catalog.read"], "billing.manage")).toBe(false);
  });

  it("enforces numeric plan limits at the boundary", () => {
    expect(isWithinEntitlement(5, 4)).toBe(true);
    expect(isWithinEntitlement(5, 5)).toBe(false);
    expect(isWithinEntitlement(false, 0)).toBe(false);
  });
});

describe("catalog domain rules", () => {
  it("falls back from requested locale to business locale to source", () => {
    const translations = new Map([["fa", "لاته"]]);
    expect(translationFallback(translations, "ar", "fa", "Latte")).toBe("لاته");
    expect(translationFallback(new Map(), "ar", "en", "Latte")).toBe("Latte");
  });

  it("validates option-group min and max selections", () => {
    expect(validateSelectionCount(2, 1, 3)).toBe(true);
    expect(validateSelectionCount(4, 1, 3)).toBe(false);
  });

  it("evaluates overnight schedules against the previous day", () => {
    const schedule = { days: [5], startMinutes: 17 * 60, endMinutes: 4 * 60 };
    expect(isScheduleActive(schedule, { day: 5, minute: 18 * 60 })).toBe(true);
    expect(isScheduleActive(schedule, { day: 6, minute: 2 * 60 })).toBe(true);
    expect(isScheduleActive(schedule, { day: 6, minute: 5 * 60 })).toBe(false);
  });

  it("rejects non-HTTPS, credentialed, and unapproved QR redirects", () => {
    const allowed = new Set(["partner.example"]);
    expect(
      isSafeExternalQrTarget("https://partner.example/menu", allowed),
    ).toBe(true);
    expect(isSafeExternalQrTarget("http://partner.example/menu", allowed)).toBe(
      false,
    );
    expect(isSafeExternalQrTarget("https://attacker.example", allowed)).toBe(
      false,
    );
    expect(
      isSafeExternalQrTarget("https://user:pass@partner.example", allowed),
    ).toBe(false);
  });
});
