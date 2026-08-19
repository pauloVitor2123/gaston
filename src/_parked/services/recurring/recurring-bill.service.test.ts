import { describe, expect, it, vi } from "vitest";
import type {
  ICategoryRepository,
  IMantraRepository,
  IRecurringBillRepository,
  ITransactionRepository,
} from "@/types/repository";
import { RecurringBillService, type RecurringBillInput } from "@/services/recurring/recurring-bill.service";
import type { Category, Mantra, RecurringBill } from "@/db/schema";

const userId = 1;
const mockCategory = { id: 10, userId, name: "Moradia", synonyms: [] } as Category;
const mockMantra = { id: 30, userId, name: "Pagas as Contas", targetPercent: 0.45 } as Mantra;

const createdBill: RecurringBill = {
  id: 5,
  userId,
  description: "Internet",
  kind: "fixed",
  expectedAmountCents: 29900,
  dueDay: 15,
  chargeDay: null,
  paymentMethod: "pix",
  cardId: null,
  categoryId: 10,
  mantraId: 30,
  isActive: true,
} as RecurringBill;

function makeService() {
  const repos = {
    categoryRepo: {
      create: vi.fn(),
      listByUser: vi.fn(),
      findByNameOrSynonym: vi.fn().mockResolvedValue(mockCategory),
    } as unknown as ICategoryRepository,
    mantraRepo: {
      create: vi.fn(),
      listByUser: vi.fn(),
      findByName: vi.fn().mockResolvedValue(mockMantra),
    } as unknown as IMantraRepository,
    recurringBillRepo: {
      create: vi.fn().mockResolvedValue(createdBill),
      listActive: vi.fn(),
      findById: vi.fn(),
      deactivate: vi.fn(),
    } as unknown as IRecurringBillRepository,
    transactionRepo: {
      create: vi.fn().mockResolvedValue({ id: 99 }),
    } as unknown as ITransactionRepository,
  };
  const service = new RecurringBillService(
    repos.categoryRepo,
    repos.mantraRepo,
    repos.recurringBillRepo,
    repos.transactionRepo,
  );
  return { service, repos };
}

const input: RecurringBillInput = {
  description: "Internet",
  amount_cents: 29900,
  due_day: 15,
  payment_method: "pix",
  category_name: "Moradia",
  mantra: "Pagas as Contas",
};

describe("RecurringBillService.create", () => {
  it("creates the template resolving category and mantra ids", async () => {
    const { service, repos } = makeService();
    await service.create(input, userId, new Date(Date.UTC(2026, 7, 1)));

    const bill = (repos.recurringBillRepo.create as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(bill).toMatchObject({
      userId,
      description: "Internet",
      expectedAmountCents: 29900,
      dueDay: 15,
      paymentMethod: "pix",
      categoryId: 10,
      mantraId: 30,
      isActive: true,
    });
  });

  it("materializes the first pending occurrence and reports its due date", async () => {
    const { service, repos } = makeService();
    const result = await service.create(input, userId, new Date(Date.UTC(2026, 7, 1)));

    expect(result.firstDueDate).toEqual(new Date(Date.UTC(2026, 7, 15)));
    const tx = (repos.transactionRepo.create as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(tx).toMatchObject({
      source: "recurring",
      recurringBillId: 5,
      status: "pending",
      dueDate: new Date(Date.UTC(2026, 7, 15)),
    });
  });
});
