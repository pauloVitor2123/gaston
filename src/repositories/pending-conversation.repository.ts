import { and, eq, gt } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { type NewPendingConversation, type PendingConversation, pendingConversations } from "@/db/schema";
import type { IPendingConversationRepository } from "@/types/repository";

export class PendingConversationRepository implements IPendingConversationRepository {
  constructor(private readonly db: DrizzleD1Database) {}

  async findActiveByUser(userId: number, now: Date): Promise<PendingConversation | null> {
    const [row] = await this.db
      .select()
      .from(pendingConversations)
      .where(
        and(
          eq(pendingConversations.userId, userId),
          gt(pendingConversations.expiresAt, now),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async create(data: NewPendingConversation): Promise<PendingConversation> {
    const [row] = await this.db.insert(pendingConversations).values(data).returning();
    if (!row) throw new Error("Failed to create pending conversation");
    return row;
  }

  async update(id: number, stateJson: Record<string, unknown>): Promise<PendingConversation> {
    const [row] = await this.db
      .update(pendingConversations)
      .set({ stateJson })
      .where(eq(pendingConversations.id, id))
      .returning();
    if (!row) throw new Error("Failed to update pending conversation");
    return row;
  }

  async delete(id: number): Promise<boolean> {
    const deleted = await this.db
      .delete(pendingConversations)
      .where(eq(pendingConversations.id, id))
      .returning({ id: pendingConversations.id });
    return deleted.length > 0;
  }
}
