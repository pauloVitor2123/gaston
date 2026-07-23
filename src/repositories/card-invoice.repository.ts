import { and, eq } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { type CardInvoice, cardInvoices } from "@/db/schema";
import type { ICardInvoiceRepository } from "@/types/repository";

export class CardInvoiceRepository implements ICardInvoiceRepository {
  constructor(private readonly db: DrizzleD1Database) {}

  async findOrCreate(
    userId: number,
    cardId: number,
    cycleStart: Date,
    cycleEnd: Date,
    dueDate: Date,
  ): Promise<CardInvoice> {
    const [existing] = await this.db
      .select()
      .from(cardInvoices)
      .where(
        and(
          eq(cardInvoices.userId, userId),
          eq(cardInvoices.cardId, cardId),
          eq(cardInvoices.cycleStart, cycleStart),
        ),
      )
      .limit(1);
    if (existing) return existing;

    const [created] = await this.db
      .insert(cardInvoices)
      .values({ userId, cardId, cycleStart, cycleEnd, dueDate })
      .returning();
    if (!created) throw new Error("Failed to create card invoice");
    return created;
  }

  async listOpen(userId: number): Promise<CardInvoice[]> {
    return this.db
      .select()
      .from(cardInvoices)
      .where(and(eq(cardInvoices.userId, userId), eq(cardInvoices.status, "open")));
  }
}
