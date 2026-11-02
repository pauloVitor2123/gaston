import { and, eq } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { type NewWeeklyInsight, type WeeklyInsight, weeklyInsights } from "@/db/schema";
import type { IWeeklyInsightRepository } from "@/types/repository";

export class WeeklyInsightRepository implements IWeeklyInsightRepository {
  constructor(private readonly db: DrizzleD1Database) {}

  async findByWeek(userId: number, weekStart: Date): Promise<WeeklyInsight | null> {
    const [row] = await this.db
      .select()
      .from(weeklyInsights)
      .where(and(eq(weeklyInsights.userId, userId), eq(weeklyInsights.weekStart, weekStart)));
    return row ?? null;
  }

  async save(data: NewWeeklyInsight): Promise<void> {
    await this.db
      .insert(weeklyInsights)
      .values(data)
      .onConflictDoUpdate({
        target: [weeklyInsights.userId, weeklyInsights.weekStart],
        set: { fingerprint: data.fingerprint, content: data.content, createdAt: new Date() },
      });
  }
}
