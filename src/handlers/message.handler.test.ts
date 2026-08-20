import { describe, expect, it, vi } from "vitest";
import type {
  ICategoryRepository,
  IPendingConversationRepository,
  IUserRepository,
} from "@/types/repository";
import type { AgentTurn, CollectionAgent } from "@/services/collection/collection-agent";
import { PLACEHOLDER_DESCRIPTION, type TransactionDraft } from "@/services/collection/draft";
import type { TransactionService } from "@/services/transaction/transaction.service";
import type { AnalyticsService, SpendingReport } from "@/services/analytics/analytics.service";
import type { Category, PendingConversation, Transaction, User } from "@/db/schema";
import { MessageHandler } from "@/handlers/message.handler";
import { DashboardLink } from "@/services/dashboard/token";
import { FixedClock } from "@/services/clock";

const NOW = new Date("2026-08-05T12:00:00.000Z");
const ORIGIN = "https://gaston.example";

const mockUser: User = {
  id: 1,
  telegramChatId: 100,
  name: "Test User",
  timezone: "America/Sao_Paulo",
  balanceCents: 0,
  balanceSetAt: new Date("2026-08-01"),
  createdAt: new Date(),
} as unknown as User;

const mockCategories: Category[] = [
  { id: 1, userId: 1, name: "Alimentação", synonyms: [] } as Category,
  { id: 2, userId: 1, name: "Outros", synonyms: [] } as Category,
];

const mockTransaction = { id: 99, userId: 1 } as Transaction;

const fullDraft: TransactionDraft = {
  description: "almoço",
  amount_cents: 3500,
  category_name: "Alimentação",
  date: "2025-01-15",
};

function makeRepos(overrides: {
  findByChatId?: () => Promise<User | null>;
  findActiveByUser?: () => Promise<PendingConversation | null>;
} = {}) {
  return {
    userRepo: {
      findByChatId: vi.fn().mockImplementation(overrides.findByChatId ?? (() => Promise.resolve(mockUser))),
      create: vi.fn().mockResolvedValue(mockUser),
    } as unknown as IUserRepository,
    categoryRepo: {
      create: vi.fn(),
      listByUser: vi.fn().mockResolvedValue(mockCategories),
      findByNameOrSynonym: vi.fn(),
    } as unknown as ICategoryRepository,
    pendingRepo: {
      findActiveByUser: vi
        .fn()
        .mockImplementation(overrides.findActiveByUser ?? (() => Promise.resolve(null))),
      create: vi.fn().mockResolvedValue({ id: 1 }),
      update: vi.fn(),
      delete: vi.fn().mockResolvedValue(true),
    } as unknown as IPendingConversationRepository,
  };
}

function makeHandler(
  turn: AgentTurn = { kind: "draft", draft: fullDraft },
  repoOverrides: Parameters<typeof makeRepos>[0] = {},
  report: SpendingReport = { rows: [], totalCents: 0 },
) {
  const repos = makeRepos(repoOverrides);
  const agent = { run: vi.fn().mockResolvedValue(turn) } as unknown as CollectionAgent;
  const transactionService = {
    persist: vi.fn().mockResolvedValue(mockTransaction),
  } as unknown as TransactionService;
  const analytics = {
    aggregate: vi.fn().mockResolvedValue(report),
  } as unknown as AnalyticsService;
  const dashboardLink = new DashboardLink("secret", new FixedClock(NOW));

  const handler = new MessageHandler(
    repos.userRepo,
    repos.categoryRepo,
    agent,
    transactionService,
    analytics,
    repos.pendingRepo,
    dashboardLink,
    new FixedClock(NOW),
  );
  return { handler, repos, agent, transactionService, analytics };
}

function pendingDraft(id: number, cycles: number): PendingConversation {
  return {
    id,
    userId: 1,
    stateJson: {
      kind: "draft",
      messages: [
        { role: "user", content: "almoço" },
        { role: "assistant", content: "Em qual categoria isso entra? Escolha uma: Alimentação." },
      ],
      cycles,
    },
    expiresAt: new Date(Date.now() + 60_000),
  } as unknown as PendingConversation;
}

