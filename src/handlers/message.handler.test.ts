import { describe, expect, it, vi } from "vitest";
import type {
  ICardRepository,
  ICategoryRepository,
  IPendingConversationRepository,
  IUserRepository,
} from "@/types/repository";
import type { AgentTurn, CollectionAgent } from "@/services/collection/collection-agent";
import type { CollectionContext } from "@/services/collection/prompts";
import type { TransactionDraft } from "@/services/collection/draft";
import type { TransactionService } from "@/services/transaction/transaction.service";
import type { Card, Category, PendingConversation, Transaction, User } from "@/db/schema";
import { MessageHandler } from "@/handlers/message.handler";

const mockUser: User = {
  id: 1,
  telegramChatId: 100,
  name: "Test User",
  timezone: "America/Sao_Paulo",
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
  createUser?: () => Promise<User>;
  findActiveByUser?: () => Promise<PendingConversation | null>;
} = {}) {
  return {
    userRepo: {
      findByChatId: vi.fn().mockImplementation(overrides.findByChatId ?? (() => Promise.resolve(mockUser))),
      create: vi.fn().mockImplementation(overrides.createUser ?? (() => Promise.resolve(mockUser))),
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
      delete: vi.fn().mockResolvedValue(undefined),
    } as unknown as IPendingConversationRepository,
  };
}

function makeHandler(
  turn: AgentTurn = { kind: "draft", draft: fullDraft },
  repoOverrides: Parameters<typeof makeRepos>[0] = {},
) {
  const repos = makeRepos(repoOverrides);
  const agent = {
    run: vi.fn().mockResolvedValue(turn),
  } as unknown as CollectionAgent;
  const transactionService = {
    persist: vi.fn().mockResolvedValue(mockTransaction),
  } as unknown as TransactionService;

  const handler = new MessageHandler(
    repos.userRepo,
    repos.categoryRepo,
    repos.cardRepo,
    agent,
    transactionService,
    repos.pendingRepo,
  );
  return { handler, repos, agent, transactionService };
}

function pendingDraft(id: number, cycles: number): PendingConversation {
  return {
    id,
    userId: 1,
    stateJson: {
      messages: [
        { role: "user", content: "almoço no nubank" },
        { role: "assistant", content: "Qual o valor?" },
      ],
      cycles,
    },
    expiresAt: new Date(Date.now() + 60_000),
  } as unknown as PendingConversation;
}

