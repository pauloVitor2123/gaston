import { eq } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { type Mantra, mantras, type NewMantra } from "@/db/schema";
import type { IMantraRepository } from "@/types/repository";

export class MantraRepository implements IMantraRepository {
  constructor(private readonly db: DrizzleD1Database) {}

  async create(data: NewMantra): Promise<Mantra> {
    const [row] = await this.db.insert(mantras).values(data).returning();
    if (!row) throw new Error("Failed to create mantra");
    return row;
  }

  async listByUser(userId: number): Promise<Mantra[]> {
    return this.db.select().from(mantras).where(eq(mantras.userId, userId));
  }

  async findByName(userId: number, name: string): Promise<Mantra | null> {
    const normalized = name.trim().toLowerCase();
    const all = await this.listByUser(userId);
    return all.find((m) => m.name.toLowerCase() === normalized) ?? null;
  }
}
