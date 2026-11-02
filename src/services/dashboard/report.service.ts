import { z } from "zod";
import type { ISpendingRepository } from "@/types/repository";
import type { AnalyticsService, SpendingReport } from "@/services/analytics/analytics.service";
import { NO_PLATFORM_LABEL, type WeeklyReportService } from "@/services/metrics/weekly-report.service";
import type { PeriodSummary, PlatformIncome } from "@/services/metrics/weekly-summary";
import {
  addDaysUtc,
  firstOfMonth,
  firstOfNextMonth,
  parseUtcDate,
  startOfWeek,
  toIsoDate,
} from "@/services/dates";

export type DashboardView = "week" | "month";

export interface DashboardQuery {
  view: DashboardView;
  anyDay: Date;
}

export interface DashboardDay {
  date: string;
  incomeCents: number;
  expenseCents: number;
  platforms: PlatformIncome[];
}

export interface DashboardReport {
  view: DashboardView;
  start: string;
  end: string;
  incomeCents: number;
  expenseCents: number;
  profitCents: number;
  incomeByPlatform: PlatformIncome[];
  productivity: {
    km: number | null;
    onlineMinutes: number | null;
    rides: number | null;
    grossPerHourCents: number | null;
    grossPerKmCents: number | null;
    profitPerHourCents: number | null;
    profitPerKmCents: number | null;
    avgRideMinutes: number | null;
    avgRideValueCents: number | null;
    avgRideKm: number | null;
  };
  bestDay: { date: string; incomeCents: number } | null;
  days: DashboardDay[];
  categories: SpendingReport;
}

const dashboardQuerySchema = z.union([
  z.object({ week: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
  z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) }),
]);

export function parseDashboardQuery(params: URLSearchParams): DashboardQuery | null {
  const parsed = dashboardQuerySchema.safeParse(
    params.has("week") ? { week: params.get("week") } : { month: params.get("month") },
  );
  if (!parsed.success) return null;
  return "week" in parsed.data
    ? { view: "week", anyDay: parseUtcDate(parsed.data.week) }
    : { view: "month", anyDay: parseUtcDate(`${parsed.data.month}-01`) };
}

export class DashboardReportService {
  constructor(
    private readonly spendingRepo: ISpendingRepository,
    private readonly periodReport: WeeklyReportService,
    private readonly analytics: AnalyticsService,
  ) {}

  async build(userId: number, query: DashboardQuery): Promise<DashboardReport> {
    const { start, end } = rangeOf(query);
    const dayCount = Math.round((end.getTime() - start.getTime()) / 86_400_000);
    const [summary, dailyPlatforms, categories] = await Promise.all([
      this.periodReport.summarizePeriod(userId, start, dayCount),
      this.spendingRepo.sumIncomeByDayAndPlatform({ userId, from: start, to: end }),
      this.analytics.aggregate(userId, {
        group_by: "category",
        from: toIsoDate(start),
        to: toIsoDate(addDaysUtc(end, -1)),
      }),
    ]);
    return toReport(query.view, summary, dailyPlatforms, categories);
  }
}

function rangeOf(query: DashboardQuery): { start: Date; end: Date } {
  if (query.view === "month") return { start: firstOfMonth(query.anyDay), end: firstOfNextMonth(query.anyDay) };
  const start = startOfWeek(query.anyDay);
  return { start, end: addDaysUtc(start, 7) };
}

function toReport(
  view: DashboardView,
  summary: PeriodSummary,
  dailyPlatforms: { date: Date; label: string | null; amountCents: number }[],
  categories: SpendingReport,
): DashboardReport {
  return {
    view,
    start: toIsoDate(summary.start),
    end: toIsoDate(summary.end),
    incomeCents: summary.incomeCents,
    expenseCents: summary.expenseCents,
    profitCents: summary.profitCents,
    incomeByPlatform: summary.incomeByPlatform,
    productivity: {
      km: summary.km,
      onlineMinutes: summary.onlineMinutes,
      rides: summary.rides,
      grossPerHourCents: summary.grossPerHourCents,
      grossPerKmCents: summary.grossPerKmCents,
      profitPerHourCents: summary.profitPerHourCents,
      profitPerKmCents: summary.profitPerKmCents,
      avgRideMinutes: summary.avgRideMinutes,
      avgRideValueCents: summary.avgRideValueCents,
      avgRideKm: summary.avgRideKm,
    },
    bestDay: summary.bestDay && {
      date: toIsoDate(summary.bestDay.date),
      incomeCents: summary.bestDay.incomeCents,
    },
    days: summary.days.map((day) => {
      const key = toIsoDate(day.date);
      return {
        date: key,
        incomeCents: day.incomeCents,
        expenseCents: day.expenseCents,
        platforms: dailyPlatforms
          .filter((row) => toIsoDate(row.date) === key)
          .map((row) => ({ label: row.label ?? NO_PLATFORM_LABEL, amountCents: row.amountCents }))
          .sort((a, b) => b.amountCents - a.amountCents),
      };
    }),
    categories,
  };
}
