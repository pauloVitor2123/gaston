import { and, desc, eq, isNull } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { type NewPaymentEvent, type PaymentEvent, paymentEvents } from "@/db/schema";
import type { IPaymentEventRepository } from "@/types/repository";

export class PaymentEventRepository implements IPaymentEventRepository {
  constructor(private readonly db: DrizzleD1Database) {}

  async create(data: NewPaymentEvent): Promise<PaymentEvent> {
    const [row] = await this.db.insert(paymentEvents).values(data).returning();
    if (!row) throw new Error("Failed to create payment event");
    return row;
  }

  async findById(userId: number, id: number): Promise<PaymentEvent | null> {
    const [row] = await this.db
      .select()
      .from(paymentEvents)
      .where(and(eq(paymentEvents.userId, userId), eq(paymentEvents.id, id)))
      .limit(1);
    return row ?? null;
  }

  async listRecentByUser(userId: number, limit: number): Promise<PaymentEvent[]> {
    return this.db
      .select()
      .from(paymentEvents)
      .where(and(eq(paymentEvents.userId, userId), isNull(paymentEvents.voidedAt)))
      .orderBy(desc(paymentEvents.paidAt), desc(paymentEvents.id))
      .limit(limit);
  }

  async listByTarget(
    userId: number,
    targetType: PaymentEvent["targetType"],
    targetId: number,
  ): Promise<PaymentEvent[]> {
    return this.db
      .select()
      .from(paymentEvents)
      .where(
        and(
          eq(paymentEvents.userId, userId),
          eq(paymentEvents.targetType, targetType),
          eq(paymentEvents.targetId, targetId),
          isNull(paymentEvents.voidedAt),
        ),
      );
  }

  async void(id: number, at: Date): Promise<void> {
    await this.db
      .update(paymentEvents)
      .set({ voidedAt: at })
      .where(eq(paymentEvents.id, id));
  }
}
