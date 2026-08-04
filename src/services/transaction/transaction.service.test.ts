import { describe, expect, it, vi } from "vitest";
import type {
  ICardInvoiceRepository,
  ICardRepository,
  ICategoryRepository,
  IMantraRepository,
  ITransactionRepository,
} from "@/types/repository";
import { TransactionService, type TransactionInput } from "@/services/transaction/transaction.service";
import type { Card, CardInvoice, Category, Mantra, Transaction } from "@/db/schema";

const userId = 1;

const mockCategory = { id: 10, userId, name: "Alimentação", synonyms: [] } as Category;
const mockCard = {
  id: 20,
  userId,
  name: "Nubank",
  aliases: [],
  brand: "Mastercard",
  closingDay: 13,
  dueDay: 20,
  limitCents: null,
  isActive: true,
  createdAt: new Date(),
} as Card;
const mockMantra = { id: 30, userId, name: "Pagas as Contas", targetPercent: 0.45 } as Mantra;
const mockInvoice = {
  id: 40,
  userId,
  cardId: 20,
  cycleStart: new Date("2025-01-14"),
  cycleEnd: new Date("2025-02-13"),
  dueDate: new Date("2025-02-20"),
  status: "open",
  paidAmountCents: null,
  paidAt: null,
} as CardInvoice;
const mockTransaction = { id: 1, userId } as Transaction;

const baseResult: TransactionInput = {
  description: "almoço",
  amount_cents: 3500,
  date: "2025-01-15",
  payment_method: "card",
  card_name: "Nubank",
  category_name: "Alimentação",
  direction: "out",
  mantra: "Pagas as Contas",
};

function makeRepos(
  overrides: Partial<{
    findByNameOrSynonym: () => Promise<Category | null>;
    findByNameOrAlias: () => Promise<Card | null>;
    findByName: () => Promise<Mantra | null>;
    findOrCreate: () => Promise<CardInvoice>;
    create: () => Promise<Transaction>;
  }> = {},
) {
  return {
    categoryRepo: {
      create: vi.fn(),
      listByUser: vi.fn(),
      findByNameOrSynonym: vi.fn().mockImplementation(overrides.findByNameOrSynonym ?? (() => Promise.resolve(mockCategory))),
    } as unknown as ICategoryRepository,
    cardRepo: {
      create: vi.fn(),
      listByUser: vi.fn(),
      findByNameOrAlias: vi.fn().mockImplementation(overrides.findByNameOrAlias ?? (() => Promise.resolve(mockCard))),
    } as unknown as ICardRepository,
    mantraRepo: {
      create: vi.fn(),
      listByUser: vi.fn(),
      findByName: vi.fn().mockImplementation(overrides.findByName ?? (() => Promise.resolve(mockMantra))),
    } as unknown as IMantraRepository,
    transactionRepo: {
      create: vi.fn().mockImplementation(overrides.create ?? (() => Promise.resolve(mockTransaction))),
      findLastByUser: vi.fn(),
      findById: vi.fn(),
    } as unknown as ITransactionRepository,
    cardInvoiceRepo: {
      findOrCreate: vi.fn().mockImplementation(overrides.findOrCreate ?? (() => Promise.resolve(mockInvoice))),
      listOpen: vi.fn(),
    } as unknown as ICardInvoiceRepository,
  };
}

function makeService(overrides = {}) {
  const repos = makeRepos(overrides);
  const service = new TransactionService(
    repos.categoryRepo,
    repos.cardRepo,
    repos.mantraRepo,
    repos.transactionRepo,
    repos.cardInvoiceRepo,
  );
  return { service, repos };
}

