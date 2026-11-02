import { drizzle } from "drizzle-orm/d1";
import { AnalyticsService } from "@/services/analytics/analytics.service";
import { WeeklyReportService } from "@/services/metrics/weekly-report.service";
import { SpendingRepository } from "@/repositories/spending.repository";
import { WorkLogRepository } from "@/repositories/work-log.repository";
import { DashboardReportService, parseDashboardQuery } from "@/services/dashboard/report.service";
import { renderDashboardHtml } from "@/services/dashboard/page";
import { verifyToken } from "@/services/dashboard/token";

interface DashboardDeps {
  db: D1Database;
  secret: string;
  now: Date;
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

    return Response.json(await buildReportService(deps.db).build(userId, query));
  }

  return null;
}

function buildReportService(d1: D1Database): DashboardReportService {
  const db = drizzle(d1);
  const spendingRepo = new SpendingRepository(db);
  return new DashboardReportService(
    spendingRepo,
    new WeeklyReportService(spendingRepo, new WorkLogRepository(db)),
    new AnalyticsService(spendingRepo),
  );
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
