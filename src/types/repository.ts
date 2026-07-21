import type { Card, NewCard, NewUser, User } from "@/db/schema";

// Interfaces dos repositórios (constructor injection nos services).
// Abstração sobre o acesso a dados: services dependem destas interfaces, não do Drizzle.

export interface IUserRepository {
  findByChatId(telegramChatId: number): Promise<User | null>;
  create(data: NewUser): Promise<User>;
}

export interface ICardRepository {
  create(data: NewCard): Promise<Card>;
  listByUser(userId: number): Promise<Card[]>;
  findByNameOrAlias(userId: number, term: string): Promise<Card | null>;
}
