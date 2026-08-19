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
}
