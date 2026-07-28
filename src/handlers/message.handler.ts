import type {
  ICardRepository,
  ICategoryRepository,
  IPendingConversationRepository,
  IUserRepository,
} from "@/types/repository";
import type { ExtractionResult } from "@/services/extraction/types";
import type { ExtractionService } from "@/services/extraction/extraction";
import type { TransactionService } from "@/services/transaction/transaction.service";
import type { PendingConversation, User } from "@/db/schema";
import { sanitizeUserMessage } from "@/services/extraction/sanitize";

type MissingField = "amount_cents" | "description";

type PendingState = {
  partial: Partial<ExtractionResult>;
  missing: MissingField;
  cycles: number;
};

const TTL_MS = 10 * 60 * 1000;
const MAX_CYCLES = 3;

const QUESTIONS: Record<MissingField, string> = {
  amount_cents: "Qual o valor?",
  description: "O que foi esse gasto/recebimento?",
};

const ONBOARDING =
  "Oi! Sou o Gaston, seu assistente financeiro 💸\n\n" +
  "Me conte seus gastos e recebimentos em linguagem natural, por exemplo:\n" +
  '• "almoço 35 no nubank"\n' +
  '• "recebi 2000 de salário"\n\n' +
  "Para abandonar um registro em andamento, mande /cancelar.";

const GENERIC_ERROR =
  "Tive um problema para processar isso agora 😕. Pode tentar de novo em instantes?";

const UNKNOWN_CARD_WARNING =
  "\n⚠️ Não reconheci o cartão citado, registrei como dinheiro. Cadastre-o com /cartao.";

export class MessageHandler {
  constructor(
    private readonly userRepo: IUserRepository,
    private readonly categoryRepo: ICategoryRepository,
    private readonly cardRepo: ICardRepository,
    private readonly extraction: ExtractionService,
    private readonly transactionService: TransactionService,
    private readonly pendingRepo: IPendingConversationRepository,
  ) {}

  async handle(chatId: number, text: string, senderName: string): Promise<string> {
    try {
      return await this.route(chatId, text, senderName);
    } catch (error) {
      console.error("MessageHandler.handle failed", error);
      return GENERIC_ERROR;
    }
  }

  private async route(chatId: number, text: string, senderName: string): Promise<string> {
    const user = await this.resolveUser(chatId, senderName);
    const command = commandOf(text);
    const pending = await this.pendingRepo.findActiveByUser(user.id);

    if (command === "/start") {
      if (pending) await this.pendingRepo.delete(pending.id);
      return ONBOARDING;
    }
    if (command === "/cancelar") {
      if (pending) await this.pendingRepo.delete(pending.id);
      return pending
        ? "Ok, cancelei o registro em andamento. 👍"
        : "Não há nada em andamento para cancelar.";
    }

    if (pending) {
      if (isPendingState(pending.stateJson)) {
        return this.resumeConversation(pending, text, user);
      }
      await this.pendingRepo.delete(pending.id);
    }

    const today = todayInTimeZone(user.timezone);
    const [categories, cards] = await Promise.all([
      this.categoryRepo.listByUser(user.id),
      this.cardRepo.listByUser(user.id),
    ]);

    const context = {
      categories: categories.map((c) => c.name),
      cards: cards.map((c) => c.name),
      today,
    };

    const result = await this.extraction.extract(text, context);

    if (result.intent === "record_expense" || result.intent === "record_income") {
      return this.handleRecord(result, user, text, today);
    }
    if (result.intent === "unknown") {
      return "Não entendi, pode reformular?";
    }
    return "Funcionalidade em breve.";
  }

  private async resolveUser(chatId: number, name: string): Promise<User> {
    const existing = await this.userRepo.findByChatId(chatId);
    if (existing) return existing;
    return this.userRepo.create({ telegramChatId: chatId, name });
  }

  private async handleRecord(
    result: ExtractionResult,
    user: User,
    rawMessage: string,
    today: string,
  ): Promise<string> {
    const missing = firstMissingField(result);
    if (missing) {
      await this.savePending(user, result, missing);
      return QUESTIONS[missing];
    }
    return this.recordTransaction(result, user, rawMessage, today);
  }

