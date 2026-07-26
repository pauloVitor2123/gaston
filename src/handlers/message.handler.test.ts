import { describe, expect, it, vi } from "vitest";
import type {
  ICardRepository,
  ICategoryRepository,
  IPendingConversationRepository,
  IUserRepository,
} from "@/types/repository";
import type { ExtractionResult } from "@/services/extraction/types";
import type { ExtractionContext } from "@/services/extraction/types";
import type { ExtractionService } from "@/services/extraction/extraction";
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

const fullResult: ExtractionResult = {
  intent: "record_expense",
  description: "almoço",
  amount_cents: 3500,
  date: "2025-01-15",
  payment_method: "card",
  card_name: "Nubank",
  category_name: "Alimentação",
  category_confidence: "high",
  direction: "out",
  mantra: "Pagas as Contas",
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
  extractResult: ExtractionResult = fullResult,
  repoOverrides: Parameters<typeof makeRepos>[0] = {},
) {
  const repos = makeRepos(repoOverrides);
  const extraction = {
    extract: vi.fn().mockResolvedValue(extractResult),
  } as unknown as ExtractionService;
  const transactionService = {
    persist: vi.fn().mockResolvedValue(mockTransaction),
  } as unknown as TransactionService;

  const handler = new MessageHandler(
    repos.userRepo,
    repos.categoryRepo,
    repos.cardRepo,
    extraction,
    transactionService,
    repos.pendingRepo,
  );
  return { handler, repos, extraction, transactionService };
}

describe("MessageHandler.handle", () => {
  it("persists transaction and returns confirmation for record_expense", async () => {
    const { handler, transactionService } = makeHandler();

    const reply = await handler.handle(100, "almoço 35 reais nubank", "Test User");

    expect(transactionService.persist).toHaveBeenCalledOnce();
    expect(reply).toContain("Almoço");
    expect(reply).toContain("R$ 35,00");
  });

  it("asks for value when amount_cents is missing and saves pending", async () => {
    const noAmount: ExtractionResult = { ...fullResult, amount_cents: undefined };
    const { handler, repos, transactionService } = makeHandler(noAmount);

    const reply = await handler.handle(100, "almoço nubank", "Test User");

    expect(transactionService.persist).not.toHaveBeenCalled();
    expect(repos.pendingRepo.create).toHaveBeenCalledOnce();
    expect(reply).toContain("valor");
  });

  it("asks for description when description is missing and saves pending", async () => {
    const noDescription: ExtractionResult = { ...fullResult, description: undefined };
    const { handler, repos, transactionService } = makeHandler(noDescription);

    const reply = await handler.handle(100, "35 reais nubank", "Test User");

    expect(transactionService.persist).not.toHaveBeenCalled();
    expect(repos.pendingRepo.create).toHaveBeenCalledOnce();
    expect(reply.toLowerCase()).toContain("gasto");
  });

  it("returns 'Não entendi' for intent unknown", async () => {
    const unknown: ExtractionResult = { ...fullResult, intent: "unknown" };
    const { handler } = makeHandler(unknown);

    const reply = await handler.handle(100, "???", "Test User");

    expect(reply).toContain("Não entendi");
  });

  it("returns 'em breve' for unhandled intents", async () => {
    const query: ExtractionResult = { ...fullResult, intent: "query_balance" };
    const { handler } = makeHandler(query);

    const reply = await handler.handle(100, "/saldo", "Test User");

    expect(reply.toLowerCase()).toContain("breve");
  });

  it("auto-registers new user when not found in DB", async () => {
    const { handler, repos } = makeHandler(fullResult, {
      findByChatId: () => Promise.resolve(null),
    });

    await handler.handle(100, "almoço 35 reais", "New User");

    expect(repos.userRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ telegramChatId: 100, name: "New User" }),
    );
  });

  it("resumes pending conversation when amount_cents was missing", async () => {
    const pending: PendingConversation = {
      id: 77,
      userId: 1,
      stateJson: {
        partial: { ...fullResult, amount_cents: undefined },
        missing: "amount_cents",
        cycles: 1,
      },
      expiresAt: new Date(Date.now() + 60_000),
    };
    const { handler, transactionService, repos } = makeHandler(fullResult, {
      findActiveByUser: () => Promise.resolve(pending),
    });

    const reply = await handler.handle(100, "35 reais", "Test User");

    expect(repos.pendingRepo.delete).toHaveBeenCalledWith(77);
    expect(transactionService.persist).toHaveBeenCalledOnce();
    expect(reply).toContain("R$ 35,00");
  });

  it("re-asks and increments cycle when the reply has no parseable amount", async () => {
    const pending: PendingConversation = {
      id: 55,
      userId: 1,
      stateJson: {
        partial: { ...fullResult, amount_cents: undefined },
        missing: "amount_cents",
        cycles: 0,
      },
      expiresAt: new Date(Date.now() + 60_000),
    };
    const { handler, transactionService, repos } = makeHandler(fullResult, {
      findActiveByUser: () => Promise.resolve(pending),
    });

    const reply = await handler.handle(100, "sei lá", "Test User");

    expect(transactionService.persist).not.toHaveBeenCalled();
    expect(repos.pendingRepo.update).toHaveBeenCalledWith(
      55,
      expect.objectContaining({ missing: "amount_cents", cycles: 1 }),
    );
    expect(reply).toContain("valor");
  });

  it("still persists a valid reply on the last allowed cycle (no premature abort)", async () => {
    const pending: PendingConversation = {
      id: 66,
      userId: 1,
      stateJson: {
        partial: { ...fullResult, amount_cents: undefined },
        missing: "amount_cents",
        cycles: 2,
      },
      expiresAt: new Date(Date.now() + 60_000),
    };
    const { handler, transactionService, repos } = makeHandler(fullResult, {
      findActiveByUser: () => Promise.resolve(pending),
    });

    const reply = await handler.handle(100, "35 reais", "Test User");

    expect(repos.pendingRepo.delete).toHaveBeenCalledWith(66);
    expect(transactionService.persist).toHaveBeenCalledOnce();
    expect(reply).toContain("R$ 35,00");
  });

  it("abandons conversation when the reply fails on the last allowed cycle", async () => {
    const pending: PendingConversation = {
      id: 88,
      userId: 1,
      stateJson: {
        partial: { ...fullResult, amount_cents: undefined },
        missing: "amount_cents",
        cycles: 2,
      },
      expiresAt: new Date(Date.now() + 60_000),
    };
    const { handler, transactionService, repos } = makeHandler(fullResult, {
      findActiveByUser: () => Promise.resolve(pending),
    });

    const reply = await handler.handle(100, "não sei", "Test User");

    expect(repos.pendingRepo.delete).toHaveBeenCalledWith(88);
    expect(transactionService.persist).not.toHaveBeenCalled();
    expect(reply).toContain("Não consegui");
  });

  it("passes correct ExtractionContext (categories + cards) to extraction.extract", async () => {
    const { handler, extraction } = makeHandler();

    await handler.handle(100, "almoço 35", "Test User");

    expect(extraction.extract).toHaveBeenCalledWith(
      "almoço 35",
      expect.objectContaining<Partial<ExtractionContext>>({
        categories: ["Alimentação"],
        cards: ["Nubank"],
      }),
    );
  });
});
