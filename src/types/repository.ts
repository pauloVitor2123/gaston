import type { Payable } from "@/services/payment/payment.service";
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
  NewPaymentEvent,
  NewPendingConversation,
  NewRecurringBill,
  NewTransaction,
  NewUser,
  PaymentEvent,
  PendingConversation,
  RecurringBill,
  Transaction,
  User,
} from "@/db/schema";

export interface IUserRepository {
  findByChatId(telegramChatId: number): Promise<User | null>;
  create(data: NewUser): Promise<User>;
  setBalance(userId: number, balanceCents: number, at: Date): Promise<void>;
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

export type TransactionSettlementPatch = Partial<
  Pick<Transaction, "status" | "actualAmountCents" | "settledAt">
>;

export interface SpendingFilter {
  userId: number;
  from: Date;
  to: Date;
  direction: "in" | "out";
}

export interface SpendingRow {
  label: string | null;
  amountCents: number;
}

export type CardInvoiceSettlementPatch = Partial<
  Pick<CardInvoice, "status" | "paidAmountCents" | "paidAt">
>;

export interface ITransactionRepository {
  create(data: NewTransaction): Promise<Transaction>;
  findLastByUser(userId: number, limit: number): Promise<Transaction[]>;
  findById(userId: number, id: number): Promise<Transaction | null>;
  listPayable(userId: number): Promise<Transaction[]>;
  listByInvoice(userId: number, cardInvoiceId: number): Promise<Transaction[]>;
  listByRecurringBill(userId: number, recurringBillId: number): Promise<Transaction[]>;
  update(userId: number, id: number, patch: TransactionSettlementPatch): Promise<void>;
}

export interface ISpendingRepository {
  sumTotal(filter: SpendingFilter): Promise<number>;
  sumByCategory(filter: SpendingFilter): Promise<SpendingRow[]>;
  sumByMantra(filter: SpendingFilter): Promise<SpendingRow[]>;
  sumByCard(filter: SpendingFilter): Promise<SpendingRow[]>;
  sumByPaymentMethod(filter: SpendingFilter): Promise<SpendingRow[]>;
}

export interface IBalanceRepository {
  sumSettledSince(userId: number, direction: "in" | "out", since: Date): Promise<number>;
  sumPendingUntil(userId: number, direction: "in" | "out", until: Date): Promise<number>;
}

export interface IPayableLister {
  listPayables(userId: number): Promise<Payable[]>;
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
  findById(userId: number, id: number): Promise<CardInvoice | null>;
  update(userId: number, id: number, patch: CardInvoiceSettlementPatch): Promise<void>;
}

export interface IInstallmentPurchaseRepository {
  create(data: NewInstallmentPurchase): Promise<InstallmentPurchase>;
}

export interface IRecurringBillRepository {
  create(data: NewRecurringBill): Promise<RecurringBill>;
  listActive(userId: number): Promise<RecurringBill[]>;
  findById(userId: number, id: number): Promise<RecurringBill | null>;
  deactivate(userId: number, id: number): Promise<void>;
}

export interface IPendingConversationRepository {
  findActiveByUser(userId: number, now: Date): Promise<PendingConversation | null>;
  create(data: NewPendingConversation): Promise<PendingConversation>;
  update(id: number, stateJson: Record<string, unknown>): Promise<PendingConversation>;
  delete(id: number): Promise<boolean>;
}

export interface IPaymentEventRepository {
  create(data: NewPaymentEvent): Promise<PaymentEvent>;
  findById(userId: number, id: number): Promise<PaymentEvent | null>;
  listRecentByUser(userId: number, limit: number): Promise<PaymentEvent[]>;
  listByTarget(
    userId: number,
    targetType: PaymentEvent["targetType"],
    targetId: number,
  ): Promise<PaymentEvent[]>;
  void(id: number, at: Date): Promise<void>;
}
