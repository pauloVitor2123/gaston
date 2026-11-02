import { describe, expect, it } from "vitest";
import { parseUtcDate } from "@/services/dates";
import { formatDuration, formatKm, formatWeekSummary, formatWorkLog } from "@/services/metrics/format";
import { summarizeWeek } from "@/services/metrics/weekly-summary";

const MONDAY = parseUtcDate("2026-10-26");

describe("formatWeekSummary", () => {
  it("says the week is empty when nothing was recorded", () => {
    const text = formatWeekSummary(summarizeWeek({ weekStart: MONDAY, days: [], incomeByPlatform: [], workLogs: [] }));

    expect(text).toContain("📊 Semana 26/10 – 01/11");
    expect(text).toContain("Nada registrado nesta semana ainda.");
  });

  it("renders money, productivity, per-ride metrics and the best day", () => {
    const summary = summarizeWeek({
      weekStart: MONDAY,
      days: [
        { date: parseUtcDate("2026-10-27"), incomeCents: 52000, expenseCents: 9000 },
        { date: parseUtcDate("2026-10-31"), incomeCents: 60000, expenseCents: 0 },
      ],
      incomeByPlatform: [
        { label: "Uber", amountCents: 72000 },
        { label: "99", amountCents: 40000 },
      ],
      workLogs: [
        { period: "day", periodStart: parseUtcDate("2026-10-27"), km: 230, onlineMinutes: 600, rides: 20 },
      ],
    });

    const text = formatWeekSummary(summary);

    expect(text).toContain("Receita R$ 1120,00 (Uber R$ 720,00 · 99 R$ 400,00)");
    expect(text).toContain("Gastos R$ 90,00");
    expect(text).toContain("Lucro R$ 1030,00");
    expect(text).toContain("⏱ R$ 52,00/h · R$ 2,26/km");
    expect(text).toContain("lucro R$ 43,00/h · R$ 1,87/km");
    expect(text).toContain("🚗 230 km · 10h00 online · 20 corridas");
    expect(text).toContain("🧭 30 min/corrida · R$ 26,00/corrida · 11,5 km/corrida");
    expect(text).toContain("🏆 Melhor dia: sáb 31/10 (R$ 600,00)");
    expect(text).toContain("/dashboard");
  });

  it("hints at logging the work day when there is income but no work log", () => {
    const summary = summarizeWeek({
      weekStart: MONDAY,
      days: [{ date: parseUtcDate("2026-10-27"), incomeCents: 52000, expenseCents: 0 }],
      incomeByPlatform: [],
      workLogs: [],
    });

    const text = formatWeekSummary(summary);

    expect(text).not.toContain("⏱");
    expect(text).toContain('"rodei 200km, 9h online, 18 corridas"');
  });
});

describe("work log formatting", () => {
  it("formats durations and km", () => {
    expect(formatDuration(510)).toBe("8h30");
    expect(formatDuration(45)).toBe("0h45");
    expect(formatKm(180.5)).toBe("180,5 km");
    expect(formatKm(230)).toBe("230 km");
  });

  it("describes a daily and a weekly work log", () => {
    expect(
      formatWorkLog({ period: "day", periodStart: parseUtcDate("2026-10-27"), km: 230, onlineMinutes: 600, rides: 22 }),
    ).toBe("🚗 Jornada de ter 27/10 — 230 km · 10h00 online · 22 corridas");
    expect(
      formatWorkLog({ period: "week", periodStart: MONDAY, km: null, onlineMinutes: null, rides: 1 }),
    ).toBe("🚗 Jornada da semana 26/10 – 01/11 — 1 corrida");
  });
});
