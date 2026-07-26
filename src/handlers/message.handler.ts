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

type PendingState = {
  partial: Partial<ExtractionResult>;
  missing: "amount_cents" | "description";
  cycles: number;
};

const TTL_MS = 10 * 60 * 1000;

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
    const user = await this.resolveUser(chatId, senderName);

    const pending = await this.pendingRepo.findActiveByUser(user.id);
    if (pending) {
      return this.resumeConversation(pending, text, user);
    }

    const [categories, cards] = await Promise.all([
      this.categoryRepo.listByUser(user.id),
      this.cardRepo.listByUser(user.id),
    ]);

    const context = {
      categories: categories.map((c) => c.name),
      cards: cards.map((c) => c.name),
      today: new Date().toISOString().slice(0, 10),
    };

    const result = await this.extraction.extract(text, context);

    if (result.intent === "record_expense" || result.intent === "record_income") {
      return this.handleRecord(result, user, text);
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

  private async handleRecord(result: ExtractionResult, user: User, rawMessage: string): Promise<string> {
    if (!result.amount_cents) {
      await this.savePending(user, result, "amount_cents");
      return "Qual o valor?";
    }
    if (!result.description) {
      await this.savePending(user, result, "description");
      return "O que foi esse gasto/recebimento?";
    }
    await this.transactionService.persist(result, user.id, rawMessage);
    return this.formatConfirmation(result);
  }

  private async savePending(
    user: User,
    partial: Partial<ExtractionResult>,
    missing: "amount_cents" | "description",
  ): Promise<void> {
    const state: PendingState = { partial, missing, cycles: 1 };
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

    if (state.cycles >= 3) {
      await this.pendingRepo.delete(pending.id);
      return "Não consegui entender. Tente novamente com mais detalhes.";
    }

    const filled = this.fillMissing(state, text);

    if (!filled.amount_cents || !filled.description) {
      const missing = !filled.amount_cents ? "amount_cents" : "description";
      const nextState: PendingState = { partial: filled, missing, cycles: state.cycles + 1 };
      await this.pendingRepo.update(pending.id, nextState as unknown as Record<string, unknown>);
      return missing === "amount_cents" ? "Qual o valor?" : "O que foi esse gasto/recebimento?";
    }

    await this.pendingRepo.delete(pending.id);
    await this.transactionService.persist(filled as ExtractionResult, user.id, text);
    return this.formatConfirmation(filled as ExtractionResult);
  }

  private fillMissing(state: PendingState, text: string): Partial<ExtractionResult> {
    if (state.missing === "amount_cents") {
      const match = text.match(/\d+[.,]?\d*/);
      if (match) {
        const raw = match[0].replace(",", ".");
        const cents = Math.round(parseFloat(raw) * 100);
        return { ...state.partial, amount_cents: cents };
      }
      return state.partial;
    }
    return { ...state.partial, description: text.trim() };
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
