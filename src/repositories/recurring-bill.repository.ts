import { and, eq } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { type NewRecurringBill, type RecurringBill, recurringBills } from "@/db/schema";
import type { IRecurringBillRepository } from "@/types/repository";

export class RecurringBillRepository implements IRecurringBillRepository {
  constructor(private readonly db: DrizzleD1Database) {}

  async create(data: NewRecurringBill): Promise<RecurringBill> {
    const [row] = await this.db.insert(recurringBills).values(data).returning();
    if (!row) throw new Error("Failed to create recurring bill");
    return row;
  }

  async listActive(userId: number): Promise<RecurringBill[]> {
    return this.db
      .select()
      .from(recurringBills)
      .where(and(eq(recurringBills.userId, userId), eq(recurringBills.isActive, true)));
  }

  async findById(userId: number, id: number): Promise<RecurringBill | null> {
    const [row] = await this.db
      .select()
      .from(recurringBills)
      .where(and(eq(recurringBills.userId, userId), eq(recurringBills.id, id)));
    return row ?? null;
  }

  async deactivate(userId: number, id: number): Promise<void> {
    await this.db
      .update(recurringBills)
      .set({ isActive: false })
      .where(and(eq(recurringBills.userId, userId), eq(recurringBills.id, id)));
  }
}
