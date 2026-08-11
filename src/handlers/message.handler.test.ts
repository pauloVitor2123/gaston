import { describe, expect, it, vi } from "vitest";
import type {
  ICardRepository,
  ICategoryRepository,
  IPendingConversationRepository,
  IUserRepository,
} from "@/types/repository";
import type { AgentTurn, CollectionAgent } from "@/services/collection/collection-agent";
import type { AgentContext } from "@/services/collection/prompts";
import type { TransactionDraft } from "@/services/collection/draft";
import type { PaymentService } from "@/services/payment/payment.service";
import { PaymentError } from "@/services/payment/errors";
import type { TransactionService } from "@/services/transaction/transaction.service";
import type { RecurringBillService } from "@/services/recurring/recurring-bill.service";
import { InstallmentPurchaseNotAllowedError, type InstallmentService } from "@/services/installment/installment.service";
import type { AnalyticsService } from "@/services/analytics/analytics.service";
import type { BalanceService, BalanceSummary } from "@/services/balance/balance.service";
import type { Card, Category, PendingConversation, Transaction, User } from "@/db/schema";
import { MessageHandler } from "@/handlers/message.handler";
import { FixedClock } from "@/services/clock";

const NOW = new Date("2026-08-05T12:00:00.000Z");

const mockUser: User = {
  id: 1,
  telegramChatId: 100,
  name: "Test User",
  timezone: "America/Sao_Paulo",
  balanceCents: 0,
  balanceSetAt: new Date("2026-08-01"),
  createdAt: new Date(),
};

const mockCategories: Category[] = [
  { id: 1, userId: 1, name: "Alimentação", synonyms: [] } as Category,
];

const mockCards: Card[] = [
  {
    id: 1,
    userId: 1,
    name: "Nubank",
    aliases: [],
    brand: "Mastercard",
    closingDay: 13,
    dueDay: 20,
    limitCents: null,
    isActive: true,
    createdAt: new Date(),
  } as Card,
];

const mockTransaction = { id: 99, userId: 1 } as Transaction;

const payablesFixture = [
  { type: "transaction" as const, id: 55, description: "conta de luz", amountCents: 18000, dueDate: new Date("2026-08-10") },
];
const recentFixture = [
  { eventId: 900, description: "conta de luz", amountCents: 18000, paidAt: new Date("2026-07-30") },
];

const fullDraft: TransactionDraft = {
  intent: "record_expense",
  description: "almoço",
  amount_cents: 3500,
  date: "2025-01-15",
  payment_method: "card",
  card_name: "Nubank",
  category_name: "Alimentação",
};

function makeRepos(overrides: {
  findByChatId?: () => Promise<User | null>;
  findActiveByUser?: () => Promise<PendingConversation | null>;
} = {}) {
  return {
    userRepo: {
      findByChatId: vi.fn().mockImplementation(overrides.findByChatId ?? (() => Promise.resolve(mockUser))),
      create: vi.fn().mockResolvedValue(mockUser),
      setBalance: vi.fn().mockResolvedValue(undefined),
    } as unknown as IUserRepository,
    categoryRepo: {
      create: vi.fn(),
      listByUser: vi.fn().mockResolvedValue(mockCategories),
      findByNameOrSynonym: vi.fn(),
    } as unknown as ICategoryRepository,
    cardRepo: {
      create: vi.fn(),
      listByUser: vi.fn().mockResolvedValue(mockCards),
      findByNameOrAlias: vi.fn(),
    } as unknown as ICardRepository,
    pendingRepo: {
      findActiveByUser: vi.fn().mockImplementation(
        overrides.findActiveByUser ?? (() => Promise.resolve(null)),
      ),
      create: vi.fn().mockResolvedValue({ id: 1 }),
      update: vi.fn(),
      delete: vi.fn().mockResolvedValue(true),
    } as unknown as IPendingConversationRepository,
  };
}

function makePaymentService() {
  return {
    listPayables: vi.fn().mockResolvedValue(payablesFixture),
    listRecentPayments: vi.fn().mockResolvedValue(recentFixture),
    pay: vi.fn().mockResolvedValue({ eventId: 900, type: "transaction", description: "conta de luz", amountCents: 18000, fullyPaid: true }),
    undo: vi.fn().mockResolvedValue({ type: "transaction", description: "conta de luz", amountCents: 18000 }),
  } as unknown as PaymentService;
}

function makeRecurringService() {
  return {
    listActive: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue({ bill: { id: 3 }, firstDueDate: new Date("2026-08-15") }),
    delete: vi.fn().mockResolvedValue(undefined),
  } as unknown as RecurringBillService;
}

function makeInstallmentService() {
  return {
    create: vi.fn().mockResolvedValue({
      purchase: { id: 500 },
      installmentCents: 73360,
      firstDueDate: new Date(Date.UTC(2026, 2, 20)),
    }),
  } as unknown as InstallmentService;
}

