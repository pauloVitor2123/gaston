import type {
  ICardRepository,
  ICategoryRepository,
  IPendingConversationRepository,
  IUserRepository,
} from "@/types/repository";
import type { LLMMessage } from "@/types/llm";
import type { CollectionAgent } from "@/services/collection/collection-agent";
import type { Direction, TransactionDraft } from "@/services/collection/draft";
import type { TransactionService, TransactionInput } from "@/services/transaction/transaction.service";
import type { PendingConversation, User } from "@/db/schema";
import { sanitizeUserMessage } from "@/services/collection/sanitize";
import { applyMantraRules } from "@/services/collection/mantra-rules";

type DraftState = {
  messages: LLMMessage[];
  cycles: number;
};

const TTL_MS = 24 * 60 * 60 * 1000;
const MAX_CYCLES = 3;

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

const CYCLE_PAUSE =
  "\n\nVou deixar esse registro guardado por aqui. Quando quiser continuar, é só me mandar o que falta. 👍";

export class MessageHandler {
  constructor(
    private readonly userRepo: IUserRepository,
    private readonly categoryRepo: ICategoryRepository,
    private readonly cardRepo: ICardRepository,
    private readonly agent: CollectionAgent,
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

    let priorState: DraftState | null = null;
    if (pending) {
      if (isDraftState(pending.stateJson)) {
        priorState = pending.stateJson;
      } else {
        await this.pendingRepo.delete(pending.id);
      }
    }

    const sanitized = sanitizeUserMessage(text);
    const today = todayInTimeZone(user.timezone);
    const [categories, cards] = await Promise.all([
      this.categoryRepo.listByUser(user.id),
      this.cardRepo.listByUser(user.id),
    ]);
    const cardNames = cards.map((c) => c.name);

    const messages: LLMMessage[] = [
      ...(priorState?.messages ?? []),
      { role: "user", content: sanitized },
    ];

    const turn = await this.agent.run(messages, {
      categories: categories.map((c) => c.name),
      cards: cardNames,
      today,
    });

    if (turn.kind === "draft") {
      if (pending) await this.pendingRepo.delete(pending.id);
      return this.recordDraft(turn.draft, user, sanitized, today, cardNames);
    }

    const thread: LLMMessage[] = [...messages, { role: "assistant", content: turn.text }];
    const cycles = (priorState?.cycles ?? 0) + 1;
    return this.saveQuestion(user, pending, thread, cycles, turn.text);
  }

  private async resolveUser(chatId: number, name: string): Promise<User> {
    const existing = await this.userRepo.findByChatId(chatId);
    if (existing) return existing;
    return this.userRepo.create({ telegramChatId: chatId, name });
  }

  private async recordDraft(
    draft: TransactionDraft,
    user: User,
    rawMessage: string,
    today: string,
    cardNames: string[],
  ): Promise<string> {
    const direction: Direction = draft.intent === "record_income" ? "in" : "out";
    const matchedCard = cardNames.find(
      (name) => name.toLowerCase() === (draft.card_name ?? "").toLowerCase(),
    );

    let paymentMethod = draft.payment_method;
    let warning = "";
    if (paymentMethod === "card" && !matchedCard) {
      paymentMethod = "cash";
      warning = UNKNOWN_CARD_WARNING;
    }

    const input: TransactionInput = {
      direction,
      description: draft.description,
      amount_cents: draft.amount_cents,
      date: draft.date ?? today,
      payment_method: paymentMethod,
      card_name: matchedCard,
      category_name: draft.category_name,
      mantra: applyMantraRules(draft.description),
    };

    await this.transactionService.persist(input, user.id, rawMessage);
    return this.formatConfirmation(input) + warning;
  }

  private async saveQuestion(
    user: User,
    pending: PendingConversation | null,
    messages: LLMMessage[],
    cycles: number,
    question: string,
  ): Promise<string> {
    const overflow = cycles >= MAX_CYCLES;
    const state: DraftState = { messages, cycles: overflow ? 0 : cycles };

    if (pending) {
      await this.pendingRepo.update(pending.id, state as unknown as Record<string, unknown>);
    } else {
      await this.pendingRepo.create({
        userId: user.id,
        stateJson: state as unknown as Record<string, unknown>,
        expiresAt: new Date(Date.now() + TTL_MS),
      });
    }

    return overflow ? question + CYCLE_PAUSE : question;
  }

  private formatConfirmation(input: TransactionInput): string {
    const reais = (input.amount_cents / 100).toFixed(2).replace(".", ",");
    const amount = `R$ ${reais}`;
    const description = input.description.charAt(0).toUpperCase() + input.description.slice(1);
    const parts = [description, amount].join(" — ");
    const meta: string[] = [];
    if (input.category_name) meta.push(`📁 ${input.category_name}`);
    if (input.card_name) meta.push(`💳 ${input.card_name}`);
    if (input.mantra) meta.push(`🎯 ${input.mantra}`);
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

function isDraftState(value: unknown): value is DraftState {
  if (typeof value !== "object" || value === null) return false;
  const state = value as Record<string, unknown>;
  return Array.isArray(state.messages) && typeof state.cycles === "number";
}
