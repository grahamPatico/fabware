import { describe, it, expect } from "vitest";
import { DAILY_BUDGET_MESSAGE, isOverDailyBudget, utcDayStartMs } from "../spendCap";

describe("daily spend cap", () => {
  it("defaults to 25 USD a day", () => {
    expect(isOverDailyBudget(24.99, undefined)).toBe(false);
    expect(isOverDailyBudget(25, undefined)).toBe(true);
  });

  it("reads the cap from the environment value", () => {
    expect(isOverDailyBudget(5, "5")).toBe(true);
    expect(isOverDailyBudget(4.5, "5")).toBe(false);
    expect(isOverDailyBudget(0, "0")).toBe(true);
  });

  it("turns the guard off when the value is not a number", () => {
    expect(isOverDailyBudget(1_000_000, "off")).toBe(false);
  });

  it("starts the day at midnight UTC", () => {
    expect(utcDayStartMs(Date.UTC(2026, 9, 12, 15, 30, 5))).toBe(Date.UTC(2026, 9, 12));
    expect(utcDayStartMs(Date.UTC(2026, 9, 12))).toBe(Date.UTC(2026, 9, 12));
  });

  it("says when it resets", () => {
    expect(DAILY_BUDGET_MESSAGE).toMatch(/midnight UTC/);
  });
});