function makeHandler(
  turn: AgentTurn = { kind: "draft", draft: fullDraft },
  repoOverrides: Parameters<typeof makeRepos>[0] = {},
  payment: PaymentService = makePaymentService(),
  recurring: RecurringBillService = makeRecurringService(),
  installment: InstallmentService = makeInstallmentService(),
  clock: FixedClock = new FixedClock(NOW),
) {
  const repos = makeRepos(repoOverrides);
  const agent = { run: vi.fn().mockResolvedValue(turn) } as unknown as CollectionAgent;
  const transactionService = {
    persist: vi.fn().mockResolvedValue(mockTransaction),
  } as unknown as TransactionService;
  const analytics = {
    aggregate: vi.fn().mockResolvedValue({ rows: [], totalCents: 0 }),
  } as unknown as AnalyticsService;
  const balance = {
    summarize: vi.fn().mockResolvedValue(zeroSummary),
    setBalance: vi.fn().mockResolvedValue(undefined),
  } as unknown as BalanceService;

  const handler = new MessageHandler(
    repos.userRepo,
    repos.categoryRepo,
    repos.cardRepo,
    agent,
    transactionService,
    payment,
    recurring,
    installment,
    repos.pendingRepo,
    analytics,
    balance,
    clock,
  );
  return { handler, repos, agent, transactionService, payment, recurring, installment, analytics, balance };
}

const zeroSummary: BalanceSummary = {
  base: 0,
  receivedSince: 0,
  spentSince: 0,
  onHand: 0,
  toReceive: 0,
  toPay: 0,
  projected: 0,
};

function pendingDraft(id: number, cycles: number): PendingConversation {
  return {
    id,
    userId: 1,
    stateJson: {
      kind: "draft",
      messages: [
        { role: "user", content: "almoço no nubank" },
        { role: "assistant", content: "Qual o valor?" },
      ],
      cycles,
    },
    expiresAt: new Date(Date.now() + 60_000),
  } as unknown as PendingConversation;
}

function pendingConfirm(state: Record<string, unknown>, id = 70): PendingConversation {
  return { id, userId: 1, stateJson: state, expiresAt: new Date(Date.now() + 60_000) } as unknown as PendingConversation;
}

