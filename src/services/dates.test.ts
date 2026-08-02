import { describe, expect, it } from "vitest";
import { addMonthsUtc, formatDayMonth, parseUtcDate, utcDayClamped } from "@/services/dates";

describe("parseUtcDate", () => {
  it("parses an ISO date to UTC midnight", () => {
    expect(parseUtcDate("2026-08-10")).toEqual(new Date(Date.UTC(2026, 7, 10)));
  });
});

describe("utcDayClamped", () => {
  it("clamps to the last valid day of a short month", () => {
    expect(utcDayClamped(2026, 1, 31)).toEqual(new Date(Date.UTC(2026, 1, 28)));
  });

  it("normalizes an overflowing month index", () => {
    expect(utcDayClamped(2026, 12, 15)).toEqual(new Date(Date.UTC(2027, 0, 15)));
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

describe("formatDayMonth", () => {
  it("formats as zero-padded dd/mm from the UTC date", () => {
    expect(formatDayMonth(new Date(Date.UTC(2026, 2, 5)))).toBe("05/03");
  });
});
