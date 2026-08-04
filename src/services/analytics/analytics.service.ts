import type { ISpendingRepository, SpendingFilter, SpendingRow } from "@/types/repository";
import type { QuerySpendingArgs, SpendingGroupBy } from "@/services/analytics/query";
import { addDaysUtc, parseUtcDate } from "@/services/dates";

export interface SpendingBreakdownRow {
  label: string;
  amountCents: number;
}

export interface SpendingReport {
  rows: SpendingBreakdownRow[];
  totalCents: number;
}

const UNLABELED: Record<SpendingGroupBy, string> = {
  category: "Sem categoria",
  mantra: "Sem mantra",
  card: "Sem cartão",
  payment_method: "Sem método",
  none: "Total",
};

export class AnalyticsService {
  constructor(private readonly spendingRepo: ISpendingRepository) {}

  async aggregate(userId: number, params: QuerySpendingArgs): Promise<SpendingReport> {
    const filter: SpendingFilter = {
      userId,
      from: parseUtcDate(params.from),
      to: addDaysUtc(parseUtcDate(params.to), 1),
      direction: params.direction ?? "out",
    };

    const rows = await this.rowsFor(params.group_by, filter);
    const labeled = rows
      .map((row) => ({ label: row.label ?? UNLABELED[params.group_by], amountCents: row.amountCents }))
      .sort((a, b) => b.amountCents - a.amountCents);
    const totalCents = labeled.reduce((sum, row) => sum + row.amountCents, 0);
    return { rows: labeled, totalCents };
  }

  private async rowsFor(groupBy: SpendingGroupBy, filter: SpendingFilter): Promise<SpendingRow[]> {
    switch (groupBy) {
      case "none": {
        const total = await this.spendingRepo.sumTotal(filter);
        return total > 0 ? [{ label: null, amountCents: total }] : [];
      }
      case "category":
        return this.spendingRepo.sumByCategory(filter);
      case "mantra":
        return this.spendingRepo.sumByMantra(filter);
      case "card":
        return this.spendingRepo.sumByCard(filter);
      case "payment_method":
        return this.spendingRepo.sumByPaymentMethod(filter);
    }
  }
}
