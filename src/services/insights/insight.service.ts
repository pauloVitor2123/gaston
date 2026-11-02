import { z } from "zod";
import type { InsightItem } from "@/db/schema";
import type { ILLMClient, ToolDefinition } from "@/types/llm";
import type { IWeeklyInsightRepository } from "@/types/repository";
import { addDaysUtc, startOfWeek } from "@/services/dates";
import { toToolParameters } from "@/services/llm/tool-schema";
import type { WeeklyReportService } from "@/services/metrics/weekly-report.service";
import { buildInsightFacts, hasEnoughData, type InsightFacts } from "@/services/insights/insight-facts";
import { INSIGHT_SYSTEM_PROMPT } from "@/services/insights/prompts";

export type InsightsResult =
  | { status: "ready"; items: InsightItem[] }
  | { status: "insufficient_data" }
  | { status: "unavailable" };

const PREVIOUS_WEEKS = 4;

export const insightsArgsSchema = z.object({
  insights: z
    .array(
      z.object({
        hypothesis: z.string().min(1).describe("Hipótese curta sobre a rotina, citando os números."),
        suggestion: z.string().min(1).describe("Sugestão prática e testável na próxima semana."),
      }),
    )
    .length(3),
});

export const REPORT_INSIGHTS_TOOL: ToolDefinition = {
  name: "report_insights",
  description: "Entrega exatamente 3 insights (hipótese + sugestão) sobre a semana do motorista.",
  parameters: toToolParameters(insightsArgsSchema),
};

export class InsightService {
  constructor(
    private readonly periodReport: WeeklyReportService,
    private readonly repo: IWeeklyInsightRepository,
    private readonly llm: ILLMClient,
  ) {}

  async forWeek(userId: number, anyDayOfWeek: Date): Promise<InsightsResult> {
    const weekStart = startOfWeek(anyDayOfWeek);
    const [current, ...previous] = await Promise.all(
      Array.from({ length: PREVIOUS_WEEKS + 1 }, (_, back) =>
        this.periodReport.summarize(userId, addDaysUtc(weekStart, -7 * back)),
      ),
    );
    if (!current || !hasEnoughData(current)) return { status: "insufficient_data" };

    const facts = buildInsightFacts(current, previous);
    const fingerprint = await sha256(JSON.stringify(facts));
    const cached = await this.repo.findByWeek(userId, weekStart);
    if (cached?.fingerprint === fingerprint) return { status: "ready", items: cached.content };

    const items = await this.generate(facts);
    if (!items) return { status: "unavailable" };
    await this.repo.save({ userId, weekStart, fingerprint, content: items });
    return { status: "ready", items };
  }

  private async generate(facts: InsightFacts): Promise<InsightItem[] | null> {
    try {
      const { toolCalls } = await this.llm.callWithTools(
        [{ role: "user", content: JSON.stringify(facts) }],
        [REPORT_INSIGHTS_TOOL],
        INSIGHT_SYSTEM_PROMPT,
      );
      const call = toolCalls?.find((c) => c.name === REPORT_INSIGHTS_TOOL.name);
      const parsed = insightsArgsSchema.safeParse(call?.arguments);
      return parsed.success ? parsed.data.insights : null;
    } catch {
      return null;
    }
  }
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
