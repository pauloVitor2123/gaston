import type { ISpendingRepository, IWorkLogRepository } from "@/types/repository";
import { addDaysUtc, startOfWeek } from "@/services/dates";
import { summarizeWeek, type WeekSummary } from "@/services/metrics/weekly-summary";

const NO_PLATFORM_LABEL = "Sem plataforma";

export class WeeklyReportService {
  constructor(
    private readonly spendingRepo: ISpendingRepository,
    private readonly workLogRepo: IWorkLogRepository,
  ) {}

  async summarize(userId: number, anyDayOfWeek: Date): Promise<WeekSummary> {
    const weekStart = startOfWeek(anyDayOfWeek);
    const filter = { userId, from: weekStart, to: addDaysUtc(weekStart, 7) };
    const [days, platforms, workLogs] = await Promise.all([
      this.spendingRepo.sumByDay(filter),
      this.spendingRepo.sumIncomeByPlatform(filter),
      this.workLogRepo.listActive(userId, filter.from, filter.to),
    ]);
    return summarizeWeek({
      weekStart,
      days,
      incomeByPlatform: platforms.map((p) => ({ label: p.label ?? NO_PLATFORM_LABEL, amountCents: p.amountCents })),
      workLogs,
    });
  }
}
