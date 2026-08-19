import { and, eq, gte, lt, sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { transactions } from "@/db/schema";
import type { IBalanceRepository } from "@/types/repository";

type Direction = "in" | "out";

function amount() {
  return sql<number>`coalesce(sum(coalesce(${transactions.actualAmountCents}, ${transactions.expectedAmountCents})), 0)`;
}

export class BalanceRepository implements IBalanceRepository {
  constructor(private readonly db: DrizzleD1Database) {}

  async sumSettledSince(userId: number, direction: Direction, since: Date): Promise<number> {
    const [row] = await this.db
      .select({ total: amount() })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          eq(transactions.direction, direction),
          eq(transactions.status, "settled"),
          gte(transactions.settledAt, since),
        ),
      );
    return row?.total ?? 0;
  }

  async sumPendingUntil(userId: number, direction: Direction, until: Date): Promise<number> {
    const [row] = await this.db
      .select({ total: amount() })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          eq(transactions.direction, direction),
          eq(transactions.status, "pending"),
          lt(transactions.dueDate, until),
        ),
      );
    return row?.total ?? 0;
  }
}
