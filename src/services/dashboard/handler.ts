import { drizzle } from "drizzle-orm/d1";
import { AnalyticsService } from "@/services/analytics/analytics.service";
import { querySpendingArgsSchema } from "@/services/analytics/query";
import { SpendingRepository } from "@/repositories/spending.repository";
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

    const parsed = querySpendingArgsSchema.safeParse({
      group_by: url.searchParams.get("group_by"),
      from: url.searchParams.get("from"),
      to: url.searchParams.get("to"),
    });
    if (!parsed.success) return Response.json({ error: "invalid_params" }, { status: 400 });

    const analytics = new AnalyticsService(new SpendingRepository(drizzle(deps.db)));
    const report = await analytics.aggregate(userId, parsed.data);
    return Response.json(report);
  }

  return null;
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
