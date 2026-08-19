import { describe, expect, it, vi } from "vitest";
import type {
  ICategoryRepository,
  IMantraRepository,
  ITransactionRepository,
} from "@/types/repository";
import { TransactionService, type TransactionInput } from "@/services/transaction/transaction.service";
import { FixedClock } from "@/services/clock";
import type { Category, Mantra, Transaction } from "@/db/schema";

const userId = 1;
const NOW = new Date("2025-01-20T12:00:00.000Z");
const TODAY = new Date(Date.UTC(2025, 0, 20));

const mockCategory = { id: 10, userId, name: "Alimentação", synonyms: [] } as Category;
const mockMantra = { id: 30, userId, name: "Pagas as Contas", targetPercent: 0.45 } as Mantra;
const mockTransaction = { id: 1, userId } as Transaction;

const baseInput: TransactionInput = {
  description: "almoço",
  amount_cents: 3500,
  date: "2025-01-15",
  category_name: "Alimentação",
  mantra: "Pagas as Contas",
};

function makeRepos(
  overrides: Partial<{
    findByNameOrSynonym: () => Promise<Category | null>;
    findByName: () => Promise<Mantra | null>;
    create: () => Promise<Transaction>;
  }> = {},
) {
  return {
    categoryRepo: {
      create: vi.fn(),
      listByUser: vi.fn(),
      findByNameOrSynonym: vi
        .fn()
        .mockImplementation(overrides.findByNameOrSynonym ?? (() => Promise.resolve(mockCategory))),
    } as unknown as ICategoryRepository,
    mantraRepo: {
      create: vi.fn(),
      listByUser: vi.fn(),
      findByName: vi.fn().mockImplementation(overrides.findByName ?? (() => Promise.resolve(mockMantra))),
    } as unknown as IMantraRepository,
    transactionRepo: {
      create: vi.fn().mockImplementation(overrides.create ?? (() => Promise.resolve(mockTransaction))),
    } as unknown as ITransactionRepository,
  };
}

function makeService(overrides = {}) {
  const repos = makeRepos(overrides);
  const service = new TransactionService(
    repos.categoryRepo,
    repos.mantraRepo,
    repos.transactionRepo,
    new FixedClock(NOW),
  );
  return { service, repos };
}

function created(repos: ReturnType<typeof makeRepos>) {
  return (repos.transactionRepo.create as ReturnType<typeof vi.fn>).mock.calls[0]![0];
}

describe("TransactionService.persist", () => {
  it("resolves category and mantra by name", async () => {
    const { service, repos } = makeService();
    await service.persist(baseInput, userId, "raw", TODAY);

    expect(repos.categoryRepo.findByNameOrSynonym).toHaveBeenCalledWith(userId, "Alimentação");
    expect(repos.mantraRepo.findByName).toHaveBeenCalledWith(userId, "Pagas as Contas");
    const row = created(repos);
    expect(row.categoryId).toBe(10);
    expect(row.mantraId).toBe(30);
  });

  it("records a settled cash expense with accrualDate = dueDate", async () => {
    const { service, repos } = makeService();
    await service.persist(baseInput, userId, "raw", TODAY);

    const row = created(repos);
    expect(row.direction).toBe("out");
    expect(row.status).toBe("settled");
    expect(row.paymentMethod).toBe("cash");
    expect(row.settledAt).toEqual(NOW);
    expect(row.actualAmountCents).toBe(3500);
    expect(row.accrualDate).toEqual(new Date(Date.UTC(2025, 0, 15)));
    expect(row.dueDate).toEqual(new Date(Date.UTC(2025, 0, 15)));
  });

  it("defaults accrualDate to the injected today when date is absent", async () => {
    const { service, repos } = makeService();
    await service.persist({ ...baseInput, date: undefined }, userId, "raw", TODAY);

    expect(created(repos).accrualDate).toEqual(TODAY);
  });

  it("leaves categoryId and mantraId undefined when not found", async () => {
    const { service, repos } = makeService({
      findByNameOrSynonym: () => Promise.resolve(null),
      findByName: () => Promise.resolve(null),
    });
    await service.persist(baseInput, userId, "raw", TODAY);

    const row = created(repos);
    expect(row.categoryId).toBeUndefined();
    expect(row.mantraId).toBeUndefined();
  });

  it("leaves category lookup unused when no category_name is provided", async () => {
    const { service, repos } = makeService();
    await service.persist({ ...baseInput, category_name: undefined }, userId, "raw", TODAY);

    expect(repos.categoryRepo.findByNameOrSynonym).not.toHaveBeenCalled();
    expect(created(repos).categoryId).toBeUndefined();
  });

  it("stores rawMessage and source=user", async () => {
    const { service, repos } = makeService();
    await service.persist(baseInput, userId, "almoço 35 padaria", TODAY);

    const row = created(repos);
    expect(row.rawMessage).toBe("almoço 35 padaria");
    expect(row.source).toBe("user");
  });
});
