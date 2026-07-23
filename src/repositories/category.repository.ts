import { eq } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { type Category, categories, type NewCategory } from "@/db/schema";
import type { ICategoryRepository } from "@/types/repository";

export class CategoryRepository implements ICategoryRepository {
  constructor(private readonly db: DrizzleD1Database) {}

  async create(data: NewCategory): Promise<Category> {
    const [row] = await this.db.insert(categories).values(data).returning();
    if (!row) throw new Error("Failed to create category");
    return row;
  }

  async listByUser(userId: number): Promise<Category[]> {
    return this.db.select().from(categories).where(eq(categories.userId, userId));
  }

  async findByNameOrSynonym(userId: number, term: string): Promise<Category | null> {
    const normalized = term.trim().toLowerCase();
    const all = await this.listByUser(userId);
    return (
      all.find(
        (c) =>
          c.name.toLowerCase() === normalized ||
          c.synonyms.some((s) => s.toLowerCase() === normalized),
      ) ?? null
    );
  }
}