describe("MessageHandler.handle", () => {
  it("persists the transaction and returns confirmation when the agent yields a draft", async () => {
    const { handler, transactionService } = makeHandler();

    const reply = await handler.handle(100, "almoço 35 reais nubank", "Test User");

    expect(transactionService.persist).toHaveBeenCalledOnce();
    expect(reply).toContain("Almoço");
    expect(reply).toContain("R$ 35,00");
  });

  it("saves a 24h draft and returns the question when the agent asks something", async () => {
    const { handler, repos, transactionService } = makeHandler({
      kind: "question",
      text: "Qual o valor?",
    });

    const reply = await handler.handle(100, "almoço no nubank", "Test User");

    expect(transactionService.persist).not.toHaveBeenCalled();
    expect(repos.pendingRepo.create).toHaveBeenCalledOnce();
    const created = (repos.pendingRepo.create as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(created.stateJson.messages).toHaveLength(2);
    expect(created.stateJson.cycles).toBe(1);
    const ttlMs = created.expiresAt.getTime() - Date.now();
    expect(ttlMs).toBeGreaterThan(23 * 60 * 60 * 1000);
    expect(reply).toBe("Qual o valor?");
  });

  it("resumes a pending draft and persists when the agent completes it", async () => {
    const { handler, transactionService, repos } = makeHandler(
      { kind: "draft", draft: fullDraft },
      { findActiveByUser: () => Promise.resolve(pendingDraft(77, 1)) },
    );

    const reply = await handler.handle(100, "35 reais", "Test User");

    expect(repos.pendingRepo.delete).toHaveBeenCalledWith(77);
    expect(transactionService.persist).toHaveBeenCalledOnce();
    expect(reply).toContain("R$ 35,00");
  });

  it("appends the turn to the thread and increments the cycle when still incomplete", async () => {
    const { handler, transactionService, repos } = makeHandler(
      { kind: "question", text: "Qual o valor?" },
      { findActiveByUser: () => Promise.resolve(pendingDraft(55, 1)) },
    );

    const reply = await handler.handle(100, "sei lá", "Test User");

    expect(transactionService.persist).not.toHaveBeenCalled();
    const updated = (repos.pendingRepo.update as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(updated[0]).toBe(55);
    expect(updated[1].cycles).toBe(2);
    expect(updated[1].messages).toHaveLength(4);
    expect(reply).toBe("Qual o valor?");
  });

  it("keeps the draft alive (no abort) when the cycle cap is reached", async () => {
    const { handler, transactionService, repos } = makeHandler(
      { kind: "question", text: "Qual o valor?" },
      { findActiveByUser: () => Promise.resolve(pendingDraft(66, 2)) },
    );

    const reply = await handler.handle(100, "não sei", "Test User");

    expect(repos.pendingRepo.delete).not.toHaveBeenCalled();
    expect(transactionService.persist).not.toHaveBeenCalled();
    const updated = (repos.pendingRepo.update as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(updated[1].cycles).toBe(3);
    expect(reply).toContain("guardado");
  });

  it("caps the stored draft thread so it cannot grow unbounded", async () => {
    const longThread = Array.from({ length: 20 }, (_, i) => ({
      role: i % 2 === 0 ? ("user" as const) : ("assistant" as const),
      content: `msg ${i}`,
    }));
    const pending = {
      id: 33,
      userId: 1,
      stateJson: { messages: longThread, cycles: 1 },
      expiresAt: new Date(Date.now() + 60_000),
    } as unknown as PendingConversation;
    const { handler, repos } = makeHandler(
      { kind: "question", text: "Qual o valor?" },
      { findActiveByUser: () => Promise.resolve(pending) },
    );

    await handler.handle(100, "ainda não sei", "Test User");

    const updated = (repos.pendingRepo.update as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(updated[1].messages.length).toBeLessThanOrEqual(12);
  });

  it("auto-registers a new user when not found in DB", async () => {
    const { handler, repos } = makeHandler({ kind: "draft", draft: fullDraft }, {
      findByChatId: () => Promise.resolve(null),
    });

    await handler.handle(100, "almoço 35 reais", "New User");

    expect(repos.userRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ telegramChatId: 100, name: "New User" }),
    );
  });

  it("passes categories and cards as agent context", async () => {
    const { handler, agent } = makeHandler();

    await handler.handle(100, "almoço 35", "Test User");

    expect(agent.run).toHaveBeenCalledWith(
      [{ role: "user", content: "almoço 35" }],
      expect.objectContaining<Partial<CollectionContext>>({
        categories: ["Alimentação"],
        cards: ["Nubank"],
      }),
    );
  });

  it("returns onboarding for /start without invoking the agent", async () => {
    const { handler, agent } = makeHandler();

    const reply = await handler.handle(100, "/start", "Test User");

    expect(reply).toContain("Gaston");
    expect(agent.run).not.toHaveBeenCalled();
  });

  it("cancels an active pending conversation on /cancelar", async () => {
    const { handler, repos, agent } = makeHandler({ kind: "draft", draft: fullDraft }, {
      findActiveByUser: () => Promise.resolve(pendingDraft(42, 0)),
    });

    const reply = await handler.handle(100, "/cancelar", "Test User");

    expect(repos.pendingRepo.delete).toHaveBeenCalledWith(42);
    expect(agent.run).not.toHaveBeenCalled();
    expect(reply.toLowerCase()).toContain("cancelei");
  });

  it("reports nothing to cancel when there is no pending conversation", async () => {
    const { handler } = makeHandler();

    const reply = await handler.handle(100, "/cancelar", "Test User");

    expect(reply.toLowerCase()).toContain("nada em andamento");
  });

  it("falls back to cash and warns when the drafted card is not registered", async () => {
    const unknownCard: TransactionDraft = { ...fullDraft, payment_method: "card", card_name: "Santander" };
    const { handler, transactionService } = makeHandler({ kind: "draft", draft: unknownCard });

    const reply = await handler.handle(100, "comprei uma tv 2000 no santander", "Test User");

    const persisted = (transactionService.persist as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(persisted.payment_method).toBe("cash");
    expect(persisted.card_name).toBeUndefined();
    expect(reply.toLowerCase()).toContain("cartão");
  });

  it("returns a friendly message and does not persist when the agent throws", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const repos = makeRepos();
    const agent = {
      run: vi.fn().mockRejectedValue(new Error("LLM down")),
    } as unknown as CollectionAgent;
    const transactionService = { persist: vi.fn() } as unknown as TransactionService;
    const handler = new MessageHandler(
      repos.userRepo,
      repos.categoryRepo,
      repos.cardRepo,
      agent,
      transactionService,
      repos.pendingRepo,
    );

    const reply = await handler.handle(100, "almoço 35", "Test User");

    expect(reply).toContain("problema");
    expect(transactionService.persist).not.toHaveBeenCalled();
  });

  it("drops a corrupt pending state and processes the message fresh", async () => {
    const corrupt = {
      id: 99,
      userId: 1,
      stateJson: { foo: "bar" },
      expiresAt: new Date(Date.now() + 60_000),
    } as unknown as PendingConversation;
    const { handler, repos, agent } = makeHandler({ kind: "draft", draft: fullDraft }, {
      findActiveByUser: () => Promise.resolve(corrupt),
    });

    await handler.handle(100, "almoço 35 reais nubank", "Test User");

    expect(repos.pendingRepo.delete).toHaveBeenCalledWith(99);
    expect(agent.run).toHaveBeenCalledOnce();
    expect(agent.run).toHaveBeenCalledWith(
      [{ role: "user", content: "almoço 35 reais nubank" }],
      expect.anything(),
    );
  });

  it("defaults the transaction date to the user's timezone today when the draft omits it", async () => {
    const noDate: TransactionDraft = { ...fullDraft, date: undefined };
    const { handler, transactionService } = makeHandler({ kind: "draft", draft: noDate });

    await handler.handle(100, "almoço 35 no nubank", "Test User");

    const persisted = (transactionService.persist as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(persisted.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
