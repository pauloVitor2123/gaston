import { describe, expect, it, vi } from "vitest";
import type { NewWeeklyInsight, WeeklyInsight } from "@/db/schema";
import type { ILLMClient } from "@/types/llm";
import type { IWeeklyInsightRepository } from "@/types/repository";
import { parseUtcDate, toIsoDate } from "@/services/dates";
import type { WeeklyReportService } from "@/services/metrics/weekly-report.service";
import { summarizeWeek, type WeekInputs } from "@/services/metrics/weekly-summary";
import { InsightService, REPORT_INSIGHTS_TOOL } from "@/services/insights/insight.service";

const MONDAY = parseUtcDate("2026-10-26");
const ITEMS = [1, 2, 3].map((n) => ({ hypothesis: `h${n}`, suggestion: `s${n}` }));

const WORKED_WEEK: Omit<WeekInputs, "weekStart"> = {
  days: [{ date: parseUtcDate("2026-10-27"), incomeCents: 30000, expenseCents: 9000 }],
  incomeByPlatform: [{ label: "Uber", amountCents: 30000 }],
  workLogs: [{ period: "day", periodStart: parseUtcDate("2026-10-27"), km: 150, onlineMinutes: 480, rides: 18 }],
};

function makeRepo(): IWeeklyInsightRepository {
  const rows = new Map<string, WeeklyInsight>();
  return {
    findByWeek: vi.fn(async (userId: number, weekStart: Date) => rows.get(`${userId}/${toIsoDate(weekStart)}`) ?? null),
    save: vi.fn(async (data: NewWeeklyInsight) => {
      rows.set(`${data.userId}/${toIsoDate(data.weekStart)}`, { id: 1, createdAt: new Date(), ...data } as WeeklyInsight);
    }),
  };
}

function makeLlm(insights: unknown = ITEMS): ILLMClient {
  return {
    callWithTools: vi.fn(async () => ({ toolCalls: [{ name: REPORT_INSIGHTS_TOOL.name, arguments: { insights } }] })),
  };
}

function makeReport(current: Omit<WeekInputs, "weekStart">) {
  const summarize = vi.fn(async (_userId: number, day: Date) =>
    summarizeWeek(
      toIsoDate(day) === toIsoDate(MONDAY)
        ? { weekStart: day, ...current }
        : { weekStart: day, days: [], incomeByPlatform: [], workLogs: [] },
    ),
  );
  return { report: { summarize } as unknown as WeeklyReportService, summarize };
}

describe("InsightService.forWeek", () => {
  it("does not call the LLM without income and a work log in the week", async () => {
    const llm = makeLlm();
    const noEffort = { ...WORKED_WEEK, workLogs: [] };
    const service = new InsightService(makeReport(noEffort).report, makeRepo(), llm);

    expect(await service.forWeek(1, parseUtcDate("2026-10-29"))).toEqual({ status: "insufficient_data" });
    expect(llm.callWithTools).not.toHaveBeenCalled();
  });

  it("summarizes the week and the 4 before it, then generates and stores 3 insights", async () => {
    const { report, summarize } = makeReport(WORKED_WEEK);
    const repo = makeRepo();
    const llm = makeLlm();
    const service = new InsightService(report, repo, llm);

    const result = await service.forWeek(1, parseUtcDate("2026-10-29"));

    expect(result).toEqual({ status: "ready", items: ITEMS });
    expect(summarize.mock.calls.map(([, day]) => toIsoDate(day))).toEqual([
      "2026-10-26",
      "2026-10-19",
      "2026-10-12",
      "2026-10-05",
      "2026-09-28",
    ]);
    const facts = JSON.parse(vi.mocked(llm.callWithTools).mock.calls[0]![0][0]!.content);
    expect(facts.semana_atual.ganho_por_hora).toBe(37.5);
    expect(facts.semanas_anteriores).toHaveLength(4);
    expect(repo.save).toHaveBeenCalledOnce();
  });

  it("reuses the stored insights while the numbers stay the same", async () => {
    const llm = makeLlm();
    const service = new InsightService(makeReport(WORKED_WEEK).report, makeRepo(), llm);

    await service.forWeek(1, MONDAY);
    const second = await service.forWeek(1, MONDAY);

    expect(second).toEqual({ status: "ready", items: ITEMS });
    expect(llm.callWithTools).toHaveBeenCalledOnce();
  });

  it("regenerates when the week's numbers change", async () => {
    const repo = makeRepo();
    const llm = makeLlm();
    await new InsightService(makeReport(WORKED_WEEK).report, repo, llm).forWeek(1, MONDAY);

    const moreIncome = {
      ...WORKED_WEEK,
      days: [...WORKED_WEEK.days, { date: parseUtcDate("2026-10-28"), incomeCents: 5000, expenseCents: 0 }],
    };
    await new InsightService(makeReport(moreIncome).report, repo, llm).forWeek(1, MONDAY);

    expect(llm.callWithTools).toHaveBeenCalledTimes(2);
  });

  it("reports unavailable without saving when the LLM fails or answers off-shape", async () => {
    const repo = makeRepo();
    const failing: ILLMClient = { callWithTools: vi.fn(async () => Promise.reject(new Error("credits"))) };

    const failed = await new InsightService(makeReport(WORKED_WEEK).report, repo, failing).forWeek(1, MONDAY);
    const offShape = await new InsightService(makeReport(WORKED_WEEK).report, repo, makeLlm(ITEMS.slice(0, 2))).forWeek(1, MONDAY);

    expect(failed).toEqual({ status: "unavailable" });
    expect(offShape).toEqual({ status: "unavailable" });
    expect(repo.save).not.toHaveBeenCalled();
  });
});
