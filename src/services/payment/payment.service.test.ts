import { describe, expect, it, vi } from "vitest";
import type {
  ICardInvoiceRepository,
  IPaymentEventRepository,
  ITransactionRepository,
} from "@/types/repository";
import type { CardInvoice, PaymentEvent, Transaction } from "@/db/schema";
import { PaymentService } from "@/services/payment/payment.service";
import { PaymentError } from "@/services/payment/errors";

const userId = 1;

const pendingBill = {
  id: 55,
  userId,
  description: "conta de luz",
  expectedAmountCents: 18000,
  status: "pending",
  paymentMethod: "pix",
  dueDate: new Date("2026-08-10"),
} as Transaction;

const invoiceChildren = [
  { id: 101, userId, expectedAmountCents: 3000, cardInvoiceId: 7 } as Transaction,
  { id: 102, userId, expectedAmountCents: 2000, cardInvoiceId: 7 } as Transaction,
];

const openInvoice = {
  id: 7,
  userId,
  cardId: 20,
  status: "open",
  paidAmountCents: null,
  dueDate: new Date("2026-08-20"),
} as CardInvoice;

function makeRepos(overrides: {
  txFindById?: () => Promise<Transaction | null>;
  listPayable?: () => Promise<Transaction[]>;
  listByInvoice?: () => Promise<Transaction[]>;
  listOpen?: () => Promise<CardInvoice[]>;
  invFindById?: () => Promise<CardInvoice | null>;
  listByTarget?: () => Promise<PaymentEvent[]>;
  eventFindById?: () => Promise<PaymentEvent | null>;
} = {}) {
  const transactionRepo = {
    create: vi.fn(),
    findLastByUser: vi.fn(),
    findById: vi.fn().mockImplementation(overrides.txFindById ?? (() => Promise.resolve(pendingBill))),
    listPayable: vi.fn().mockImplementation(overrides.listPayable ?? (() => Promise.resolve([pendingBill]))),
    listByInvoice: vi.fn().mockImplementation(overrides.listByInvoice ?? (() => Promise.resolve(invoiceChildren))),
    update: vi.fn().mockResolvedValue(undefined),
  } as unknown as ITransactionRepository;

  const cardInvoiceRepo = {
    findOrCreate: vi.fn(),
    listOpen: vi.fn().mockImplementation(overrides.listOpen ?? (() => Promise.resolve([openInvoice]))),
    findById: vi.fn().mockImplementation(overrides.invFindById ?? (() => Promise.resolve(openInvoice))),
    update: vi.fn().mockResolvedValue(undefined),
  } as unknown as ICardInvoiceRepository;

  const paymentEventRepo = {
    create: vi.fn().mockImplementation((data) => Promise.resolve({ id: 900, ...data })),
    findById: vi.fn().mockImplementation(overrides.eventFindById ?? (() => Promise.resolve(null))),
    listRecentByUser: vi.fn(),
    listByTarget: vi.fn().mockImplementation(overrides.listByTarget ?? (() => Promise.resolve([]))),
    void: vi.fn().mockResolvedValue(undefined),
  } as unknown as IPaymentEventRepository;

  return { transactionRepo, cardInvoiceRepo, paymentEventRepo };
}

function makeService(overrides: Parameters<typeof makeRepos>[0] = {}) {
  const repos = makeRepos(overrides);
  const service = new PaymentService(
    repos.transactionRepo,
    repos.cardInvoiceRepo,
    repos.paymentEventRepo,
  );
  return { service, repos };
}

const patchOf = (mock: unknown) =>
  (mock as ReturnType<typeof vi.fn>).mock.calls[0]!;

describe("PaymentService.listPayables", () => {
  it("returns pending non-card transactions plus open invoices with remaining balance", async () => {
    const { service } = makeService();
    const payables = await service.listPayables(userId);

    const tx = payables.find((p) => p.type === "transaction");
    const invoice = payables.find((p) => p.type === "invoice");
    expect(tx).toMatchObject({ id: 55, amountCents: 18000 });
    expect(invoice).toMatchObject({ id: 7, amountCents: 5000 });
  });

  it("omits invoices already fully covered", async () => {
    const { service } = makeService({
      listOpen: () => Promise.resolve([{ ...openInvoice, paidAmountCents: 5000 } as CardInvoice]),
    });
    const payables = await service.listPayables(userId);
    expect(payables.some((p) => p.type === "invoice")).toBe(false);
  });
});

