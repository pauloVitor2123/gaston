import { describe, expect, it } from "vitest";
import { addMonthsUtc, splitAmountCents } from "@/services/installment/installments";

describe("splitAmountCents", () => {
  it("splits evenly when divisible", () => {
    expect(splitAmountCents(10000, 4)).toEqual([2500, 2500, 2500, 2500]);
  });

  it("puts the rounding remainder on the first installment", () => {
    const parts = splitAmountCents(366800, 5);
    expect(parts).toEqual([73360, 73360, 73360, 73360, 73360]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(366800);
  });

  it("keeps the total exact with an odd remainder", () => {
    const parts = splitAmountCents(1000, 3);
    expect(parts).toEqual([334, 333, 333]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(1000);
  });
});

describe("addMonthsUtc", () => {
  it("advances whole months keeping the day", () => {
    expect(addMonthsUtc(new Date(Date.UTC(2026, 0, 15)), 2)).toEqual(new Date(Date.UTC(2026, 2, 15)));
  });

  it("clamps to the last valid day of a short month", () => {
    expect(addMonthsUtc(new Date(Date.UTC(2026, 0, 31)), 1)).toEqual(new Date(Date.UTC(2026, 1, 28)));
  });

  it("crosses the year boundary", () => {
    expect(addMonthsUtc(new Date(Date.UTC(2026, 11, 10)), 1)).toEqual(new Date(Date.UTC(2027, 0, 10)));
  });
});