  private async recordTransaction(
    result: ExtractionResult,
    user: User,
    rawMessage: string,
    today: string,
  ): Promise<string> {
    let finalized: ExtractionResult = { ...result, date: result.date ?? today };
    let warning = "";
    if (finalized.payment_method === "card" && !finalized.card_name) {
      finalized = { ...finalized, payment_method: "cash" };
      warning = UNKNOWN_CARD_WARNING;
    }
    await this.transactionService.persist(finalized, user.id, rawMessage);
    return this.formatConfirmation(finalized) + warning;
  }

  private async savePending(
    user: User,
    partial: Partial<ExtractionResult>,
    missing: MissingField,
  ): Promise<void> {
    const state: PendingState = { partial, missing, cycles: 0 };
    await this.pendingRepo.create({
      userId: user.id,
      stateJson: state as unknown as Record<string, unknown>,
      expiresAt: new Date(Date.now() + TTL_MS),
    });
  }

  private async resumeConversation(
    pending: PendingConversation,
    text: string,
    user: User,
  ): Promise<string> {
    const state = pending.stateJson as unknown as PendingState;
    const filled = fillMissing(state, text);

    const missing = firstMissingField(filled);
    if (!missing) {
      await this.pendingRepo.delete(pending.id);
      return this.recordTransaction(
        filled as ExtractionResult,
        user,
        text,
        todayInTimeZone(user.timezone),
      );
    }

    const cycles = state.cycles + 1;
    if (cycles >= MAX_CYCLES) {
      await this.pendingRepo.delete(pending.id);
      return "Não consegui entender. Tente novamente com mais detalhes.";
    }

    const nextState: PendingState = { partial: filled, missing, cycles };
    await this.pendingRepo.update(pending.id, nextState as unknown as Record<string, unknown>);
    return QUESTIONS[missing];
  }

  private formatConfirmation(result: ExtractionResult): string {
    const reais = ((result.amount_cents ?? 0) / 100).toFixed(2).replace(".", ",");
    const amount = `R$ ${reais}`;
    const description = result.description
      ? result.description.charAt(0).toUpperCase() + result.description.slice(1)
      : "";
    const parts = [description, amount].join(" — ");
    const meta: string[] = [];
    if (result.category_name) meta.push(`📁 ${result.category_name}`);
    if (result.card_name) meta.push(`💳 ${result.card_name}`);
    if (result.mantra) meta.push(`🎯 ${result.mantra}`);
    return `✅ ${parts}${meta.length ? `\n${meta.join(" · ")}` : ""}`;
  }
}

function commandOf(text: string): string {
  const first = text.trim().toLowerCase().split(/\s+/)[0] ?? "";
  return first.startsWith("/") ? first : "";
}

function todayInTimeZone(timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function isPendingState(value: unknown): value is PendingState {
  if (typeof value !== "object" || value === null) return false;
  const state = value as Record<string, unknown>;
  return (
    (state.missing === "amount_cents" || state.missing === "description") &&
    typeof state.cycles === "number" &&
    typeof state.partial === "object" &&
    state.partial !== null
  );
}

function firstMissingField(partial: Partial<ExtractionResult>): MissingField | null {
  if (partial.amount_cents == null) return "amount_cents";
  if (!partial.description) return "description";
  return null;
}

function fillMissing(state: PendingState, text: string): Partial<ExtractionResult> {
  const clean = sanitizeUserMessage(text);
  if (state.missing === "amount_cents") {
    const cents = parseAmountToCents(clean);
    return cents == null ? state.partial : { ...state.partial, amount_cents: cents };
  }
  return { ...state.partial, description: clean.trim() };
}

function parseAmountToCents(text: string): number | null {
  const match = text.match(/\d[\d.,]*/);
  if (!match) return null;
  const token = match[0].replace(/[.,]+$/, "");
  return brNumberToCents(token);
}

function brNumberToCents(token: string): number | null {
  const hasComma = token.includes(",");
  const hasDot = token.includes(".");

  let normalized: string;
  if (hasComma && hasDot) {
    normalized =
      token.lastIndexOf(",") > token.lastIndexOf(".")
        ? token.replace(/\./g, "").replace(",", ".")
        : token.replace(/,/g, "");
  } else if (hasComma) {
    normalized = token.replace(/\./g, "").replace(",", ".");
  } else if (hasDot) {
    const parts = token.split(".");
    const last = parts[parts.length - 1] ?? "";
    normalized = parts.length > 2 || last.length === 3 ? token.replace(/\./g, "") : token;
  } else {
    normalized = token;
  }

  const value = parseFloat(normalized);
  if (Number.isNaN(value)) return null;
  return Math.round(value * 100);
}
