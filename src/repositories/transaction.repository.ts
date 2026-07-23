import { and, desc, eq } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { type NewTransaction, type Transaction, transactions } from "@/db/schema";
import type { ITransactionRepository } from "@/types/repository";

export class TransactionRepository implements ITransactionRepository {
  constructor(private readonly db: DrizzleD1Database) {}

  async create(data: NewTransaction): Promise<Transaction> {
    const [row] = await this.db.insert(transactions).values(data).returning();
    if (!row) throw new Error("Failed to create transaction");
    return row;
  }

  async findLastByUser(userId: number, limit: number): Promise<Transaction[]> {
    return this.db
      .select()
      .from(transactions)
      .where(eq(transactions.userId, userId))
      .orderBy(desc(transactions.accrualDate))
      .limit(limit);
  }

  async findById(userId: number, id: number): Promise<Transaction | null> {
    const [row] = await this.db
      .select()
      .from(transactions)
      .where(and(eq(transactions.id, id), eq(transactions.userId, userId)))
      .limit(1);
    return row ?? null;
  }
}
