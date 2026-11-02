import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1";
import type { ILLMClient } from "@/types/llm";
import { AnalyticsService } from "@/services/analytics/analytics.service";
import { WeeklyReportService } from "@/services/metrics/weekly-report.service";
import { SpendingRepository } from "@/repositories/spending.repository";
import { WorkLogRepository } from "@/repositories/work-log.repository";
import { WeeklyInsightRepository } from "@/repositories/weekly-insight.repository";
import { InsightService } from "@/services/insights/insight.service";
import { DashboardReportService, parseDashboardQuery } from "@/services/dashboard/report.service";
import { renderDashboardHtml } from "@/services/dashboard/page";
import { verifyToken } from "@/services/dashboard/token";

interface DashboardDeps {
  db: D1Database;
  secret: string;
  now: Date;
  llm: () => ILLMClient;
}

export async function handleDashboardRoutes(
  request: Request,
  deps: DashboardDeps,
): Promise<Response | null> {
  const url = new URL(request.url);

  if (url.pathname === "/dashboard") {
    if (!(await authorize(url, deps.secret, deps.now))) return forbidden();
    return new Response(renderDashboardHtml(), {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  if (url.pathname === "/api/report") {
    const userId = await authorize(url, deps.secret, deps.now);
    if (!userId) return forbidden();

    const query = parseDashboardQuery(url.searchParams);
    if (!query) return Response.json({ error: "invalid_params" }, { status: 400 });

    return Response.json(await buildReportService(drizzle(deps.db)).build(userId, query));
  }

  if (url.pathname === "/api/insights") {
    const userId = await authorize(url, deps.secret, deps.now);
    if (!userId) return forbidden();

    const query = parseDashboardQuery(url.searchParams);
    if (query?.view !== "week") return Response.json({ error: "invalid_params" }, { status: 400 });

    const db = drizzle(deps.db);
    const insights = new InsightService(buildPeriodReport(db), new WeeklyInsightRepository(db), deps.llm());
    return Response.json(await insights.forWeek(userId, query.anyDay));
  }

  return null;
}

function buildPeriodReport(db: DrizzleD1Database): WeeklyReportService {
  return new WeeklyReportService(new SpendingRepository(db), new WorkLogRepository(db));
}

function buildReportService(db: DrizzleD1Database): DashboardReportService {
  const spendingRepo = new SpendingRepository(db);
  return new DashboardReportService(spendingRepo, buildPeriodReport(db), new AnalyticsService(spendingRepo));
}

async function authorize(url: URL, secret: string, now: Date): Promise<number | null> {
  const userId = Number(url.searchParams.get("u"));
  const token = url.searchParams.get("t");
  if (!Number.isInteger(userId) || userId <= 0 || !token) return null;
  return (await verifyToken(userId, token, secret, now)) ? userId : null;
}

function forbidden(): Response {
  return new Response("Link inválido ou expirado.", { status: 403 });
}
