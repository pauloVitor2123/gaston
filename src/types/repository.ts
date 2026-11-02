import type {
  Category,
  Mantra,
  NewCategory,
  NewMantra,
  NewPendingConversation,
  NewTransaction,
  NewUser,
  PendingConversation,
  Transaction,
  User,
} from "@/db/schema";

export interface IUserRepository {
  findByChatId(telegramChatId: number): Promise<User | null>;
  create(data: NewUser): Promise<User>;
}

export interface ICategoryRepository {
  create(data: NewCategory): Promise<Category>;
  listByUser(userId: number): Promise<Category[]>;
  findByNameOrSynonym(userId: number, term: string): Promise<Category | null>;
}

export interface IMantraRepository {
  create(data: NewMantra): Promise<Mantra>;
  listByUser(userId: number): Promise<Mantra[]>;
  findByName(userId: number, name: string): Promise<Mantra | null>;
}

export interface SpendingFilter {
  userId: number;
  from: Date;
  to: Date;
}

export interface CategorySubSpendingRow {
  categoryLabel: string | null;
  subcategoryLabel: string | null;
  amountCents: number;
}

export interface ITransactionRepository {
  create(data: NewTransaction): Promise<Transaction>;
}

export interface ISpendingRepository {
  sumTotal(filter: SpendingFilter): Promise<number>;
  sumByCategoryTree(filter: SpendingFilter): Promise<CategorySubSpendingRow[]>;
}

export interface IPendingConversationRepository {
  findActiveByUser(userId: number, now: Date): Promise<PendingConversation | null>;
  create(data: NewPendingConversation): Promise<PendingConversation>;
  update(id: number, stateJson: Record<string, unknown>): Promise<PendingConversation>;
  delete(id: number): Promise<boolean>;
}
