import { describe, expect, it, vi } from "vitest";
import type { ISpendingRepository, SpendingFilter, SpendingRow } from "@/types/repository";
import { AnalyticsService } from "@/services/analytics/analytics.service";

function makeRepo(overrides: Partial<ISpendingRepository> = {}): ISpendingRepository {
  return {
    sumTotal: vi.fn(async () => 0),
    sumByCategory: vi.fn(async () => []),
    sumByMantra: vi.fn(async () => []),
    sumByCard: vi.fn(async () => []),
    sumByPaymentMethod: vi.fn(async () => []),
    ...overrides,
  };
}

describe("AnalyticsService.aggregate", () => {
  it("routes group_by to the matching repo method and sorts rows desc with total", async () => {
    const sumByCategory = vi.fn(
      async (): Promise<SpendingRow[]> => [
        { label: "Transporte", amountCents: 30000 },
        { label: "Alimentação", amountCents: 45000 },
      ],
    );
    const repo = makeRepo({ sumByCategory });
    const service = new AnalyticsService(repo);

    const report = await service.aggregate(1, {
      group_by: "category",
      from: "2026-08-01",
      to: "2026-08-31",
    });

    expect(sumByCategory).toHaveBeenCalledOnce();
    expect(report.rows).toEqual([
      { label: "Alimentação", amountCents: 45000 },
      { label: "Transporte", amountCents: 30000 },
    ]);
    expect(report.totalCents).toBe(75000);
  });

  it("labels null groups and defaults direction to 'out', end date inclusive", async () => {
    let captured: SpendingFilter | undefined;
    const repo = makeRepo({
      sumByCategory: vi.fn(async (f: SpendingFilter) => {
        captured = f;
        return [{ label: null, amountCents: 1000 }];
      }),
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

  it("uses sumTotal for group_by 'none' and passes direction 'in'", async () => {
    let captured: SpendingFilter | undefined;
    const sumTotal = vi.fn(async (f: SpendingFilter) => {
      captured = f;
      return 200000;
    });
    const service = new AnalyticsService(makeRepo({ sumTotal }));

    const report = await service.aggregate(1, {
      group_by: "none",
      from: "2026-08-01",
      to: "2026-08-31",
      direction: "in",
    });

    expect(sumTotal).toHaveBeenCalledOnce();
    expect(captured!.direction).toBe("in");
    expect(report).toEqual({ rows: [{ label: "Total", amountCents: 200000 }], totalCents: 200000 });
  });

  it("returns an empty report when 'none' total is zero", async () => {
    const service = new AnalyticsService(makeRepo({ sumTotal: vi.fn(async () => 0) }));
    const report = await service.aggregate(1, { group_by: "none", from: "2026-08-01", to: "2026-08-31" });
    expect(report).toEqual({ rows: [], totalCents: 0 });
  });
});