describe("PaymentService.pay (transaction)", () => {
  it("settles a bill at its expected amount when no amount is given", async () => {
    const { service, repos } = makeService();
    const result = await service.pay(userId, { type: "transaction", id: 55 });

    expect(result).toMatchObject({ type: "transaction", amountCents: 18000, fullyPaid: true });
    expect(repos.paymentEventRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ targetType: "transaction", targetId: 55, amountCents: 18000 }),
    );
    const [, , patch] = patchOf(repos.transactionRepo.update);
    expect(patch).toMatchObject({ status: "settled", actualAmountCents: 18000 });
  });

  it("captures a real amount that differs from the expected", async () => {
    const { service, repos } = makeService();
    const result = await service.pay(userId, { type: "transaction", id: 55 }, 21000);

    expect(result.amountCents).toBe(21000);
    const [, , patch] = patchOf(repos.transactionRepo.update);
    expect(patch).toMatchObject({ status: "settled", actualAmountCents: 21000 });
  });

  it("rejects paying a card transaction directly", async () => {
    const { service } = makeService({
      txFindById: () => Promise.resolve({ ...pendingBill, paymentMethod: "card" } as Transaction),
    });
    await expect(service.pay(userId, { type: "transaction", id: 55 })).rejects.toBeInstanceOf(PaymentError);
  });

  it("rejects paying a non-pending transaction", async () => {
    const { service } = makeService({
      txFindById: () => Promise.resolve({ ...pendingBill, status: "settled" } as Transaction),
    });
    await expect(service.pay(userId, { type: "transaction", id: 55 })).rejects.toBeInstanceOf(PaymentError);
  });
});

describe("PaymentService.pay (invoice)", () => {
  it("full payment marks the invoice paid and cascades children to settled", async () => {
    const { service, repos } = makeService();
    const result = await service.pay(userId, { type: "invoice", id: 7 });

    expect(result).toMatchObject({ type: "invoice", amountCents: 5000, fullyPaid: true });
    const [, , invoicePatch] = patchOf(repos.cardInvoiceRepo.update);
    expect(invoicePatch).toMatchObject({ status: "paid", paidAmountCents: 5000 });
    expect(repos.transactionRepo.update).toHaveBeenCalledWith(userId, 101, expect.objectContaining({ status: "settled" }));
    expect(repos.transactionRepo.update).toHaveBeenCalledWith(userId, 102, expect.objectContaining({ status: "settled" }));
  });

  it("partial payment keeps the invoice open and does not cascade", async () => {
    const { service, repos } = makeService();
    const result = await service.pay(userId, { type: "invoice", id: 7 }, 2000);

    expect(result.fullyPaid).toBe(false);
    const [, , invoicePatch] = patchOf(repos.cardInvoiceRepo.update);
    expect(invoicePatch).toMatchObject({ status: "open", paidAmountCents: 2000, paidAt: null });
    expect(repos.transactionRepo.update).not.toHaveBeenCalled();
  });

  it("a second partial payment that reaches the total flips it to paid", async () => {
    const { service, repos } = makeService({
      listByTarget: () => Promise.resolve([{ amountCents: 2000 } as PaymentEvent]),
    });
    const result = await service.pay(userId, { type: "invoice", id: 7 }, 3000);

    expect(result.fullyPaid).toBe(true);
    const [, , invoicePatch] = patchOf(repos.cardInvoiceRepo.update);
    expect(invoicePatch).toMatchObject({ status: "paid", paidAmountCents: 5000 });
  });

  it("rejects paying an already-covered invoice", async () => {
    const { service } = makeService({
      listByTarget: () => Promise.resolve([{ amountCents: 5000 } as PaymentEvent]),
    });
    await expect(service.pay(userId, { type: "invoice", id: 7 })).rejects.toBeInstanceOf(PaymentError);
  });
});

describe("PaymentService.undo", () => {
  it("voids a transaction payment and reverts the bill to pending", async () => {
    const { service, repos } = makeService({
      eventFindById: () =>
        Promise.resolve({ id: 900, userId, targetType: "transaction", targetId: 55, amountCents: 18000, voidedAt: null } as PaymentEvent),
    });

    const result = await service.undo(userId, 900);

    expect(result).toMatchObject({ type: "transaction", amountCents: 18000 });
    expect(repos.paymentEventRepo.void).toHaveBeenCalledWith(900);
    const [, , patch] = patchOf(repos.transactionRepo.update);
    expect(patch).toMatchObject({ status: "pending", actualAmountCents: null, settledAt: null });
  });

  it("voids an invoice payment, recomputes the balance and reverses the cascade", async () => {
    const { service, repos } = makeService({
      eventFindById: () =>
        Promise.resolve({ id: 901, userId, targetType: "invoice", targetId: 7, amountCents: 5000, voidedAt: null } as PaymentEvent),
      listByTarget: () => Promise.resolve([]),
    });

    await service.undo(userId, 901);

    const [, , invoicePatch] = patchOf(repos.cardInvoiceRepo.update);
    expect(invoicePatch).toMatchObject({ status: "open", paidAmountCents: 0, paidAt: null });
    expect(repos.transactionRepo.update).toHaveBeenCalledWith(userId, 101, expect.objectContaining({ status: "pending" }));
  });

  it("rejects undoing an unknown or already-voided payment", async () => {
    const { service } = makeService({
      eventFindById: () =>
        Promise.resolve({ id: 902, userId, targetType: "transaction", targetId: 55, amountCents: 1, voidedAt: new Date() } as PaymentEvent),
    });
    await expect(service.undo(userId, 902)).rejects.toBeInstanceOf(PaymentError);
  });
});
