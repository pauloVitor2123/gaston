import { describe, expect, it, vi } from "vitest";
import type {
  ICategoryRepository,
  IPendingConversationRepository,
  IPlatformRepository,
  IUserRepository,
  IWorkLogRepository,
} from "@/types/repository";
import type { UndoService } from "@/services/undo/undo.service";
import type { WeeklyReportService } from "@/services/metrics/weekly-report.service";
import { summarizeWeek, type WeekInputs } from "@/services/metrics/weekly-summary";
import { parseUtcDate } from "@/services/dates";
import type { AgentTurn, CollectionAgent } from "@/services/collection/collection-agent";
import { PLACEHOLDER_DESCRIPTION, type TransactionDraft, type WorkLogDraft } from "@/services/collection/draft";
import type { TransactionService } from "@/services/transaction/transaction.service";
import type { AnalyticsService, SpendingReport } from "@/services/analytics/analytics.service";
import type { Category, PendingConversation, Platform, Transaction, User } from "@/db/schema";
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
  { id: 1, userId: 1, name: "Alimentação", synonyms: [], parentId: null } as Category,
  { id: 2, userId: 1, name: "Outros", synonyms: [], parentId: null } as Category,
  { id: 3, userId: 1, name: "Transporte", synonyms: ["transporte"], parentId: null } as Category,
  { id: 4, userId: 1, name: "Combustível", synonyms: ["gasolina", "gnv"], parentId: 3 } as Category,
];

const mockPlatforms: Platform[] = [
  { id: 10, userId: 1, name: "Uber", synonyms: ["uber"] },
  { id: 11, userId: 1, name: "99", synonyms: ["99", "99pop"] },
];

const mockTransaction = { id: 99, userId: 1 } as Transaction;

type AgentTurnDrafts = Extract<AgentTurn, { kind: "drafts" }>;