describe("TransactionService.persist", () => {
  it("resolves category, card, and mantra by name", async () => {
    const { service, repos } = makeService();
    await service.persist(baseResult, userId, "raw");

    expect(repos.categoryRepo.findByNameOrSynonym).toHaveBeenCalledWith(userId, "Alimentação");
    expect(repos.cardRepo.findByNameOrAlias).toHaveBeenCalledWith(userId, "Nubank");
    expect(repos.mantraRepo.findByName).toHaveBeenCalledWith(userId, "Pagas as Contas");
  });

  it("creates card invoice for card payment and passes computed due_date as dueDate", async () => {
    const { service, repos } = makeService();
    await service.persist(baseResult, userId, "raw");

    expect(repos.cardInvoiceRepo.findOrCreate).toHaveBeenCalledOnce();
    const created = (repos.transactionRepo.create as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(created.cardInvoiceId).toBe(40);
    // purchase Jan 15 > closingDay 13 → due date is month+2, day 20 = Mar 20
    expect(created.dueDate).toEqual(new Date("2025-03-20"));
  });

  it("skips card invoice for non-card payment", async () => {
    const { service, repos } = makeService();
    const result: TransactionInput = { ...baseResult, payment_method: "pix", card_name: undefined };
    await service.persist(result, userId, "raw");

    expect(repos.cardInvoiceRepo.findOrCreate).not.toHaveBeenCalled();
    const created = (repos.transactionRepo.create as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(created.cardId).toBeUndefined();
    expect(created.cardInvoiceId).toBeUndefined();
  });

  it("sets categoryId and mantraId to undefined when not found in DB", async () => {
    const { service, repos } = makeService({
      findByNameOrSynonym: () => Promise.resolve(null),
      findByName: () => Promise.resolve(null),
    });
    await service.persist(baseResult, userId, "raw");

    const created = (repos.transactionRepo.create as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(created.categoryId).toBeUndefined();
    expect(created.mantraId).toBeUndefined();
  });

  it("defaults paymentMethod to 'cash' when not provided", async () => {
    const { service, repos } = makeService();
    const result: TransactionInput = { ...baseResult, payment_method: undefined };
    await service.persist(result, userId, "raw");

    const created = (repos.transactionRepo.create as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(created.paymentMethod).toBe("cash");
  });

  it("defaults accrualDate to today's UTC midnight when result.date is absent", async () => {
    const { service, repos } = makeService();
    const result: TransactionInput = { ...baseResult, date: undefined, payment_method: "pix" };
    await service.persist(result, userId, "raw");

    const now = new Date();
    const todayUtcMidnight = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const created = (repos.transactionRepo.create as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(created.accrualDate).toEqual(todayUtcMidnight);
  });

  it("stores rawMessage and source=user in the transaction", async () => {
    const { service, repos } = makeService();
    await service.persist(baseResult, userId, "almoço 35 reais nubank");

    const created = (repos.transactionRepo.create as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(created.rawMessage).toBe("almoço 35 reais nubank");
    expect(created.source).toBe("user");
    expect(created.status).toBe("pending");
  });
});

describe("TransactionService.persist — settled vs pending", () => {
  const cashPast: TransactionInput = {
    ...baseResult,
    payment_method: "pix",
    card_name: undefined,
    date: "2025-01-15",
  };

  it("settles a cash/pix expense that already happened", async () => {
    const { service, repos } = makeService();
    await service.persist(cashPast, userId, "raw");

    const created = (repos.transactionRepo.create as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(created.status).toBe("settled");
    expect(created.settledAt).toBeInstanceOf(Date);
    expect(created.actualAmountCents).toBe(3500);
  });

  it("keeps a future obligation pending and uses due_date as dueDate", async () => {
    const { service, repos } = makeService();
    const result: TransactionInput = { ...cashPast, due_date: "2099-12-31", already_paid: false };
    await service.persist(result, userId, "raw");

    const created = (repos.transactionRepo.create as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(created.status).toBe("pending");
    expect(created.dueDate).toEqual(new Date(Date.UTC(2099, 11, 31)));
    expect(created.settledAt ?? null).toBeNull();
  });

  it("settles when already_paid is true even with a future due_date", async () => {
    const { service, repos } = makeService();
    const result: TransactionInput = { ...cashPast, due_date: "2099-12-31", already_paid: true };
    await service.persist(result, userId, "raw");

    const created = (repos.transactionRepo.create as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(created.status).toBe("settled");
  });

  it("stays pending for a card purchase regardless of already_paid", async () => {
    const { service, repos } = makeService();
    await service.persist({ ...baseResult, already_paid: true }, userId, "raw");

    const created = (repos.transactionRepo.create as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(created.status).toBe("pending");
  });
});
