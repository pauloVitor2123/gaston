import type {
  Card,
  CardInvoice,
  Category,
  InstallmentPurchase,
  Mantra,
  NewCard,
  NewCardInvoice,
  NewCategory,
  NewInstallmentPurchase,
  NewMantra,
  NewPendingConversation,
  NewRecurringBill,
  NewTransaction,
  NewUser,
  PendingConversation,
  RecurringBill,
  Transaction,
  User,
} from "@/db/schema";

export interface IUserRepository {
  findByChatId(telegramChatId: number): Promise<User | null>;
  create(data: NewUser): Promise<User>;
}

export interface ICardRepository {
  create(data: NewCard): Promise<Card>;
  listByUser(userId: number): Promise<Card[]>;
  findByNameOrAlias(userId: number, term: string): Promise<Card | null>;
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

export interface ITransactionRepository {
  create(data: NewTransaction): Promise<Transaction>;
  findLastByUser(userId: number, limit: number): Promise<Transaction[]>;
  findById(userId: number, id: number): Promise<Transaction | null>;
}

export interface ICardInvoiceRepository {
  findOrCreate(
    userId: number,
    cardId: number,
    cycleStart: Date,
    cycleEnd: Date,
    dueDate: Date,
  ): Promise<CardInvoice>;
  listOpen(userId: number): Promise<CardInvoice[]>;
}

export interface IInstallmentPurchaseRepository {
  create(data: NewInstallmentPurchase): Promise<InstallmentPurchase>;
}

export interface IRecurringBillRepository {
  create(data: NewRecurringBill): Promise<RecurringBill>;
  listActive(userId: number): Promise<RecurringBill[]>;
}

export interface IPendingConversationRepository {
  findActiveByUser(userId: number): Promise<PendingConversation | null>;
  create(data: NewPendingConversation): Promise<PendingConversation>;
  update(id: number, stateJson: Record<string, unknown>): Promise<PendingConversation>;
  delete(id: number): Promise<void>;
}