const BATCH_ID = "batch-fixed";
const UNDO = { id: `undo:${BATCH_ID}`, label: "↩️ Desfazer" };

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
    workLogRepo: {
      create: vi.fn().mockResolvedValue({ id: 1 }),
      listActive: vi.fn(),
      cancelBatch: vi.fn(),
    } as unknown as IWorkLogRepository,
    platformRepo: {
      listByUser: vi.fn().mockResolvedValue(mockPlatforms),
      create: vi.fn().mockImplementation(async (data: { name: string }) => ({ id: 50, userId: 1, synonyms: [], ...data })),
    } as unknown as IPlatformRepository,
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
  turn: AgentTurn = { kind: "drafts", drafts: [fullDraft], incomes: [], workLogs: [] },
  repoOverrides: Parameters<typeof makeRepos>[0] = {},
  report: SpendingReport = { rows: [], totalCents: 0 },
  week: WeekInputs = { weekStart: parseUtcDate("2026-08-03"), days: [], incomeByPlatform: [], workLogs: [] },
) {
  const repos = makeRepos(repoOverrides);
  const agent = { run: vi.fn().mockResolvedValue(turn) } as unknown as CollectionAgent;
  const transactionService = {
    persist: vi.fn().mockResolvedValue(mockTransaction),
    persistIncome: vi.fn().mockResolvedValue(mockTransaction),
  } as unknown as TransactionService;
  const undoService = { undo: vi.fn().mockResolvedValue("undone") } as unknown as UndoService;
  const analytics = {
    aggregate: vi.fn().mockResolvedValue(report),
  } as unknown as AnalyticsService;
  const weeklyReport = {
    summarize: vi.fn().mockResolvedValue(summarizeWeek(week)),
  } as unknown as WeeklyReportService;
  const dashboardLink = new DashboardLink("secret", new FixedClock(NOW));

  const handler = new MessageHandler(
    repos.userRepo,
    repos.categoryRepo,
    repos.platformRepo,
    repos.workLogRepo,
    agent,
    transactionService,
    undoService,
    analytics,
    weeklyReport,
    repos.pendingRepo,
    dashboardLink,
    new FixedClock(NOW),
    () => BATCH_ID,
  );
  return { handler, repos, agent, transactionService, undoService, analytics, weeklyReport };
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
    expect(reply.text).not.toContain("Pagas as Contas");
    expect(reply.text).not.toContain("🎯");
  });

  it("resolves the subcategory from the description and shows it in the confirmation", async () => {
    const { handler, transactionService } = makeHandler({
      kind: "drafts",
      incomes: [], workLogs: [],
      drafts: [{ description: "gasolina", amount_cents: 10000 }],
    });

    const reply = await handler.handle(100, "gasolina 100", "Test", ORIGIN);

    const [input] = (transactionService.persist as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(input.category_name).toBe("Transporte");
    expect(input.subcategory_id).toBe(4);
    expect(reply.text).toContain("Combustível");
  });

  it("reuses an existing subcategory proposed by the LLM when the description matches none", async () => {
    const { handler, repos, transactionService } = makeHandler({
      kind: "drafts",
      incomes: [], workLogs: [],
      drafts: [
        { description: "paguei 30", amount_cents: 3000, category_name: "Transporte", subcategory_name: "Combustível" },
      ],
    });

    await handler.handle(100, "transporte 30", "Test", ORIGIN);

    expect(repos.categoryRepo.create).not.toHaveBeenCalled();
    const [input] = (transactionService.persist as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(input.category_name).toBe("Transporte");
    expect(input.subcategory_id).toBe(4);
  });

  it("creates a new subcategory proposed by the LLM and persists its id", async () => {
    const created = { id: 77, userId: 1, name: "Pedágio", synonyms: [], parentId: 3 } as Category;
    const { handler, repos, transactionService } = makeHandler({
      kind: "drafts",
      incomes: [], workLogs: [],
      drafts: [
        { description: "paguei 30", amount_cents: 3000, category_name: "Transporte", subcategory_name: "Pedágio" },
      ],
    });
    (repos.categoryRepo.create as ReturnType<typeof vi.fn>).mockResolvedValue(created);

    await handler.handle(100, "transporte 30", "Test", ORIGIN);

    expect(repos.categoryRepo.create).toHaveBeenCalledWith({
      userId: 1,
      name: "Pedágio",
      parentId: 3,
      synonyms: [],
    });
    const [input] = (transactionService.persist as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(input.subcategory_id).toBe(77);
  });

  it("asks for a category when it cannot be resolved and saves the draft", async () => {
    const { handler, repos, transactionService } = makeHandler({
      kind: "drafts",
      incomes: [], workLogs: [],
      drafts: [{ description: "coisa aleatória", amount_cents: 5000 }],
    });

    const reply = await handler.handle(100, "gastei 50 numa coisa", "Test", ORIGIN);

    expect(transactionService.persist).not.toHaveBeenCalled();
    expect(repos.pendingRepo.create).toHaveBeenCalledOnce();
    expect(reply.text).toContain("Em qual categoria");
    expect(reply.text).toContain("Alimentação");
  });

  it("records a value-only expense under Outros without asking", async () => {
    const { handler, repos, transactionService } = makeHandler({
      kind: "drafts",
      incomes: [], workLogs: [],
      drafts: [{ description: PLACEHOLDER_DESCRIPTION, amount_cents: 5000 }],
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
      kind: "drafts",
      incomes: [], workLogs: [],
      drafts: [{ description: "  Gasto Avulso  ", amount_cents: 5000 }],
    });

    const reply = await handler.handle(100, "gastei 50", "Test", ORIGIN);

    expect(repos.pendingRepo.create).not.toHaveBeenCalled();
    const [input] = (transactionService.persist as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(input.category_name).toBe("Outros");
    expect(reply.text).toContain("📁 Outros");
  });

  it("resolves the category from a follow-up message on the saved draft", async () => {
    const { handler, transactionService } = makeHandler(
      { kind: "drafts", drafts: [{ description: "almoço", amount_cents: 3500, category_name: "Alimentação" }], incomes: [], workLogs: [] },
      { findActiveByUser: () => Promise.resolve(pendingDraft(7, 1)) },
    );

    const reply = await handler.handle(100, "Alimentação", "Test", ORIGIN);

    expect(transactionService.persist).toHaveBeenCalledOnce();
    expect(reply.text).toContain("Almoço — R$ 35,00");
  });
});

describe("MessageHandler — batch flow", () => {
  const batchTurn: AgentTurn = {
    kind: "drafts",
      incomes: [], workLogs: [],
    drafts: [
      { description: "gasolina", amount_cents: 10000, category_name: "Alimentação" },
      { description: "estacionamento", amount_cents: 5000 },
    ],
  };

  it("records every expense and confirms them in one message with a total", async () => {
    const { handler, transactionService } = makeHandler(batchTurn);

    const reply = await handler.handle(100, "gastei 100 com gasolina e 50 com estacionamento", "Test", ORIGIN);

    expect(transactionService.persist).toHaveBeenCalledTimes(2);
    expect(reply.text).toContain("2 gastos registrados — R$ 150,00");
    expect(reply.text).toContain("Gasolina — R$ 100,00");
    expect(reply.text).toContain("Estacionamento — R$ 50,00");
  });

  it("never asks for a category in a batch: unresolved falls back to Outros", async () => {
    const { handler, repos, transactionService } = makeHandler(batchTurn);

    await handler.handle(100, "gasolina 100 e estacionamento 50", "Test", ORIGIN);

    expect(repos.pendingRepo.create).not.toHaveBeenCalled();
    const secondInput = (transactionService.persist as ReturnType<typeof vi.fn>).mock.calls[1]![0];
    expect(secondInput.category_name).toBe("Outros");
  });

  it("assigns a subcategory per item and leaves unmatched items without one", async () => {
    const { handler, transactionService } = makeHandler({
      kind: "drafts",
      incomes: [], workLogs: [],
      drafts: [
        { description: "gasolina", amount_cents: 10000 },
        { description: "estacionamento", amount_cents: 5000 },
      ],
    });

    await handler.handle(100, "gasolina 100 e estacionamento 50", "Test", ORIGIN);

    const persist = transactionService.persist as ReturnType<typeof vi.fn>;
    const first = persist.mock.calls[0]![0];
    const second = persist.mock.calls[1]![0];
    expect(first.category_name).toBe("Transporte");
    expect(first.subcategory_id).toBe(4);
    expect(second.category_name).toBe("Outros");
    expect(second.subcategory_id).toBeUndefined();
  });

  it("clears an in-progress pending draft after recording the batch", async () => {
    const { handler, repos } = makeHandler(batchTurn, {
      findActiveByUser: () => Promise.resolve(pendingDraft(5, 1)),
    });

    await handler.handle(100, "gasolina 100 e estacionamento 50", "Test", ORIGIN);

    expect(repos.pendingRepo.delete).toHaveBeenCalledWith(5);
  });

  it("is best-effort: records the survivors and warns about the one that failed", async () => {
    const { handler, transactionService } = makeHandler(batchTurn);
    (transactionService.persist as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(mockTransaction)
      .mockRejectedValueOnce(new Error("db down"));

    const reply = await handler.handle(100, "gasolina 100 e estacionamento 50", "Test", ORIGIN);

    expect(reply.text).toContain("1 gasto registrado — R$ 100,00");
    expect(reply.text).toContain("Gasolina — R$ 100,00");
    expect(reply.text).toContain("Não consegui registrar");
    expect(reply.text).toContain("Estacionamento");
  });

  it("caps the batch at 10 items and warns about the excess", async () => {
    const drafts = Array.from({ length: 12 }, (_, i) => ({
      description: `item ${i}`,
      amount_cents: 100,
      category_name: "Alimentação",
    }));
    const { handler, transactionService } = makeHandler({ kind: "drafts", drafts, incomes: [], workLogs: [] });

    const reply = await handler.handle(100, "muitos gastos", "Test", ORIGIN);

    expect(transactionService.persist).toHaveBeenCalledTimes(10);
    expect(reply.text).toContain("Ignorei 2");
  });
});

describe("MessageHandler — income and undo", () => {
  it("offers an undo button tied to the message batch on a single expense", async () => {
    const { handler, transactionService } = makeHandler();

    const reply = await handler.handle(100, "almoço 35", "Test", ORIGIN);

    expect(reply.actions).toEqual([UNDO]);
    const persistCall = (transactionService.persist as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(persistCall[4]).toBe(BATCH_ID);
  });

  it("records an income on a known platform and confirms it with undo", async () => {
    const { handler, transactionService, repos } = makeHandler({
      kind: "drafts",
      drafts: [],
      incomes: [{ amount_cents: 28000, platform_name: "uber" }], workLogs: [],
    });

    const reply = await handler.handle(100, "recebi 280 da uber", "Test", ORIGIN);

    expect(repos.platformRepo.create).not.toHaveBeenCalled();
    expect(transactionService.persistIncome).toHaveBeenCalledWith(
      { amount_cents: 28000, date: undefined, platform_id: 10, platform_name: "Uber" },
      1,
      "recebi 280 da uber",
      expect.any(Date),
      BATCH_ID,
    );
    expect(reply.text).toBe("💰 Receita Uber — R$ 280,00");
    expect(reply.actions).toEqual([UNDO]);
  });

  it("records a platform-less income without asking", async () => {
    const { handler, transactionService, repos } = makeHandler({
      kind: "drafts",
      drafts: [],
      incomes: [{ amount_cents: 30000 }], workLogs: [],
    });

    const reply = await handler.handle(100, "faturamento 300", "Test", ORIGIN);

    expect(repos.pendingRepo.create).not.toHaveBeenCalled();
    const [input] = (transactionService.persistIncome as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(input.platform_id).toBeUndefined();
    expect(reply.text).toBe("💰 Receita — R$ 300,00");
  });

  it("creates a new platform once even when it appears twice in the same message", async () => {
    const { handler, repos, transactionService } = makeHandler({
      kind: "drafts",
      drafts: [],
      incomes: [
        { amount_cents: 10000, platform_name: "InDrive" },
        { amount_cents: 5000, platform_name: "indrive" },
      ],
      workLogs: [],
    });

    await handler.handle(100, "indrive 100 e indrive 50", "Test", ORIGIN);

    expect(repos.platformRepo.create).toHaveBeenCalledOnce();
    expect(repos.platformRepo.create).toHaveBeenCalledWith({ userId: 1, name: "InDrive", synonyms: [] });
    const calls = (transactionService.persistIncome as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.map((c) => c[0].platform_id)).toEqual([50, 50]);
  });

  it("records a mixed message as one batch with one undo button", async () => {
    const { handler, transactionService } = makeHandler({
      kind: "drafts",
      drafts: [
        { description: "gnv", amount_cents: 9000 },
        { description: "almoço", amount_cents: 3000, category_name: "Alimentação" },
      ],
      incomes: [{ amount_cents: 28000, platform_name: "Uber" }], workLogs: [],
    });

    const reply = await handler.handle(100, "gnv 90, almoço 30 e recebi 280 da uber", "Test", ORIGIN);

    expect(transactionService.persist).toHaveBeenCalledTimes(2);
    expect(transactionService.persistIncome).toHaveBeenCalledOnce();
    const persistBatchIds = (transactionService.persist as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[4]);
    expect(persistBatchIds).toEqual([BATCH_ID, BATCH_ID]);
    expect(reply.text).toContain("2 gastos registrados — R$ 120,00");
    expect(reply.text).toContain("1 receita registrada — R$ 280,00");
    expect(reply.text).toContain("Receita Uber — R$ 280,00");
    expect(reply.actions).toEqual([UNDO]);
  });

  it("does not offer undo when nothing could be recorded", async () => {
    const { handler, transactionService } = makeHandler({
      kind: "drafts",
      drafts: [],
      incomes: [{ amount_cents: 28000, platform_name: "Uber" }], workLogs: [],
    });
    (transactionService.persistIncome as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("db down"));

    const reply = await handler.handle(100, "recebi 280 da uber", "Test", ORIGIN);

    expect(reply.text).toContain("Não consegui registrar");
    expect(reply.actions).toBeUndefined();
  });

  it("undoes the batch named in the callback", async () => {
    const { handler, undoService } = makeHandler();

    const reply = await handler.handleCallback(100, `undo:${BATCH_ID}`);

    expect(undoService.undo).toHaveBeenCalledWith(1, BATCH_ID);
    expect(reply?.text).toContain("Desfeito");
  });

  it("says when the batch was already undone", async () => {
    const { handler, undoService } = makeHandler();
    (undoService.undo as ReturnType<typeof vi.fn>).mockResolvedValue("already_undone");

    const reply = await handler.handleCallback(100, `undo:${BATCH_ID}`);

    expect(reply?.text).toContain("já tinha sido desfeito");
  });

  it("ignores callbacks it does not own", async () => {
    const { handler, undoService } = makeHandler();

    expect(await handler.handleCallback(100, "7:yes")).toBeNull();
    expect(undoService.undo).not.toHaveBeenCalled();
  });
});

describe("MessageHandler — work logs", () => {
  function logTurn(workLogs: WorkLogDraft[], incomes: AgentTurnDrafts["incomes"] = []): AgentTurn {
    return { kind: "drafts", drafts: [], incomes, workLogs };
  }

  it("records a daily work log for today with undo", async () => {
    const { handler, repos } = makeHandler(logTurn([{ km: 230, online_minutes: 600, rides: 22 }]));

    const reply = await handler.handle(100, "rodei 230km, 10h online, 22 corridas", "Test", ORIGIN);

    expect(repos.workLogRepo.create).toHaveBeenCalledWith({
      userId: 1,
      period: "day",
      periodStart: parseUtcDate("2026-08-05"),
      km: 230,
      onlineMinutes: 600,
      rides: 22,
      batchId: BATCH_ID,
      rawMessage: "rodei 230km, 10h online, 22 corridas",
    });
    expect(reply.text).toContain("🚗 Jornada de qua 05/08 — 230 km · 10h00 online · 22 corridas");
    expect(reply.actions).toEqual([UNDO]);
  });

  it("anchors a weekly work log to the Monday of the stated day", async () => {
    const { handler, repos } = makeHandler(logTurn([{ period: "week", date: "2026-08-07", km: 1200 }]));

    await handler.handle(100, "essa semana rodei 1200km", "Test", ORIGIN);

    const [row] = (repos.workLogRepo.create as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(row).toMatchObject({ period: "week", periodStart: parseUtcDate("2026-08-03"), km: 1200, onlineMinutes: null });
  });

  it("records income and work log of the same message in one batch", async () => {
    const { handler, transactionService, repos } = makeHandler(
      logTurn([{ online_minutes: 540 }], [{ amount_cents: 28000, platform_name: "Uber" }]),
    );

    const reply = await handler.handle(100, "recebi 280 da uber e fiquei 9h online", "Test", ORIGIN);

    expect(transactionService.persistIncome).toHaveBeenCalledOnce();
    expect(repos.workLogRepo.create).toHaveBeenCalledOnce();
    expect(reply.text).toContain("1 receita registrada");
    expect(reply.text).toContain("9h00 online");
    expect(reply.actions).toEqual([UNDO]);
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

  it("formats an income-by-platform report", async () => {
    const params = { subject: "income" as const, group_by: "platform" as const, from: "2026-08-01", to: "2026-08-31" };
    const { handler, analytics } = makeHandler(
      { kind: "query", params },
      {},
      {
        rows: [
          { label: "Uber", amountCents: 28000 },
          { label: "99", amountCents: 30000 },
        ],
        totalCents: 58000,
      },
    );

    const reply = await handler.handle(100, "quanto ganhei por app esse mês?", "Test", ORIGIN);

    expect(analytics.aggregate).toHaveBeenCalledWith(1, params);
    expect(reply.text).toContain("💰 Receitas 2026-08-01 → 2026-08-31");
    expect(reply.text).toContain("Uber — R$ 280,00");
    expect(reply.text).toContain("Total: R$ 580,00");
  });

  it("indents subcategories in a category query report", async () => {
    const { handler } = makeHandler(
      { kind: "query", params: { group_by: "category", from: "2026-08-01", to: "2026-08-31" } },
      {},
      {
        rows: [
          {
            label: "Transporte",
            amountCents: 45000,
            subcategories: [{ label: "Combustível", amountCents: 30000 }],
          },
        ],
        totalCents: 45000,
      },
    );

    const reply = await handler.handle(100, "gastos por categoria", "Test", ORIGIN);

    expect(reply.text).toContain("Transporte — R$ 450,00");
    expect(reply.text).toContain("↳ Combustível — R$ 300,00");
  });
});

describe("MessageHandler — commands", () => {
  it("/status summarizes the current week for today", async () => {
    const { handler, weeklyReport } = makeHandler({ kind: "question", text: "?" }, {}, undefined, {
      weekStart: parseUtcDate("2026-08-03"),
      days: [{ date: parseUtcDate("2026-08-04"), incomeCents: 30000, expenseCents: 9000 }],
      incomeByPlatform: [{ label: "Uber", amountCents: 30000 }],
      workLogs: [{ period: "day", periodStart: parseUtcDate("2026-08-04"), km: 120, onlineMinutes: 300, rides: null }],
    });

    const reply = await handler.handle(100, "/status", "Test", ORIGIN);

    expect(weeklyReport.summarize).toHaveBeenCalledWith(1, parseUtcDate("2026-08-05"));
    expect(reply.text).toContain("📊 Semana 03/08 – 09/08");
    expect(reply.text).toContain("Receita R$ 300,00 (Uber R$ 300,00)");
    expect(reply.text).toContain("Lucro R$ 210,00");
    expect(reply.text).toContain("R$ 60,00/h");
    expect(reply.text).toContain("/dashboard");
  });

  it("/status reports an empty week", async () => {
    const { handler } = makeHandler({ kind: "question", text: "?" });
    const reply = await handler.handle(100, "/status", "Test", ORIGIN);
    expect(reply.text).toContain("Nada registrado nesta semana ainda.");
  });

  it("answers a productivity query with the summary of the asked week", async () => {
    const { handler, weeklyReport, analytics } = makeHandler({
      kind: "query",
      params: { subject: "productivity", group_by: "none", from: "2026-07-29", to: "2026-07-29" },
    });

    const reply = await handler.handle(100, "como foi a semana passada?", "Test", ORIGIN);

    expect(weeklyReport.summarize).toHaveBeenCalledWith(1, parseUtcDate("2026-07-29"));
    expect(analytics.aggregate).not.toHaveBeenCalled();
    expect(reply.text).toContain("📊 Semana");
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
