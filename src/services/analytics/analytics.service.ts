import type {
  CategorySubSpendingRow,
  ISpendingRepository,
  SpendingFilter,
} from "@/types/repository";
import type { QuerySpendingArgs, SpendingGroupBy } from "@/services/analytics/query";
import { addDaysUtc, parseUtcDate } from "@/services/dates";

export interface SpendingBreakdownRow {
  label: string;
  amountCents: number;
  subcategories?: SpendingBreakdownRow[];
}

export interface SpendingReport {
  rows: SpendingBreakdownRow[];
  totalCents: number;
}

const UNLABELED: Record<SpendingGroupBy, string> = {
  category: "Sem categoria",
  platform: "Sem plataforma",
  none: "Total",
};

const NO_SUBCATEGORY_LABEL = "(sem subcategoria)";

export class AnalyticsService {
  constructor(private readonly spendingRepo: ISpendingRepository) {}

  async aggregate(userId: number, params: QuerySpendingArgs): Promise<SpendingReport> {
    const filter: SpendingFilter = {
      userId,
      from: parseUtcDate(params.from),
      to: addDaysUtc(parseUtcDate(params.to), 1),
    };

    const rows =
      params.subject === "income" ? await this.incomeRows(params.group_by, filter) : await this.expenseRows(params.group_by, filter);
    const totalCents = rows.reduce((sum, row) => sum + row.amountCents, 0);
    return { rows, totalCents };
  }

  private async expenseRows(groupBy: SpendingGroupBy, filter: SpendingFilter): Promise<SpendingBreakdownRow[]> {
    if (groupBy === "none") return this.totalRow(await this.spendingRepo.sumTotal(filter));
    return this.categoryTree(await this.spendingRepo.sumByCategoryTree(filter));
  }

  private async incomeRows(groupBy: SpendingGroupBy, filter: SpendingFilter): Promise<SpendingBreakdownRow[]> {
    if (groupBy === "none") return this.totalRow(await this.spendingRepo.sumIncomeTotal(filter));
    const rows = await this.spendingRepo.sumIncomeByPlatform(filter);
    return rows
      .map((row) => ({ label: row.label ?? UNLABELED.platform, amountCents: row.amountCents }))
      .sort((a, b) => b.amountCents - a.amountCents);
  }

  private totalRow(totalCents: number): SpendingBreakdownRow[] {
    return totalCents > 0 ? [{ label: UNLABELED.none, amountCents: totalCents }] : [];
  }

  private categoryTree(rows: CategorySubSpendingRow[]): SpendingBreakdownRow[] {
    const byCategory = new Map<string, { amountCents: number; subs: SpendingBreakdownRow[] }>();
    for (const row of rows) {
      const label = row.categoryLabel ?? UNLABELED.category;
      const entry = byCategory.get(label) ?? { amountCents: 0, subs: [] };
      entry.amountCents += row.amountCents;
      if (row.subcategoryLabel !== null) {
        entry.subs.push({ label: row.subcategoryLabel, amountCents: row.amountCents });
      } else if (rows.some((r) => (r.categoryLabel ?? UNLABELED.category) === label && r.subcategoryLabel !== null)) {
        entry.subs.push({ label: NO_SUBCATEGORY_LABEL, amountCents: row.amountCents });
      }
      byCategory.set(label, entry);
    }

    return [...byCategory.entries()]
      .map(([label, { amountCents, subs }]) =>
        subs.length > 0
          ? { label, amountCents, subcategories: subs.sort((a, b) => b.amountCents - a.amountCents) }
          : { label, amountCents },
      )
      .sort((a, b) => b.amountCents - a.amountCents);
  }
}
