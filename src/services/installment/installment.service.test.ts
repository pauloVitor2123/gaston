import { describe, expect, it, vi } from "vitest";
import type {
  ICardInvoiceRepository,
  ICardRepository,
  ICategoryRepository,
  IInstallmentPurchaseRepository,
  IMantraRepository,
  ITransactionRepository,
} from "@/types/repository";
import {
  InstallmentPurchaseNotAllowedError,
  InstallmentService,
  type InstallmentInput,
} from "@/services/installment/installment.service";
import type { Card, CardInvoice, Category, InstallmentPurchase, Mantra } from "@/db/schema";

const userId = 1;
const mockCategory = { id: 10, userId, name: "Casa", synonyms: [] } as Category;
const mockMantra = { id: 30, userId, name: "Pagas as Contas", targetPercent: 0.45 } as Mantra;
const mockCard = {
  id: 20,
  userId,
  name: "Nubank",
  aliases: [],
  brand: "Mastercard",
  closingDay: 13,
  dueDay: 20,
} as unknown as Card;
const mockPurchase = { id: 500, userId } as InstallmentPurchase;

function invoiceFixture(id: number): CardInvoice {
  return { id, userId, cardId: 20, status: "open" } as CardInvoice;
}

function makeService(cardResult: Card | null = mockCard) {
  let invoiceId = 40;
  const repos = {
    categoryRepo: {
      create: vi.fn(),
      listByUser: vi.fn(),
      findByNameOrSynonym: vi.fn().mockResolvedValue(mockCategory),
    } as unknown as ICategoryRepository,
    cardRepo: {
      create: vi.fn(),
      listByUser: vi.fn(),
      findByNameOrAlias: vi.fn().mockResolvedValue(cardResult),
    } as unknown as ICardRepository,
    mantraRepo: {
      create: vi.fn(),
      listByUser: vi.fn(),
      findByName: vi.fn().mockResolvedValue(mockMantra),
    } as unknown as IMantraRepository,
    installmentRepo: {
      create: vi.fn().mockResolvedValue(mockPurchase),
    } as unknown as IInstallmentPurchaseRepository,
    transactionRepo: {
      create: vi.fn().mockResolvedValue({ id: 1 }),
    } as unknown as ITransactionRepository,
    cardInvoiceRepo: {
      findOrCreate: vi.fn().mockImplementation(() => Promise.resolve(invoiceFixture(invoiceId++))),
    } as unknown as ICardInvoiceRepository,
  };
  const service = new InstallmentService(
    repos.categoryRepo,
    repos.cardRepo,
    repos.mantraRepo,
    repos.installmentRepo,
    repos.transactionRepo,
    repos.cardInvoiceRepo,
  );
  return { service, repos };
}

const input: InstallmentInput = {
  description: "Máquina de lavar",
  total_amount_cents: 366800,
  installments_count: 5,
  card_name: "Nubank",
  category_name: "Casa",
  mantra: "Pagas as Contas",
  date: "2026-01-15",
};

describe("InstallmentService.create", () => {
  it("creates the parent purchase with card and total", async () => {
    const { service, repos } = makeService();
    await service.create(input, userId);

    const parent = (repos.installmentRepo.create as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(parent).toMatchObject({
      totalAmountCents: 366800,
      installmentsCount: 5,
      cardId: 20,
      categoryId: 10,
      mantraId: 30,
      direction: "out",
    });
  });

  it("generates N child transactions across consecutive invoices", async () => {
    const { service, repos } = makeService();
    await service.create(input, userId);

    const calls = (repos.transactionRepo.create as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls).toHaveLength(5);
    const first = calls[0]![0];
    expect(first).toMatchObject({
      description: "Máquina de lavar (1/5)",
      expectedAmountCents: 73360,
      source: "installment",
      installmentPurchaseId: 500,
      installmentNumber: 1,
      paymentMethod: "card",
    });
    const invoiceIds = calls.map((c) => c[0].cardInvoiceId);
    expect(new Set(invoiceIds).size).toBe(5);
  });

  it("reports the installment value and the first due date", async () => {
    const { service } = makeService();
    const result = await service.create(input, userId);
    expect(result.installmentCents).toBe(73360);
    expect(result.firstDueDate).toEqual(new Date(Date.UTC(2026, 2, 20)));
  });

  it("refuses when the card is not registered", async () => {
    const { service } = makeService(null);
    await expect(service.create(input, userId)).rejects.toBeInstanceOf(InstallmentPurchaseNotAllowedError);
  });
});
