import type { ISpendingRepository, IWorkLogRepository } from "@/types/repository";
import { addDaysUtc, startOfWeek } from "@/services/dates";
import { summarizePeriod, type PeriodSummary } from "@/services/metrics/weekly-summary";

export const NO_PLATFORM_LABEL = "Sem plataforma";

const DAYS_IN_WEEK = 7;

export class WeeklyReportService {
  constructor(
    private readonly spendingRepo: ISpendingRepository,
    private readonly workLogRepo: IWorkLogRepository,
  ) {}

  summarize(userId: number, anyDayOfWeek: Date): Promise<PeriodSummary> {
    return this.summarizePeriod(userId, startOfWeek(anyDayOfWeek), DAYS_IN_WEEK);
  }

  async summarizePeriod(userId: number, start: Date, dayCount: number): Promise<PeriodSummary> {
    const filter = { userId, from: start, to: addDaysUtc(start, dayCount) };
    const [days, platforms, workLogs] = await Promise.all([
      this.spendingRepo.sumByDay(filter),
      this.spendingRepo.sumIncomeByPlatform(filter),
      this.workLogRepo.listActive(userId, filter.from, filter.to),
    ]);
    return summarizePeriod({
      start,
      dayCount,
      days,
      incomeByPlatform: platforms.map((p) => ({ label: p.label ?? NO_PLATFORM_LABEL, amountCents: p.amountCents })),
      workLogs,
    });
  }
}
