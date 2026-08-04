import type { ITransactionRepository, SpendingDimension } from "@/types/repository";
import type { QuerySpendingArgs } from "@/services/analytics/query";
import { addDaysUtc, parseUtcDate } from "@/services/dates";

export interface SpendingBreakdownRow {
  label: string;
  amountCents: number;
}

export interface SpendingReport {
  rows: SpendingBreakdownRow[];
  totalCents: number;
}

const UNLABELED: Record<SpendingDimension, string> = {
  category: "Sem categoria",
  mantra: "Sem mantra",
  card: "Sem cartão",
  payment_method: "Sem método",
  none: "Total",
};

export class AnalyticsService {
  constructor(private readonly transactionRepo: ITransactionRepository) {}

  async aggregate(userId: number, params: QuerySpendingArgs): Promise<SpendingReport> {
    const rows = await this.transactionRepo.sumByDimension({
      userId,
      groupBy: params.group_by,
      from: parseUtcDate(params.from),
      to: addDaysUtc(parseUtcDate(params.to), 1),
      direction: params.direction ?? "out",
    });

    const labeled = rows
      .map((row) => ({
        label: row.label ?? UNLABELED[params.group_by],
        amountCents: row.amountCents,
      }))
      .sort((a, b) => b.amountCents - a.amountCents);

    const totalCents = labeled.reduce((sum, row) => sum + row.amountCents, 0);
    return { rows: labeled, totalCents };
  }
}
