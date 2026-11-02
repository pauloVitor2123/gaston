import { eq } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { type NewPlatform, type Platform, platforms } from "@/db/schema";
import type { IPlatformRepository } from "@/types/repository";

export class PlatformRepository implements IPlatformRepository {
  constructor(private readonly db: DrizzleD1Database) {}

  async create(data: NewPlatform): Promise<Platform> {
    const [row] = await this.db.insert(platforms).values(data).returning();
    if (!row) throw new Error("Failed to create platform");
    return row;
  }

  async listByUser(userId: number): Promise<Platform[]> {
    return this.db.select().from(platforms).where(eq(platforms.userId, userId));
  }
}
