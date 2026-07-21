import { eq } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { type Card, cards, type NewCard } from "@/db/schema";
import type { ICardRepository } from "@/types/repository";

export class CardRepository implements ICardRepository {
  constructor(private readonly db: DrizzleD1Database) {}

  async create(data: NewCard): Promise<Card> {
    const [row] = await this.db.insert(cards).values(data).returning();
    if (!row) throw new Error("Falha ao criar cartão");
    return row;
  }

  async listByUser(userId: number): Promise<Card[]> {
    return this.db.select().from(cards).where(eq(cards.userId, userId));
  }

  async findByNameOrAlias(userId: number, term: string): Promise<Card | null> {
    const normalized = term.trim().toLowerCase();
    const all = await this.listByUser(userId);
    const match = all.find(
      (c) =>
        c.name.toLowerCase() === normalized ||
        c.aliases.some((alias) => alias.toLowerCase() === normalized),
    );
    return match ?? null;
  }
}