describe("MessageHandler — record flow", () => {
  it("persists and confirms when the agent yields a draft", async () => {
    const { handler, transactionService } = makeHandler();
    const reply = await handler.handle(100, "almoço 35 reais nubank", "Test User");
    expect(transactionService.persist).toHaveBeenCalledOnce();
    expect(reply.text).toContain("Almoço");
    expect(reply.text).toContain("R$ 35,00");
  });

  it("saves a 24h draft and returns the question when the agent asks", async () => {
    const { handler, repos } = makeHandler({ kind: "question", text: "Qual o valor?" });
    const reply = await handler.handle(100, "almoço no nubank", "Test User");
    const created = (repos.pendingRepo.create as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(created.stateJson.kind).toBe("draft");
    expect(created.stateJson.cycles).toBe(1);
    expect(created.expiresAt.getTime() - NOW.getTime()).toBe(24 * 60 * 60 * 1000);
    expect(reply.text).toBe("Qual o valor?");
  });

  it("resumes a draft and persists when the agent completes it", async () => {
    const { handler, transactionService, repos } = makeHandler(
      { kind: "draft", draft: fullDraft },
      { findActiveByUser: () => Promise.resolve(pendingDraft(77, 1)) },
    );
    const reply = await handler.handle(100, "35 reais", "Test User");
    expect(repos.pendingRepo.delete).toHaveBeenCalledWith(77);
    expect(transactionService.persist).toHaveBeenCalledOnce();
    expect(reply.text).toContain("R$ 35,00");
  });

  it("keeps the draft alive (no abort) when the cycle cap is reached", async () => {
    const { handler, repos } = makeHandler(
      { kind: "question", text: "Qual o valor?" },
      { findActiveByUser: () => Promise.resolve(pendingDraft(66, 2)) },
    );
    const reply = await handler.handle(100, "não sei", "Test User");
    expect(repos.pendingRepo.delete).not.toHaveBeenCalled();
    const updated = (repos.pendingRepo.update as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(updated[1].cycles).toBe(3);
    expect(reply.text).toContain("guardado");
  });

  it("passes due_date and already_paid through and flags a future obligation in the reply", async () => {
    const future: TransactionDraft = {
      intent: "record_expense",
      description: "pix pra mãe",
      amount_cents: 1000,
      payment_method: "pix",
      category_name: "Alimentação",
      due_date: "2099-12-10",
      already_paid: false,
    };
    const { handler, transactionService } = makeHandler({ kind: "draft", draft: future });
    const reply = await handler.handle(100, "pix de 10 pra minha mãe dia 10", "Test User");
    const persisted = (transactionService.persist as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(persisted.due_date).toBe("2099-12-10");
    expect(persisted.already_paid).toBe(false);
    expect(reply.text).toContain("10/12");
  });

  it("flags a pending obligation with no due date when the user hasn't paid yet", async () => {
    const unpaidNoDate: TransactionDraft = {
      intent: "record_expense",
      description: "boleto da luz",
      amount_cents: 15000,
      payment_method: "pix",
      category_name: "Alimentação",
      already_paid: false,
    };
    const { handler } = makeHandler({ kind: "draft", draft: unpaidNoDate });
    const reply = await handler.handle(100, "boleto da luz 150, não paguei ainda", "Test User");
    expect(reply.text).toContain("pendente");
  });

  it("infers the category from the description when the draft omits it", async () => {
    const noCategory: TransactionDraft = {
      intent: "record_expense",
      description: "almoço com amigos",
      amount_cents: 3500,
      payment_method: "pix",
    };
    const { handler, transactionService, repos } = makeHandler({ kind: "draft", draft: noCategory });
    (repos.categoryRepo.listByUser as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 1, userId: 1, name: "Alimentação", synonyms: ["almoço"] },
    ]);
    await handler.handle(100, "almoço com amigos 35 no pix", "Test User");
    const persisted = (transactionService.persist as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(persisted.category_name).toBe("Alimentação");
  });

  it("asks for a category listing the available ones when it can't be resolved", async () => {
    const noCategory: TransactionDraft = {
      intent: "record_expense",
      description: "comprei algo na loja",
      amount_cents: 5000,
      payment_method: "pix",
    };
    const { handler, transactionService, repos } = makeHandler({ kind: "draft", draft: noCategory });
    const reply = await handler.handle(100, "gastei 50 numa loja", "Test User");
    expect(transactionService.persist).not.toHaveBeenCalled();
    expect(reply.text.toLowerCase()).toContain("categoria");
    expect(reply.text).toContain("Alimentação");
    const created = (repos.pendingRepo.create as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(created.stateJson.kind).toBe("draft");
  });

  it("does not ask for a category on income, even when none resolves", async () => {
    const income: TransactionDraft = {
      intent: "record_income",
      description: "salário",
      amount_cents: 200000,
      payment_method: "pix",
    };
    const { handler, transactionService, repos } = makeHandler({ kind: "draft", draft: income });
    const reply = await handler.handle(100, "recebi 2000 de salário", "Test User");
    expect(transactionService.persist).toHaveBeenCalledOnce();
    expect(reply.text.toLowerCase()).not.toContain("categoria");
    const persisted = (transactionService.persist as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(persisted.direction).toBe("in");
    expect(repos.pendingRepo.create).not.toHaveBeenCalled();
  });

  it("does not block on category when the user has no categories yet", async () => {
    const noCategory: TransactionDraft = {
      intent: "record_expense",
      description: "algo genérico",
      amount_cents: 5000,
      payment_method: "pix",
    };
    const { handler, transactionService, repos } = makeHandler({ kind: "draft", draft: noCategory });
    (repos.categoryRepo.listByUser as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    await handler.handle(100, "gastei 50", "Test User");
    expect(transactionService.persist).toHaveBeenCalledOnce();
    const persisted = (transactionService.persist as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(persisted.category_name).toBeUndefined();
  });

  it("falls back to cash and warns when the drafted card is not registered", async () => {
    const unknownCard: TransactionDraft = { ...fullDraft, payment_method: "card", card_name: "Santander" };
    const { handler, transactionService } = makeHandler({ kind: "draft", draft: unknownCard });
    const reply = await handler.handle(100, "tv 2000 no santander", "Test User");
    const persisted = (transactionService.persist as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(persisted.payment_method).toBe("cash");
    expect(reply.text.toLowerCase()).toContain("cartão");
  });
});

describe("MessageHandler — query flow", () => {
  it("formats a category breakdown with percentages, total and top", async () => {
    const { handler, analytics } = makeHandler({
      kind: "query",
      params: { group_by: "category", from: "2026-08-01", to: "2026-08-31" },
    });
    (analytics.aggregate as ReturnType<typeof vi.fn>).mockResolvedValue({
      rows: [
        { label: "Alimentação", amountCents: 45000 },
        { label: "Transporte", amountCents: 30000 },
      ],
      totalCents: 75000,
    });
    const reply = await handler.handle(100, "gastos por categoria desse mês", "Test User");
    expect(analytics.aggregate).toHaveBeenCalledWith(1, {
      group_by: "category",
      from: "2026-08-01",
      to: "2026-08-31",
    });
    expect(reply.text).toContain("Alimentação — R$ 450,00 (60%)");
    expect(reply.text).toContain("Transporte — R$ 300,00 (40%)");
    expect(reply.text).toContain("Total: R$ 750,00");
    expect(reply.text).toContain("maior: Alimentação");
  });

  it("reports an empty period without dividing by zero", async () => {
    const { handler } = makeHandler({
      kind: "query",
      params: { group_by: "category", from: "2026-08-01", to: "2026-08-31" },
    });
    const reply = await handler.handle(100, "quanto gastei", "Test User");
    expect(reply.text.toLowerCase()).toContain("nada encontrado");
  });

  it("returns a single total for group_by 'none'", async () => {
    const { handler, analytics } = makeHandler({
      kind: "query",
      params: { group_by: "none", from: "2026-08-01", to: "2026-08-31" },
    });
    (analytics.aggregate as ReturnType<typeof vi.fn>).mockResolvedValue({
      rows: [{ label: "Total", amountCents: 150000 }],
      totalCents: 150000,
    });
    const reply = await handler.handle(100, "quanto gastei esse mês", "Test User");
    expect(reply.text).toContain("Total: R$ 1500,00");
    expect(reply.text).not.toContain("%");
  });
});

describe("MessageHandler — set balance (NL) flow", () => {
  it("asks for confirmation on a set_balance turn without writing yet", async () => {
    const { handler, repos, balance } = makeHandler({ kind: "set_balance", amountCents: 500000 });
    const reply = await handler.handle(100, "tenho 5000 na conta", "Test User");
    expect(balance.setBalance).not.toHaveBeenCalled();
    const created = (repos.pendingRepo.create as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(created.stateJson.kind).toBe("balance_confirm");
    expect(created.stateJson.amountCents).toBe(500000);
    expect(reply.text).toContain("Definir saldo como R$ 5000,00");
  });

  it("writes the balance on 'sim' and does not call the agent", async () => {
    const { handler, agent, balance } = makeHandler(
      { kind: "question", text: "x" },
      {
        findActiveByUser: () =>
          Promise.resolve(pendingConfirm({ kind: "balance_confirm", amountCents: 500000 })),
      },
    );
    const reply = await handler.handle(100, "sim", "Test User");
    expect(agent.run).not.toHaveBeenCalled();
    expect(balance.setBalance).toHaveBeenCalledWith(1, 500000, expect.any(Date));
    expect(reply.text).toContain("Saldo definido: R$ 5000,00");
  });

  it("does not write the balance on 'não'", async () => {
    const { handler, balance } = makeHandler(
      { kind: "question", text: "x" },
      {
        findActiveByUser: () =>
          Promise.resolve(pendingConfirm({ kind: "balance_confirm", amountCents: 500000 })),
      },
    );
    const reply = await handler.handle(100, "não", "Test User");
    expect(balance.setBalance).not.toHaveBeenCalled();
    expect(reply.text.toLowerCase()).toContain("deixei como estava");
  });
});

describe("MessageHandler — payment flow", () => {
  it("asks for confirmation on a pay turn without mutating yet", async () => {
    const { handler, repos, payment } = makeHandler({
      kind: "pay",
      target: { type: "transaction", id: 55 },
      amountCents: undefined,
    });
    const reply = await handler.handle(100, "paguei a conta de luz", "Test User");
    expect(payment.pay).not.toHaveBeenCalled();
    const created = (repos.pendingRepo.create as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(created.stateJson.kind).toBe("payment_confirm");
    expect(reply.text).toContain("Confirma pagar conta de luz");
    expect(reply.text).toContain("R$ 180,00");
  });

  it("rejects a pay turn whose target is not in the payables list", async () => {
    const { handler, payment } = makeHandler({ kind: "pay", target: { type: "transaction", id: 999 } });
    const reply = await handler.handle(100, "paguei o aluguel", "Test User");
    expect(payment.pay).not.toHaveBeenCalled();
    expect(reply.text.toLowerCase()).toContain("não encontrei");
  });

  it("executes the payment on 'sim' and does not call the agent", async () => {
    const { handler, agent, payment } = makeHandler(
      { kind: "question", text: "x" },
      {
        findActiveByUser: () =>
          Promise.resolve(
            pendingConfirm({ kind: "payment_confirm", target: { type: "transaction", id: 55 }, description: "conta de luz" }),
          ),
      },
    );
    const reply = await handler.handle(100, "sim", "Test User");
    expect(agent.run).not.toHaveBeenCalled();
    expect(payment.pay).toHaveBeenCalledWith(1, { type: "transaction", id: 55 }, undefined);
    expect(reply.text).toContain("Pago: conta de luz");
  });

  it("cancels the payment on 'não' without mutating", async () => {
    const { handler, payment, repos } = makeHandler(
      { kind: "question", text: "x" },
      {
        findActiveByUser: () =>
          Promise.resolve(pendingConfirm({ kind: "payment_confirm", target: { type: "transaction", id: 55 }, description: "conta de luz" })),
      },
    );
    const reply = await handler.handle(100, "não", "Test User");
    expect(payment.pay).not.toHaveBeenCalled();
    expect(repos.pendingRepo.delete).toHaveBeenCalledWith(70);
    expect(reply.text.toLowerCase()).toContain("deixei como estava");
  });

  it("discards the confirmation and reprocesses when the reply is neither sim nor não", async () => {
    const { handler, agent, repos } = makeHandler(
      { kind: "draft", draft: fullDraft },
      {
        findActiveByUser: () =>
          Promise.resolve(pendingConfirm({ kind: "payment_confirm", target: { type: "transaction", id: 55 }, description: "conta de luz" })),
      },
    );
    const reply = await handler.handle(100, "na verdade almoço 35 reais nubank", "Test User");
    expect(repos.pendingRepo.delete).toHaveBeenCalledWith(70);
    expect(agent.run).toHaveBeenCalledOnce();
    expect(reply.text).toContain("Almoço");
  });

  it("surfaces a PaymentError message instead of crashing", async () => {
    const payment = makePaymentService();
    (payment.pay as ReturnType<typeof vi.fn>).mockRejectedValue(new PaymentError("Essa fatura já está paga."));
    const { handler } = makeHandler(
      { kind: "question", text: "x" },
      {
        findActiveByUser: () =>
          Promise.resolve(pendingConfirm({ kind: "payment_confirm", target: { type: "invoice", id: 7 }, description: "Fatura do cartão" })),
      },
      payment,
    );
    const reply = await handler.handle(100, "sim", "Test User");
    expect(reply.text).toBe("Essa fatura já está paga.");
  });
});

describe("MessageHandler — undo flow", () => {
  it("asks for confirmation on an undo turn", async () => {
    const { handler, repos, payment } = makeHandler({ kind: "undo", eventId: 900 });
    const reply = await handler.handle(100, "desfaz o pagamento da luz", "Test User");
    expect(payment.undo).not.toHaveBeenCalled();
    const created = (repos.pendingRepo.create as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(created.stateJson.kind).toBe("undo_confirm");
    expect(reply.text).toContain("Confirma desfazer");
  });

  it("executes the undo on 'sim'", async () => {
    const { handler, payment } = makeHandler(
      { kind: "question", text: "x" },
      { findActiveByUser: () => Promise.resolve(pendingConfirm({ kind: "undo_confirm", eventId: 900, description: "conta de luz" })) },
    );
    const reply = await handler.handle(100, "sim", "Test User");
    expect(payment.undo).toHaveBeenCalledWith(1, 900);
    expect(reply.text).toContain("Estornei: conta de luz");
  });
});

describe("MessageHandler — recurring flow", () => {
  const recurringTurn: AgentTurn = {
    kind: "recurring",
    bill: { description: "Internet", amount_cents: 29900, due_day: 15, payment_method: "pix" },
  };

  it("registers a recurring bill and reports the next due date", async () => {
    const recurring = makeRecurringService();
    const { handler } = makeHandler(recurringTurn, {}, makePaymentService(), recurring);
    const reply = await handler.handle(100, "boleto internet 299 todo dia 15", "Test User");
    expect(recurring.create).toHaveBeenCalledOnce();
    expect(reply.text).toContain("Internet");
    expect(reply.text).toContain("15/08");
  });

  it("asks confirmation before deleting a recurring bill", async () => {
    const recurring = makeRecurringService();
    (recurring.listActive as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 3, description: "Netflix", expectedAmountCents: 5590 },
    ]);
    const { handler, repos } = makeHandler(
      { kind: "delete_recurring", billId: 3 },
      {},
      makePaymentService(),
      recurring,
    );
    const reply = await handler.handle(100, "cancela a netflix", "Test User");
    expect(recurring.delete).not.toHaveBeenCalled();
    const created = (repos.pendingRepo.create as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(created.stateJson.kind).toBe("delete_recurring_confirm");
    expect(reply.text).toContain("Confirma cancelar");
  });

  it("deletes the recurring bill on 'sim'", async () => {
    const recurring = makeRecurringService();
    const { handler } = makeHandler(
      { kind: "question", text: "x" },
      {
        findActiveByUser: () =>
          Promise.resolve(
            pendingConfirm({ kind: "delete_recurring_confirm", billId: 3, description: "Netflix" }),
          ),
      },
      makePaymentService(),
      recurring,
    );
    const reply = await handler.handle(100, "sim", "Test User");
    expect(recurring.delete).toHaveBeenCalledWith(1, 3);
    expect(reply.text).toContain("Cancelei a conta recorrente");
  });
});

describe("MessageHandler — installment flow", () => {
  const installmentTurn: AgentTurn = {
    kind: "installment",
    purchase: {
      description: "Máquina de lavar",
      total_amount_cents: 366800,
      installments_count: 5,
      card_name: "Nubank",
    },
  };

  it("records an installment purchase and reports the plan", async () => {
    const installment = makeInstallmentService();
    const { handler } = makeHandler(installmentTurn, {}, makePaymentService(), makeRecurringService(), installment);
    const reply = await handler.handle(100, "máquina de lavar 3668 em 5x no nubank", "Test User");
    expect(installment.create).toHaveBeenCalledOnce();
    expect(reply.text).toContain("5x");
    expect(reply.text).toContain("R$ 3668,00");
    expect(reply.text).toContain("20/03");
  });

  it("warns to register a card when the installment card is unknown", async () => {
    const installment = makeInstallmentService();
    (installment.create as ReturnType<typeof vi.fn>).mockRejectedValue(
      new InstallmentPurchaseNotAllowedError("card not found"),
    );
    const { handler } = makeHandler(installmentTurn, {}, makePaymentService(), makeRecurringService(), installment);
    const reply = await handler.handle(100, "tv 2000 em 10x no santander", "Test User");
    expect(reply.text.toLowerCase()).toContain("cartão");
  });
});

describe("MessageHandler — saldo flow", () => {
  const summary: BalanceSummary = {
    base: 500000,
    receivedSince: 300000,
    spentSince: 120000,
    onHand: 680000,
    toReceive: 200000,
    toPay: 312035,
    projected: 567965,
  };

  it("shows the balancete on /saldo without an argument, without setting", async () => {
    const { handler, balance } = makeHandler();
    (balance.summarize as ReturnType<typeof vi.fn>).mockResolvedValue(summary);
    const reply = await handler.handle(100, "/saldo", "Test User");
    expect(balance.setBalance).not.toHaveBeenCalled();
    expect(reply.text).toContain("Na conta hoje: R$ 6800,00");
    expect(reply.text).toContain("Projeção fim do mês: R$ 5679,65");
    expect(reply.text).toContain("A pagar no mês: R$ 3120,35");
  });

  it("sets the balance on /saldo <valor> and confirms", async () => {
    const { handler, balance } = makeHandler();
    (balance.summarize as ReturnType<typeof vi.fn>).mockResolvedValue(summary);
    const reply = await handler.handle(100, "/saldo 5.000,50", "Test User");
    expect(balance.setBalance).toHaveBeenCalledWith(1, 500050, expect.any(Date));
    expect(reply.text).toContain("Saldo definido: R$ 5000,50");
  });

  it("rejects an unparseable amount without setting", async () => {
    const { handler, balance } = makeHandler();
    const reply = await handler.handle(100, "/saldo abc", "Test User");
    expect(balance.setBalance).not.toHaveBeenCalled();
    expect(reply.text.toLowerCase()).toContain("não entendi");
  });

  it("adds the balance footer to /status", async () => {
    const { handler, balance } = makeHandler();
    (balance.summarize as ReturnType<typeof vi.fn>).mockResolvedValue(summary);
    const reply = await handler.handle(100, "/status", "Test User");
    expect(reply.text).toContain("Na conta hoje: R$ 6800,00");
    expect(reply.text).toContain("Projeção fim do mês: R$ 5679,65");
  });

  it("prompts to set the balance on /saldo when it was never defined (BUG-4)", async () => {
    const { handler, balance } = makeHandler();
    (balance.summarize as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const reply = await handler.handle(100, "/saldo", "Test User");
    expect(balance.setBalance).not.toHaveBeenCalled();
    expect(reply.text).toContain("ainda não definiu seu saldo");
    expect(reply.text).toContain("/saldo 5000");
    expect(reply.text).not.toContain("Na conta hoje");
  });

  it("hints to set the balance in the /status footer when it was never defined (BUG-4)", async () => {
    const { handler, balance } = makeHandler();
    (balance.summarize as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const reply = await handler.handle(100, "/status", "Test User");
    expect(reply.text).toContain("Situação do mês");
    expect(reply.text).not.toContain("Na conta hoje");
    expect(reply.text).toContain("/saldo");
  });
});

describe("MessageHandler — commands & robustness", () => {
  it("passes categories, cards, payables and recent payments as agent context", async () => {
    const { handler, agent } = makeHandler();
    await handler.handle(100, "almoço 35", "Test User");
    expect(agent.run).toHaveBeenCalledWith(
      [{ role: "user", content: "almoço 35" }],
      expect.objectContaining<Partial<AgentContext>>({
        categories: ["Alimentação"],
        cards: ["Nubank"],
        payables: payablesFixture,
        recentPayments: recentFixture,
      }),
    );
  });

  it("returns onboarding for /start without invoking the agent", async () => {
    const { handler, agent } = makeHandler();
    const reply = await handler.handle(100, "/start", "Test User");
    expect(reply.text).toContain("Gaston");
    expect(agent.run).not.toHaveBeenCalled();
  });

  it("lists open payables on /pendentes without invoking the agent", async () => {
    const { handler, agent, payment } = makeHandler();
    const reply = await handler.handle(100, "/pendentes", "Test User");
    expect(agent.run).not.toHaveBeenCalled();
    expect(payment.listPayables).toHaveBeenCalledWith(1);
    expect(reply.text).toContain("conta de luz");
    expect(reply.text).toContain("R$ 180,00");
    expect(reply.text).toContain("10/08");
  });

  it("shows a friendly message on /pendentes when nothing is open", async () => {
    const payment = makePaymentService();
    (payment.listPayables as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const { handler } = makeHandler({ kind: "draft", draft: fullDraft }, {}, payment);
    const reply = await handler.handle(100, "/pendentes", "Test User");
    expect(reply.text.toLowerCase()).toContain("nada");
  });

  it("splits payables into overdue and upcoming on /status", async () => {
    const payment = makePaymentService();
    (payment.listPayables as ReturnType<typeof vi.fn>).mockResolvedValue([
      { type: "transaction", id: 1, description: "conta velha", amountCents: 5000, dueDate: new Date("2020-01-10") },
      { type: "transaction", id: 2, description: "boleto futuro", amountCents: 30000, dueDate: new Date("2099-12-15") },
    ]);
    const { handler, agent } = makeHandler({ kind: "draft", draft: fullDraft }, {}, payment);
    const reply = await handler.handle(100, "/status", "Test User");
    expect(agent.run).not.toHaveBeenCalled();
    expect(reply.text).toContain("Atrasados");
    expect(reply.text).toContain("conta velha");
    expect(reply.text).toContain("A vencer");
    expect(reply.text).toContain("boleto futuro");
    expect(reply.text).toContain("Total em aberto: R$ 350,00");
  });

  it("shows an all-clear on /status when nothing is open", async () => {
    const payment = makePaymentService();
    (payment.listPayables as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const { handler } = makeHandler({ kind: "draft", draft: fullDraft }, {}, payment);
    const reply = await handler.handle(100, "/status", "Test User");
    expect(reply.text).toContain("em dia");
  });

  it("lists working commands and NL examples on /help without invoking the agent", async () => {
    const { handler, agent } = makeHandler();
    const reply = await handler.handle(100, "/help", "Test User");
    expect(agent.run).not.toHaveBeenCalled();
    expect(reply.text).toContain("/pendentes");
    expect(reply.text).toContain("/cancelar");
    expect(reply.text).toContain("almoço");
  });

  it("cancels any active pending on /cancelar", async () => {
    const { handler, repos, agent } = makeHandler({ kind: "draft", draft: fullDraft }, {
      findActiveByUser: () => Promise.resolve(pendingDraft(42, 0)),
    });
    const reply = await handler.handle(100, "/cancelar", "Test User");
    expect(repos.pendingRepo.delete).toHaveBeenCalledWith(42);
    expect(agent.run).not.toHaveBeenCalled();
    expect(reply.text.toLowerCase()).toContain("cancelei");
  });

  it("drops a corrupt pending state and processes the message fresh", async () => {
    const corrupt = pendingConfirm({ foo: "bar" }, 99);
    const { handler, repos, agent } = makeHandler({ kind: "draft", draft: fullDraft }, {
      findActiveByUser: () => Promise.resolve(corrupt),
    });
    await handler.handle(100, "almoço 35 reais nubank", "Test User");
    expect(repos.pendingRepo.delete).toHaveBeenCalledWith(99);
    expect(agent.run).toHaveBeenCalledOnce();
  });

  it("returns a friendly message and does not persist when the agent throws", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const repos = makeRepos();
    const agent = { run: vi.fn().mockRejectedValue(new Error("LLM down")) } as unknown as CollectionAgent;
    const transactionService = { persist: vi.fn() } as unknown as TransactionService;
    const analytics = { aggregate: vi.fn() } as unknown as AnalyticsService;
    const balance = {
      summarize: vi.fn().mockResolvedValue(zeroSummary),
      setBalance: vi.fn().mockResolvedValue(undefined),
    } as unknown as BalanceService;
    const handler = new MessageHandler(
      repos.userRepo,
      repos.categoryRepo,
      repos.cardRepo,
      agent,
      transactionService,
      makePaymentService(),
      makeRecurringService(),
      makeInstallmentService(),
      repos.pendingRepo,
      analytics,
      balance,
      new FixedClock(NOW),
    );
    const reply = await handler.handle(100, "almoço 35", "Test User");
    expect(reply.text).toContain("problema");
    expect(transactionService.persist).not.toHaveBeenCalled();
  });

  it("defaults the transaction date to today when the draft omits it", async () => {
    const noDate: TransactionDraft = { ...fullDraft, date: undefined };
    const { handler, transactionService } = makeHandler({ kind: "draft", draft: noDate });
    await handler.handle(100, "almoço 35 no nubank", "Test User");
    const persisted = (transactionService.persist as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(persisted.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("uses the user's civil date near midnight, not the UTC date (BUG-3 regression)", async () => {
    const lateNight = new FixedClock(new Date("2026-08-06T02:30:00.000Z"));
    const dueTomorrow: TransactionDraft = {
      intent: "record_expense",
      description: "boleto",
      amount_cents: 10000,
      payment_method: "cash",
      category_name: "Alimentação",
      due_date: "2026-08-06",
    };
    const { handler, transactionService } = makeHandler(
      { kind: "draft", draft: dueTomorrow },
      {},
      makePaymentService(),
      makeRecurringService(),
      makeInstallmentService(),
      lateNight,
    );

    const reply = await handler.handle(100, "boleto 100 vence amanhã", "Test User");

    expect(reply.text).toContain("pendente");
    const [, , , today] = (transactionService.persist as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(today).toEqual(new Date(Date.UTC(2026, 7, 5)));
  });
});

describe("MessageHandler — BotReply seam (inline buttons)", () => {
  it("attaches confirm/cancel actions to a payment confirmation", async () => {
    const { handler } = makeHandler({
      kind: "pay",
      target: { type: "transaction", id: 55 },
      amountCents: undefined,
    });
    const reply = await handler.handle(100, "paguei a conta de luz", "Test User");
    expect(reply.actions).toEqual([
      { id: "1:yes", label: "✅ Confirmar" },
      { id: "1:no", label: "✕ Não" },
    ]);
    expect(reply.text).not.toContain("(sim/não)");
  });

  it("leaves plain replies without actions", async () => {
    const { handler } = makeHandler();
    const reply = await handler.handle(100, "/help", "Test User");
    expect(reply.actions).toBeUndefined();
  });

  it("resolves a confirmation when the tapped button id matches the active pending", async () => {
    const { handler, payment, repos } = makeHandler(
      { kind: "question", text: "x" },
      {
        findActiveByUser: () =>
          Promise.resolve(pendingConfirm({ kind: "payment_confirm", target: { type: "transaction", id: 55 }, description: "conta de luz" })),
      },
    );
    const reply = await handler.handleCallback(100, "70:yes", "Test User");
    expect(payment.pay).toHaveBeenCalledWith(1, { type: "transaction", id: 55 }, undefined);
    expect(repos.pendingRepo.delete).toHaveBeenCalledWith(70);
    expect(reply.text).toContain("Pago: conta de luz");
    expect(reply.actions).toBeUndefined();
  });

  it("cancels on a 'no' tap without mutating", async () => {
    const { handler, payment, repos } = makeHandler(
      { kind: "question", text: "x" },
      {
        findActiveByUser: () =>
          Promise.resolve(pendingConfirm({ kind: "payment_confirm", target: { type: "transaction", id: 55 }, description: "conta de luz" })),
      },
    );
    const reply = await handler.handleCallback(100, "70:no", "Test User");
    expect(payment.pay).not.toHaveBeenCalled();
    expect(repos.pendingRepo.delete).toHaveBeenCalledWith(70);
    expect(reply.text.toLowerCase()).toContain("deixei como estava");
  });

  it("rejects a stale button whose id does not match the active pending", async () => {
    const { handler, payment } = makeHandler(
      { kind: "question", text: "x" },
      {
        findActiveByUser: () =>
          Promise.resolve(pendingConfirm({ kind: "payment_confirm", target: { type: "transaction", id: 55 }, description: "conta de luz" })),
      },
    );
    const reply = await handler.handleCallback(100, "5:yes", "Test User");
    expect(payment.pay).not.toHaveBeenCalled();
    expect(reply.text.toLowerCase()).toContain("expirou");
  });

  it("rejects a tap when there is no active pending", async () => {
    const { handler, payment } = makeHandler(
      { kind: "question", text: "x" },
      { findActiveByUser: () => Promise.resolve(null) },
    );
    const reply = await handler.handleCallback(100, "70:yes", "Test User");
    expect(payment.pay).not.toHaveBeenCalled();
    expect(reply.text.toLowerCase()).toContain("expirou");
  });

  it("rejects malformed callback data", async () => {
    const { handler } = makeHandler();
    const reply = await handler.handleCallback(100, "garbage", "Test User");
    expect(reply.text.toLowerCase()).toContain("expirou");
  });

  it("on a double-tap only the tap that claims the pending acts", async () => {
    const { handler, payment, repos } = makeHandler(
      { kind: "question", text: "x" },
      {
        findActiveByUser: () =>
          Promise.resolve(pendingConfirm({ kind: "payment_confirm", target: { type: "transaction", id: 55 }, description: "conta de luz" })),
      },
    );
    (repos.pendingRepo.delete as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    const reply = await handler.handleCallback(100, "70:yes", "Test User");
    expect(payment.pay).not.toHaveBeenCalled();
    expect(reply.text.toLowerCase()).toContain("expirou");
  });
});
