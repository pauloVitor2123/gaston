import { and, eq, gte, lt, ne, sql, type SQL } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { cards, categories, mantras, transactions } from "@/db/schema";
import type { ISpendingRepository, SpendingFilter, SpendingRow } from "@/types/repository";

export class SpendingRepository implements ISpendingRepository {
  constructor(private readonly db: DrizzleD1Database) {}

  async sumTotal(filter: SpendingFilter): Promise<number> {
    const [row] = await this.db
      .select({ amountCents: amount() })
      .from(transactions)
      .where(scope(filter));
    return row?.amountCents ?? 0;
  }

  async sumByCategory(filter: SpendingFilter): Promise<SpendingRow[]> {
    const rows = await this.db
      .select({ label: categories.name, amountCents: amount() })
      .from(transactions)
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .where(scope(filter))
      .groupBy(categories.id);
    return rows.map((r) => ({ label: r.label, amountCents: r.amountCents }));
  }

  async sumByMantra(filter: SpendingFilter): Promise<SpendingRow[]> {
    const rows = await this.db
      .select({ label: mantras.name, amountCents: amount() })
      .from(transactions)
      .leftJoin(mantras, eq(transactions.mantraId, mantras.id))
      .where(scope(filter))
      .groupBy(mantras.id);
    return rows.map((r) => ({ label: r.label, amountCents: r.amountCents }));
  }

  async sumByCard(filter: SpendingFilter): Promise<SpendingRow[]> {
    const rows = await this.db
      .select({ label: cards.name, amountCents: amount() })
      .from(transactions)
      .leftJoin(cards, eq(transactions.cardId, cards.id))
      .where(scope(filter))
      .groupBy(cards.id);
    return rows.map((r) => ({ label: r.label, amountCents: r.amountCents }));
  }

  async sumByPaymentMethod(filter: SpendingFilter): Promise<SpendingRow[]> {
    const rows = await this.db
      .select({ label: transactions.paymentMethod, amountCents: amount() })
      .from(transactions)
      .where(scope(filter))
      .groupBy(transactions.paymentMethod);
    return rows.map((r) => ({ label: r.label, amountCents: r.amountCents }));
  }
}

function amount(): SQL<number> {
  return sql<number>`sum(coalesce(${transactions.actualAmountCents}, ${transactions.expectedAmountCents}))`;
}

function scope(filter: SpendingFilter): SQL | undefined {
  return and(
    eq(transactions.userId, filter.userId),
    ne(transactions.status, "cancelled"),
    eq(transactions.direction, filter.direction),
    gte(transactions.dueDate, filter.from),
    lt(transactions.dueDate, filter.to),
  );
}
