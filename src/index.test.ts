import { SELF } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import { signToken } from "@/services/dashboard/token";

const SECRET = "test-secret";

describe("worker fetch", () => {
  it("GET /health returns ok status", async () => {
    const res = await SELF.fetch("https://gaston.test/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "ok", service: "gaston" });
  });

  it("GET /dashboard with a valid token returns the HTML page", async () => {
    const token = await signToken(1, SECRET, new Date());
    const res = await SELF.fetch(`https://gaston.test/dashboard?u=1&t=${token}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(await res.text()).toContain("Ganho por dia");
  });

  it("GET /dashboard with a bad token is forbidden", async () => {
    const res = await SELF.fetch("https://gaston.test/dashboard?u=1&t=nope");
    expect(res.status).toBe(403);
  });

  it("GET /dashboard with an expired token is forbidden", async () => {
    const yesterday = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const token = await signToken(1, SECRET, yesterday);
    const res = await SELF.fetch(`https://gaston.test/dashboard?u=1&t=${token}`);
    expect(res.status).toBe(403);
  });

  it("GET /api/report with a valid token returns a JSON report", async () => {
    const token = await signToken(2, SECRET, new Date());
    const res = await SELF.fetch(
      `https://gaston.test/api/report?u=2&t=${token}&week=2026-10-29`,
    );
    expect(res.status).toBe(200);
    const report = await res.json<{ start: string; profitCents: number; days: unknown[] }>();
    expect(report.start).toBe("2026-10-26");
    expect(report.profitCents).toBe(0);
    expect(report.days).toHaveLength(7);
  });

  it("GET /api/insights for a week without data answers insufficient_data", async () => {
    const token = await signToken(2, SECRET, new Date());
    const res = await SELF.fetch(`https://gaston.test/api/insights?u=2&t=${token}&week=2026-10-29`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "insufficient_data" });
  });

  it("GET /api/insights only accepts a week", async () => {
    const token = await signToken(2, SECRET, new Date());
    const res = await SELF.fetch(`https://gaston.test/api/insights?u=2&t=${token}&month=2026-10`);
    expect(res.status).toBe(400);
  });

  it("GET /api/insights with a bad token is forbidden", async () => {
    const res = await SELF.fetch("https://gaston.test/api/insights?u=2&t=nope&week=2026-10-29");
    expect(res.status).toBe(403);
  });

  it("GET /api/report without a period is a bad request", async () => {
    const token = await signToken(2, SECRET, new Date());
    const res = await SELF.fetch(`https://gaston.test/api/report?u=2&t=${token}`);
    expect(res.status).toBe(400);
  });

  it("GET /api/report with a bad token is forbidden", async () => {
    const res = await SELF.fetch(
      "https://gaston.test/api/report?u=2&t=nope&week=2026-10-29",
    );
    expect(res.status).toBe(403);
  });
});
