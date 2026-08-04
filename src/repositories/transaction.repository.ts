import { and, desc, eq, gte, lt, ne, sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import {
  cards,
  categories,
  mantras,
  type NewTransaction,
  type Transaction,
  transactions,
} from "@/db/schema";
import type {
  ITransactionRepository,
  SpendingQuery,
  SpendingRow,
  TransactionSettlementPatch,
} from "@/types/repository";

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

  async sumByDimension(query: SpendingQuery): Promise<SpendingRow[]> {
    const { userId, groupBy, from, to, direction } = query;
    const amountCents = sql<number>`sum(coalesce(${transactions.actualAmountCents}, ${transactions.expectedAmountCents}))`;
    const where = and(
      eq(transactions.userId, userId),
      ne(transactions.status, "cancelled"),
      eq(transactions.direction, direction),
      gte(transactions.dueDate, from),
      lt(transactions.dueDate, to),
    );

    if (groupBy === "none") {
      const [row] = await this.db.select({ amountCents }).from(transactions).where(where);
      return row?.amountCents == null ? [] : [{ label: null, amountCents: row.amountCents }];
    }

    if (groupBy === "payment_method") {
      const rows = await this.db
        .select({ label: transactions.paymentMethod, amountCents })
        .from(transactions)
        .where(where)
        .groupBy(transactions.paymentMethod);
      return rows.map((r) => ({ label: r.label, amountCents: r.amountCents }));
    }

    const joined = {
      category: { name: categories.name, table: categories, on: eq(transactions.categoryId, categories.id), id: categories.id },
      mantra: { name: mantras.name, table: mantras, on: eq(transactions.mantraId, mantras.id), id: mantras.id },
      card: { name: cards.name, table: cards, on: eq(transactions.cardId, cards.id), id: cards.id },
    }[groupBy];

    const rows = await this.db
      .select({ label: joined.name, amountCents })
      .from(transactions)
      .leftJoin(joined.table, joined.on)
      .where(where)
      .groupBy(joined.id);
    return rows.map((r) => ({ label: r.label, amountCents: r.amountCents }));
  }
}
