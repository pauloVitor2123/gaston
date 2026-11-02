import { describe, expect, it, vi } from "vitest";
import type { ISpendingRepository, IWorkLogRepository } from "@/types/repository";
import type { WorkLog } from "@/db/schema";
import { parseUtcDate } from "@/services/dates";
import { WeeklyReportService } from "@/services/metrics/weekly-report.service";

describe("WeeklyReportService.summarize", () => {
  it("queries the Monday-to-Sunday window containing the given day and summarizes it", async () => {
    const spendingRepo = {
      sumByDay: vi.fn(async () => [{ date: parseUtcDate("2026-10-27"), incomeCents: 30000, expenseCents: 5000 }]),
      sumIncomeByPlatform: vi.fn(async () => [{ label: null, amountCents: 30000 }]),
    } as unknown as ISpendingRepository;
    const workLogRepo = {
      listActive: vi.fn(async () => [
        { period: "day", periodStart: parseUtcDate("2026-10-27"), km: null, onlineMinutes: 300, rides: null } as WorkLog,
      ]),
    } as unknown as IWorkLogRepository;
    const service = new WeeklyReportService(spendingRepo, workLogRepo);

    const summary = await service.summarize(1, parseUtcDate("2026-10-30"));

    const window = { userId: 1, from: parseUtcDate("2026-10-26"), to: parseUtcDate("2026-11-02") };
    expect(spendingRepo.sumByDay).toHaveBeenCalledWith(window);
    expect(workLogRepo.listActive).toHaveBeenCalledWith(1, window.from, window.to);
    expect(summary.start).toEqual(window.from);
    expect(summary.incomeByPlatform).toEqual([{ label: "Sem plataforma", amountCents: 30000 }]);
    expect(summary.grossPerHourCents).toBe(6000);
  });
});
