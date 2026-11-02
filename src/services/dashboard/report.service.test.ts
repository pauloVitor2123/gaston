import { describe, expect, it, vi } from "vitest";
import type { ISpendingRepository, IWorkLogRepository } from "@/types/repository";
import type { WorkLog } from "@/db/schema";
import { parseUtcDate } from "@/services/dates";
import { AnalyticsService } from "@/services/analytics/analytics.service";
import { WeeklyReportService } from "@/services/metrics/weekly-report.service";
import { DashboardReportService, parseDashboardQuery } from "@/services/dashboard/report.service";

function makeService(overrides: Partial<ISpendingRepository> = {}, workLogs: WorkLog[] = []) {
  const spendingRepo: ISpendingRepository = {
    sumTotal: vi.fn(async () => 0),
    sumByCategoryTree: vi.fn(async () => []),
    sumIncomeTotal: vi.fn(async () => 0),
    sumIncomeByPlatform: vi.fn(async () => []),
    sumByDay: vi.fn(async () => []),
    sumIncomeByDayAndPlatform: vi.fn(async () => []),
    ...overrides,
  };
  const workLogRepo = { listActive: vi.fn(async () => workLogs) } as unknown as IWorkLogRepository;
  const service = new DashboardReportService(
    spendingRepo,
    new WeeklyReportService(spendingRepo, workLogRepo),
    new AnalyticsService(spendingRepo),
  );
  return { service, spendingRepo, workLogRepo };
}

describe("parseDashboardQuery", () => {
  it("reads a week by any of its days", () => {
    expect(parseDashboardQuery(new URLSearchParams("week=2026-10-29"))).toEqual({
      view: "week",
      anyDay: parseUtcDate("2026-10-29"),
    });
  });

  it("reads a month", () => {
    expect(parseDashboardQuery(new URLSearchParams("month=2026-10"))).toEqual({
      view: "month",
      anyDay: parseUtcDate("2026-10-01"),
    });
  });

  it("rejects missing or malformed periods", () => {
    expect(parseDashboardQuery(new URLSearchParams(""))).toBeNull();
    expect(parseDashboardQuery(new URLSearchParams("week=29/10/2026"))).toBeNull();
    expect(parseDashboardQuery(new URLSearchParams("month=2026-1"))).toBeNull();
  });
});

describe("DashboardReportService.build", () => {
  it("packs the Monday-to-Sunday week with income per day split by platform", async () => {
    const { service, spendingRepo } = makeService(
      {
        sumByDay: vi.fn(async () => [{ date: parseUtcDate("2026-10-27"), incomeCents: 38000, expenseCents: 9000 }]),
        sumIncomeByPlatform: vi.fn(async () => [
          { label: "Uber", amountCents: 28000 },
          { label: null, amountCents: 10000 },
        ]),
        sumIncomeByDayAndPlatform: vi.fn(async () => [
          { date: parseUtcDate("2026-10-27"), label: null, amountCents: 10000 },
          { date: parseUtcDate("2026-10-27"), label: "Uber", amountCents: 28000 },
        ]),
        sumByCategoryTree: vi.fn(async () => [
          { categoryLabel: "Transporte", subcategoryLabel: "Combustível", amountCents: 9000 },
        ]),
      },
      [{ period: "day", periodStart: parseUtcDate("2026-10-27"), km: 152, onlineMinutes: 480, rides: 19 } as WorkLog],
    );

    const report = await service.build(1, { view: "week", anyDay: parseUtcDate("2026-10-29") });

    expect(spendingRepo.sumIncomeByDayAndPlatform).toHaveBeenCalledWith({
      userId: 1,
      from: parseUtcDate("2026-10-26"),
      to: parseUtcDate("2026-11-02"),
    });
    expect(report.start).toBe("2026-10-26");
    expect(report.end).toBe("2026-11-01");
    expect(report.profitCents).toBe(29000);
    expect(report.days).toHaveLength(7);
    expect(report.days[1]).toEqual({
      date: "2026-10-27",
      incomeCents: 38000,
      expenseCents: 9000,
      platforms: [
        { label: "Uber", amountCents: 28000 },
        { label: "Sem plataforma", amountCents: 10000 },
      ],
    });
    expect(report.bestDay).toEqual({ date: "2026-10-27", incomeCents: 38000 });
    expect(report.productivity.grossPerHourCents).toBe(4750);
    expect(report.productivity.grossPerKmCents).toBe(250);
    expect(report.productivity.avgRideMinutes).toBe(25);
    expect(report.categories.rows[0]!.label).toBe("Transporte");
  });

  it("spans the whole civil month for the month view", async () => {
    const { service, spendingRepo, workLogRepo } = makeService();

    const report = await service.build(1, { view: "month", anyDay: parseUtcDate("2026-02-01") });

    const window = { userId: 1, from: parseUtcDate("2026-02-01"), to: parseUtcDate("2026-03-01") };
    expect(spendingRepo.sumByDay).toHaveBeenCalledWith(window);
    expect(workLogRepo.listActive).toHaveBeenCalledWith(1, window.from, window.to);
    expect(report.view).toBe("month");
    expect(report.days).toHaveLength(28);
    expect(report.end).toBe("2026-02-28");
    expect(report.bestDay).toBeNull();
  });
});
