import type {
  Category,
  Mantra,
  NewCategory,
  NewMantra,
  NewPendingConversation,
  NewPlatform,
  NewWorkLog,
  Platform,
  WorkLog,
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

export interface LabeledAmountRow {
  label: string | null;
  amountCents: number;
}

export interface DailyMoneyRow {
  date: Date;
  incomeCents: number;
  expenseCents: number;
}

export interface CategorySubSpendingRow {
  categoryLabel: string | null;
  subcategoryLabel: string | null;
  amountCents: number;
}

export interface BatchCancellation {
  total: number;
  cancelled: number;
}

export interface ITransactionRepository {
  create(data: NewTransaction): Promise<Transaction>;
  cancelBatch(userId: number, batchId: string): Promise<BatchCancellation>;
}

export interface IWorkLogRepository {
  create(data: NewWorkLog): Promise<WorkLog>;
  listActive(userId: number, from: Date, to: Date): Promise<WorkLog[]>;
  cancelBatch(userId: number, batchId: string): Promise<BatchCancellation>;
}

export interface IPlatformRepository {
  create(data: NewPlatform): Promise<Platform>;
  listByUser(userId: number): Promise<Platform[]>;
}

export interface ISpendingRepository {
  sumTotal(filter: SpendingFilter): Promise<number>;
  sumByCategoryTree(filter: SpendingFilter): Promise<CategorySubSpendingRow[]>;
  sumIncomeTotal(filter: SpendingFilter): Promise<number>;
  sumIncomeByPlatform(filter: SpendingFilter): Promise<LabeledAmountRow[]>;
  sumByDay(filter: SpendingFilter): Promise<DailyMoneyRow[]>;
}

export interface IPendingConversationRepository {
  findActiveByUser(userId: number, now: Date): Promise<PendingConversation | null>;
  create(data: NewPendingConversation): Promise<PendingConversation>;
  update(id: number, stateJson: Record<string, unknown>): Promise<PendingConversation>;
  delete(id: number): Promise<boolean>;
}