describe("MessageHandler — record flow", () => {
  it("persists and confirms when the agent yields a draft", async () => {
    const { handler, transactionService } = makeHandler();

    const reply = await handler.handle(100, "almoço 35", "Test", ORIGIN);

    expect(transactionService.persist).toHaveBeenCalledOnce();
    const [input] = (transactionService.persist as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(input).toMatchObject({
      description: "almoço",
      amount_cents: 3500,
      category_name: "Alimentação",
      mantra: "Pagas as Contas",
    });
    expect(reply.text).toContain("Almoço — R$ 35,00");
    expect(reply.text).toContain("📁 Alimentação");
    expect(reply.text).toContain("🎯 Pagas as Contas");
  });

  it("asks for a category when it cannot be resolved and saves the draft", async () => {
    const { handler, repos, transactionService } = makeHandler({
      kind: "draft",
      draft: { description: "coisa aleatória", amount_cents: 5000 },
    });

    const reply = await handler.handle(100, "gastei 50 numa coisa", "Test", ORIGIN);

    expect(transactionService.persist).not.toHaveBeenCalled();
    expect(repos.pendingRepo.create).toHaveBeenCalledOnce();
    expect(reply.text).toContain("Em qual categoria");
    expect(reply.text).toContain("Alimentação");
  });

  it("records a value-only expense under Outros without asking", async () => {
    const { handler, repos, transactionService } = makeHandler({
      kind: "draft",
      draft: { description: PLACEHOLDER_DESCRIPTION, amount_cents: 5000 },
    });

    const reply = await handler.handle(100, "gastei 50", "Test", ORIGIN);

    expect(repos.pendingRepo.create).not.toHaveBeenCalled();
    expect(transactionService.persist).toHaveBeenCalledOnce();
    const [input] = (transactionService.persist as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(input).toMatchObject({
      description: PLACEHOLDER_DESCRIPTION,
      amount_cents: 5000,
      category_name: "Outros",
      mantra: "Pagas as Contas",
    });
    expect(reply.text).toContain("Gasto avulso — R$ 50,00");
    expect(reply.text).toContain("📁 Outros");
  });

  it("treats a capitalized/padded placeholder as value-only", async () => {
    const { handler, repos, transactionService } = makeHandler({
      kind: "draft",
      draft: { description: "  Gasto Avulso  ", amount_cents: 5000 },
    });

    const reply = await handler.handle(100, "gastei 50", "Test", ORIGIN);

    expect(repos.pendingRepo.create).not.toHaveBeenCalled();
    const [input] = (transactionService.persist as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(input.category_name).toBe("Outros");
    expect(reply.text).toContain("📁 Outros");
  });

  it("resolves the category from a follow-up message on the saved draft", async () => {
    const { handler, transactionService } = makeHandler(
      { kind: "draft", draft: { description: "almoço", amount_cents: 3500, category_name: "Alimentação" } },
      { findActiveByUser: () => Promise.resolve(pendingDraft(7, 1)) },
    );

    const reply = await handler.handle(100, "Alimentação", "Test", ORIGIN);

    expect(transactionService.persist).toHaveBeenCalledOnce();
    expect(reply.text).toContain("Almoço — R$ 35,00");
  });
});

describe("MessageHandler — query flow", () => {
  it("formats a spending report from a query turn", async () => {
    const { handler, analytics } = makeHandler(
      { kind: "query", params: { group_by: "category", from: "2026-08-01", to: "2026-08-31" } },
      {},
      { rows: [{ label: "Alimentação", amountCents: 45000 }], totalCents: 45000 },
    );

    const reply = await handler.handle(100, "quanto gastei em comida?", "Test", ORIGIN);

    expect(analytics.aggregate).toHaveBeenCalledWith(1, {
      group_by: "category",
      from: "2026-08-01",
      to: "2026-08-31",
    });
    expect(reply.text).toContain("Alimentação — R$ 450,00");
    expect(reply.text).toContain("Total: R$ 450,00");
  });
});

describe("MessageHandler — commands", () => {
  it("/status summarizes the current month by category", async () => {
    const { handler, analytics } = makeHandler({ kind: "question", text: "?" }, {}, {
      rows: [{ label: "Alimentação", amountCents: 45000 }],
      totalCents: 45000,
    });

    const reply = await handler.handle(100, "/status", "Test", ORIGIN);

    expect(analytics.aggregate).toHaveBeenCalledWith(1, {
      group_by: "category",
      from: "2026-08-01",
      to: "2026-08-05",
    });
    expect(reply.text).toContain("Agosto/2026");
    expect(reply.text).toContain("Alimentação — R$ 450,00");
    expect(reply.text).toContain("/dashboard");
  });

  it("/status reports no spending when the month is empty", async () => {
    const { handler } = makeHandler({ kind: "question", text: "?" });
    const reply = await handler.handle(100, "/status", "Test", ORIGIN);
    expect(reply.text).toContain("Nenhum gasto registrado");
  });

  it("/dashboard returns a personal signed link", async () => {
    const { handler } = makeHandler({ kind: "question", text: "?" });
    const reply = await handler.handle(100, "/dashboard", "Test", ORIGIN);
    expect(reply.text).toContain(`${ORIGIN}/dashboard?u=1&t=`);
  });

  it("/start greets and clears any pending draft", async () => {
    const { handler, repos } = makeHandler({ kind: "question", text: "?" }, {
      findActiveByUser: () => Promise.resolve(pendingDraft(3, 1)),
    });
    const reply = await handler.handle(100, "/start", "Test", ORIGIN);
    expect(reply.text).toContain("Gaston");
    expect(repos.pendingRepo.delete).toHaveBeenCalledWith(3);
  });

  it("/cancelar drops an in-progress draft", async () => {
    const { handler, repos } = makeHandler({ kind: "question", text: "?" }, {
      findActiveByUser: () => Promise.resolve(pendingDraft(9, 1)),
    });
    const reply = await handler.handle(100, "/cancelar", "Test", ORIGIN);
    expect(repos.pendingRepo.delete).toHaveBeenCalledWith(9);
    expect(reply.text).toContain("cancelei");
  });
});

describe("MessageHandler — question flow", () => {
  it("saves a draft and returns the agent question when info is missing", async () => {
    const { handler, repos } = makeHandler({ kind: "question", text: "Qual o valor?" });

    const reply = await handler.handle(100, "gastei no mercado", "Test", ORIGIN);

    expect(repos.pendingRepo.create).toHaveBeenCalledOnce();
    expect(reply.text).toBe("Qual o valor?");
  });
});
