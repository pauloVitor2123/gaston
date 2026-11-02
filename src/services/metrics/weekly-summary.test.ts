import { describe, expect, it } from "vitest";
import { parseUtcDate } from "@/services/dates";
import {
  summarizePeriod,
  summarizeWeek,
  type WeekInputs,
  type WorkLogEntry,
} from "@/services/metrics/weekly-summary";

const MONDAY = parseUtcDate("2026-10-26");

function day(iso: string, incomeCents: number, expenseCents = 0) {
  return { date: parseUtcDate(iso), incomeCents, expenseCents };
}

function dayLog(iso: string, fields: Partial<Omit<WorkLogEntry, "period" | "periodStart">>): WorkLogEntry {
  return { period: "day", periodStart: parseUtcDate(iso), km: null, onlineMinutes: null, rides: null, ...fields };
}

function weekLog(fields: Partial<Omit<WorkLogEntry, "period" | "periodStart">>, monday = MONDAY): WorkLogEntry {
  return { period: "week", periodStart: monday, km: null, onlineMinutes: null, rides: null, ...fields };
}

function inputs(overrides: Partial<WeekInputs> = {}): WeekInputs {
  return { weekStart: MONDAY, days: [], incomeByPlatform: [], workLogs: [], ...overrides };
}

describe("summarizeWeek", () => {
  it("returns an empty week with seven days and no metrics", () => {
    const summary = summarizeWeek(inputs());

    expect(summary.end).toEqual(parseUtcDate("2026-11-01"));
    expect(summary.days).toHaveLength(7);
    expect(summary.incomeCents).toBe(0);
    expect(summary.effortSource).toBe("none");
    expect(summary.grossPerHourCents).toBeNull();
    expect(summary.bestDay).toBeNull();
  });

  it("totals money, profit and finds the best day", () => {
    const summary = summarizeWeek(
      inputs({ days: [day("2026-10-27", 28000, 9000), day("2026-10-31", 42000, 3000)] }),
    );

    expect(summary.incomeCents).toBe(70000);
    expect(summary.expenseCents).toBe(12000);
    expect(summary.profitCents).toBe(58000);
    expect(summary.bestDay).toEqual({ date: parseUtcDate("2026-10-31"), incomeCents: 42000 });
    expect(summary.days[5]!.incomeCents).toBe(42000);
  });

  it("pairs per-hour and per-km with the days that have the denominator only", () => {
    const summary = summarizeWeek(
      inputs({
        days: [day("2026-10-27", 30000, 6000), day("2026-10-28", 50000), day("2026-10-29", 20000)],
        workLogs: [
          dayLog("2026-10-27", { onlineMinutes: 300, km: 120 }),
          dayLog("2026-10-28", { onlineMinutes: 600 }),
        ],
      }),
    );

    expect(summary.effortSource).toBe("days");
    expect(summary.onlineMinutes).toBe(900);
    expect(summary.km).toBe(120);
    expect(summary.grossPerHourCents).toBe(5333);
    expect(summary.grossPerKmCents).toBe(250);
    expect(summary.profitPerHourCents).toBe(4933);
    expect(summary.profitPerKmCents).toBe(200);
  });

  it("sums several daily logs of the same day", () => {
    const summary = summarizeWeek(
      inputs({
        days: [day("2026-10-27", 30000)],
        workLogs: [dayLog("2026-10-27", { km: 100 }), dayLog("2026-10-27", { km: 50 })],
      }),
    );

    expect(summary.km).toBe(150);
    expect(summary.days[1]!.km).toBe(150);
    expect(summary.grossPerKmCents).toBe(200);
  });

  it("lets a weekly log win over daily logs for the week totals, without prorating days", () => {
    const summary = summarizeWeek(
      inputs({
        days: [day("2026-10-27", 30000), day("2026-10-28", 30000)],
        workLogs: [dayLog("2026-10-27", { onlineMinutes: 300 }), weekLog({ onlineMinutes: 1200, km: 400 })],
      }),
    );

    expect(summary.effortSource).toBe("week");
    expect(summary.onlineMinutes).toBe(1200);
    expect(summary.km).toBe(400);
    expect(summary.grossPerHourCents).toBe(3000);
    expect(summary.grossPerKmCents).toBe(150);
    expect(summary.days[1]!.onlineMinutes).toBe(300);
    expect(summary.days[1]!.grossPerHourCents).toBe(6000);
    expect(summary.days[2]!.onlineMinutes).toBeNull();
  });

  it("computes per-ride metrics only where rides were given", () => {
    const summary = summarizeWeek(
      inputs({
        days: [day("2026-10-27", 52000), day("2026-10-28", 10000)],
        workLogs: [dayLog("2026-10-27", { rides: 20, onlineMinutes: 600, km: 230 })],
      }),
    );

    expect(summary.rides).toBe(20);
    expect(summary.avgRideMinutes).toBe(30);
    expect(summary.avgRideValueCents).toBe(2600);
    expect(summary.avgRideKm).toBe(11.5);
  });

  it("leaves per-ride metrics null without rides", () => {
    const summary = summarizeWeek(
      inputs({ days: [day("2026-10-27", 52000)], workLogs: [dayLog("2026-10-27", { onlineMinutes: 600 })] }),
    );

    expect(summary.avgRideMinutes).toBeNull();
    expect(summary.avgRideValueCents).toBeNull();
  });

  it("orders income by platform descending", () => {
    const summary = summarizeWeek(
      inputs({
        incomeByPlatform: [
          { label: "99", amountCents: 30000 },
          { label: "Uber", amountCents: 50000 },
        ],
      }),
    );

    expect(summary.incomeByPlatform.map((p) => p.label)).toEqual(["Uber", "99"]);
  });
});

describe("summarizePeriod", () => {
  const OCTOBER = { start: parseUtcDate("2026-10-01"), dayCount: 31, incomeByPlatform: [] };

  it("combines whole weeks with a weekly log and loose days with daily logs", () => {
    const summary = summarizePeriod({
      ...OCTOBER,
      days: [day("2026-10-06", 30000), day("2026-10-14", 20000)],
      workLogs: [
        weekLog({ onlineMinutes: 600 }, parseUtcDate("2026-10-05")),
        dayLog("2026-10-07", { onlineMinutes: 999 }),
        dayLog("2026-10-14", { onlineMinutes: 300 }),
      ],
    });

    expect(summary.days).toHaveLength(31);
    expect(summary.end).toEqual(parseUtcDate("2026-10-31"));
    expect(summary.effortSource).toBe("mixed");
    expect(summary.onlineMinutes).toBe(900);
    expect(summary.grossPerHourCents).toBe(3333);
  });

  it("ignores a weekly log whose week crosses the period edge", () => {
    const summary = summarizePeriod({
      ...OCTOBER,
      days: [day("2026-10-27", 10000)],
      workLogs: [weekLog({ onlineMinutes: 600 }, parseUtcDate("2026-10-26"))],
    });

    expect(summary.effortSource).toBe("none");
    expect(summary.onlineMinutes).toBeNull();
    expect(summary.grossPerHourCents).toBeNull();
  });
});
