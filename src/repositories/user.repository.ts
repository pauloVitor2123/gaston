import { eq } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { type NewUser, type User, users } from "../db/schema";
import type { IUserRepository } from "../types/repository";

export class UserRepository implements IUserRepository {
  constructor(private readonly db: DrizzleD1Database) {}

  async findByChatId(telegramChatId: number): Promise<User | null> {
    const [row] = await this.db
      .select()
      .from(users)
      .where(eq(users.telegramChatId, telegramChatId))
      .limit(1);
    return row ?? null;
  }

  async create(data: NewUser): Promise<User> {
    const [row] = await this.db.insert(users).values(data).returning();
    if (!row) throw new Error("Falha ao criar usuário");
    return row;
  }
}
