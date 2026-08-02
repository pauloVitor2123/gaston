import { and, desc, eq, ne } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { type NewTransaction, type Transaction, transactions } from "@/db/schema";
import type { ITransactionRepository, TransactionSettlementPatch } from "@/types/repository";

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

  async listPayable(userId: number): Promise<Transaction[]> {
    return this.db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          eq(transactions.status, "pending"),
          ne(transactions.paymentMethod, "card"),
        ),
      )
      .orderBy(transactions.dueDate);
  }

  async listByInvoice(userId: number, cardInvoiceId: number): Promise<Transaction[]> {
    return this.db
      .select()
      .from(transactions)
      .where(and(eq(transactions.userId, userId), eq(transactions.cardInvoiceId, cardInvoiceId)));
  }

  async listByRecurringBill(userId: number, recurringBillId: number): Promise<Transaction[]> {
    return this.db
      .select()
      .from(transactions)
      .where(and(eq(transactions.userId, userId), eq(transactions.recurringBillId, recurringBillId)))
      .orderBy(transactions.dueDate);
  }

  async update(
    userId: number,
    id: number,
    patch: TransactionSettlementPatch,
  ): Promise<void> {
    await this.db
      .update(transactions)
      .set(patch)
      .where(and(eq(transactions.id, id), eq(transactions.userId, userId)));
  }
}
