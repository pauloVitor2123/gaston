import { describe, expect, it, vi } from "vitest";
import type {
  CategorySubSpendingRow,
  ISpendingRepository,
  SpendingFilter,
} from "@/types/repository";
import { AnalyticsService } from "@/services/analytics/analytics.service";

function makeRepo(overrides: Partial<ISpendingRepository> = {}): ISpendingRepository {
  return {
    sumTotal: vi.fn(async () => 0),
    sumByCategoryTree: vi.fn(async () => []),
    ...overrides,
  };
}

describe("AnalyticsService.aggregate", () => {
  it("nests subcategories under each category, rolling up and sorting desc with total", async () => {
    const sumByCategoryTree = vi.fn(
      async (): Promise<CategorySubSpendingRow[]> => [
        { categoryLabel: "Transporte", subcategoryLabel: "Combustível", amountCents: 20000 },
        { categoryLabel: "Transporte", subcategoryLabel: null, amountCents: 10000 },
        { categoryLabel: "Alimentação", subcategoryLabel: null, amountCents: 45000 },
      ],
    );
    const service = new AnalyticsService(makeRepo({ sumByCategoryTree }));

    const report = await service.aggregate(1, {
      group_by: "category",
      from: "2026-08-01",
      to: "2026-08-31",
    });

    expect(sumByCategoryTree).toHaveBeenCalledOnce();
    expect(report.rows).toEqual([
      { label: "Alimentação", amountCents: 45000 },
      {
        label: "Transporte",
        amountCents: 30000,
        subcategories: [
          { label: "Combustível", amountCents: 20000 },
          { label: "(sem subcategoria)", amountCents: 10000 },
        ],
      },
    ]);
    expect(report.totalCents).toBe(75000);
  });

  it("labels null groups and makes the end date inclusive", async () => {
    let captured: SpendingFilter | undefined;
    const repo = makeRepo({
      sumByCategoryTree: vi.fn(async (f: SpendingFilter) => {
        captured = f;
        return [{ categoryLabel: null, subcategoryLabel: null, amountCents: 1000 }];
      }),
    });
    const service = new AnalyticsService(repo);

    const report = await service.aggregate(7, {
      group_by: "category",
      from: "2026-08-01",
      to: "2026-08-31",
    });

    expect(report.rows[0]!.label).toBe("Sem categoria");
    expect(report.rows[0]!.subcategories).toBeUndefined();
    expect(captured!.from).toEqual(new Date(Date.UTC(2026, 7, 1)));
    expect(captured!.to).toEqual(new Date(Date.UTC(2026, 8, 1)));
  });

  it("uses sumTotal for group_by 'none'", async () => {
    const sumTotal = vi.fn(async () => 200000);
    const service = new AnalyticsService(makeRepo({ sumTotal }));

    const report = await service.aggregate(1, {
      group_by: "none",
      from: "2026-08-01",
      to: "2026-08-31",
    });

    expect(sumTotal).toHaveBeenCalledOnce();
    expect(report).toEqual({ rows: [{ label: "Total", amountCents: 200000 }], totalCents: 200000 });
  });

  it("returns an empty report when 'none' total is zero", async () => {
    const service = new AnalyticsService(makeRepo({ sumTotal: vi.fn(async () => 0) }));
    const report = await service.aggregate(1, { group_by: "none", from: "2026-08-01", to: "2026-08-31" });
    expect(report).toEqual({ rows: [], totalCents: 0 });
  });
});
