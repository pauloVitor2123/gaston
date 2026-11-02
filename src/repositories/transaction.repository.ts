import { and, count, eq, ne } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { type NewTransaction, type Transaction, transactions } from "@/db/schema";
import type { BatchCancellation, ITransactionRepository } from "@/types/repository";

export class TransactionRepository implements ITransactionRepository {
  constructor(private readonly db: DrizzleD1Database) {}

  async create(data: NewTransaction): Promise<Transaction> {
    const [row] = await this.db.insert(transactions).values(data).returning();
    if (!row) throw new Error("Failed to create transaction");
    return row;
  }

  async cancelBatch(userId: number, batchId: string): Promise<BatchCancellation> {
    const inBatch = and(eq(transactions.userId, userId), eq(transactions.batchId, batchId));
    const [found] = await this.db.select({ total: count() }).from(transactions).where(inBatch);
    const cancelled = await this.db
      .update(transactions)
      .set({ status: "cancelled" })
      .where(and(inBatch, ne(transactions.status, "cancelled")))
      .returning({ id: transactions.id });
    return { total: found?.total ?? 0, cancelled: cancelled.length };
  }
}
