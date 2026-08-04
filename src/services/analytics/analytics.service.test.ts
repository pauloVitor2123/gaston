import { describe, expect, it, vi } from "vitest";
import type { ITransactionRepository, SpendingQuery, SpendingRow } from "@/types/repository";
import { AnalyticsService } from "@/services/analytics/analytics.service";

function repoReturning(rows: SpendingRow[], capture?: (q: SpendingQuery) => void) {
  return {
    sumByDimension: vi.fn(async (q: SpendingQuery) => {
      capture?.(q);
      return rows;
    }),
  } as unknown as ITransactionRepository;
}

describe("AnalyticsService.aggregate", () => {
  it("sorts rows by amount desc and sums the total", async () => {
    const repo = repoReturning([
      { label: "Transporte", amountCents: 30000 },
      { label: "Alimentação", amountCents: 45000 },
    ]);
    const service = new AnalyticsService(repo);

    const report = await service.aggregate(1, {
      group_by: "category",
      from: "2026-08-01",
      to: "2026-08-31",
    });

    expect(report.rows).toEqual([
      { label: "Alimentação", amountCents: 45000 },
      { label: "Transporte", amountCents: 30000 },
    ]);
    expect(report.totalCents).toBe(75000);
  });

  it("labels null groups and defaults direction to 'out', end date inclusive", async () => {
    let captured: SpendingQuery | undefined;
    const repo = repoReturning([{ label: null, amountCents: 1000 }], (q) => {
      captured = q;
    });
    const service = new AnalyticsService(repo);

    const report = await service.aggregate(7, {
      group_by: "category",
      from: "2026-08-01",
      to: "2026-08-31",
    });

    expect(report.rows[0]!.label).toBe("Sem categoria");
    expect(captured!.direction).toBe("out");
    expect(captured!.from).toEqual(new Date(Date.UTC(2026, 7, 1)));
    expect(captured!.to).toEqual(new Date(Date.UTC(2026, 8, 1)));
  });

  it("passes direction 'in' through for income queries", async () => {
    let captured: SpendingQuery | undefined;
    const repo = repoReturning([{ label: null, amountCents: 200000 }], (q) => {
      captured = q;
    });
    const service = new AnalyticsService(repo);

    await service.aggregate(1, {
      group_by: "none",
      from: "2026-08-01",
      to: "2026-08-31",
      direction: "in",
    });

    expect(captured!.direction).toBe("in");
  });
});
