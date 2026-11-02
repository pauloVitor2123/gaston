import { and, asc, count, eq, gte, lt, ne } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { type NewWorkLog, type WorkLog, workLogs } from "@/db/schema";
import type { BatchCancellation, IWorkLogRepository } from "@/types/repository";

export class WorkLogRepository implements IWorkLogRepository {
  constructor(private readonly db: DrizzleD1Database) {}

  async create(data: NewWorkLog): Promise<WorkLog> {
    const [row] = await this.db.insert(workLogs).values(data).returning();
    if (!row) throw new Error("Failed to create work log");
    return row;
  }

  async listActive(userId: number, from: Date, to: Date): Promise<WorkLog[]> {
    return this.db
      .select()
      .from(workLogs)
      .where(
        and(
          eq(workLogs.userId, userId),
          eq(workLogs.status, "active"),
          gte(workLogs.periodStart, from),
          lt(workLogs.periodStart, to),
        ),
      )
      .orderBy(asc(workLogs.id));
  }

  async cancelBatch(userId: number, batchId: string): Promise<BatchCancellation> {
    const inBatch = and(eq(workLogs.userId, userId), eq(workLogs.batchId, batchId));
    const [found] = await this.db.select({ total: count() }).from(workLogs).where(inBatch);
    const cancelled = await this.db
      .update(workLogs)
      .set({ status: "cancelled" })
      .where(and(inBatch, ne(workLogs.status, "cancelled")))
      .returning({ id: workLogs.id });
    return { total: found?.total ?? 0, cancelled: cancelled.length };
  }
}
