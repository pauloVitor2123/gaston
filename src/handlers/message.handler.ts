import type {
  ICardRepository,
  ICategoryRepository,
  IPendingConversationRepository,
  IUserRepository,
} from "@/types/repository";
import type { LLMMessage } from "@/types/llm";
import type { CollectionAgent } from "@/services/collection/collection-agent";
import type { Direction, TransactionDraft } from "@/services/collection/draft";
import type { Payable, PaymentService, PaymentTarget, RecentPayment } from "@/services/payment/payment.service";
import { PaymentError } from "@/services/payment/errors";
import type { TransactionService, TransactionInput } from "@/services/transaction/transaction.service";
import type { RecurringBillService } from "@/services/recurring/recurring-bill.service";
import type { RecordRecurringBillArgs } from "@/services/recurring/tools";
import type { PendingConversation, RecurringBill, User } from "@/db/schema";
import { sanitizeUserMessage } from "@/services/collection/sanitize";
import { applyMantraRules } from "@/services/collection/mantra-rules";
import { formatReais } from "@/services/money";

type DraftState = { kind: "draft"; messages: LLMMessage[]; cycles: number };
type PaymentConfirmState = {
  kind: "payment_confirm";
  target: PaymentTarget;
  amountCents?: number;
  description: string;
};
type UndoConfirmState = { kind: "undo_confirm"; eventId: number; description: string };
type DeleteRecurringConfirmState = {
  kind: "delete_recurring_confirm";
  billId: number;
  description: string;
};
type ConfirmState = PaymentConfirmState | UndoConfirmState | DeleteRecurringConfirmState;
type PendingState = DraftState | ConfirmState;

const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;
const CONFIRM_TTL_MS = 10 * 60 * 1000;
const MAX_CYCLES = 3;
const MAX_THREAD_MESSAGES = 12;
const RECENT_PAYMENTS_LIMIT = 5;

const EXAMPLES =
  '• "almoço 35 no nubank"\n' +
  '• "recebi 2000 de salário"\n' +
  '• "pix de 300 pra minha mãe dia 10"\n' +
  '• "boleto da internet 299 todo dia 15"\n' +
  '• "paguei a conta de luz"';

const ONBOARDING =
  "Oi! Sou o Gaston, seu assistente financeiro 💸\n\n" +
  "Me conte seus gastos e recebimentos em linguagem natural, por exemplo:\n" +
  EXAMPLES +
  "\n\nMande /help pra ver tudo que eu faço.";

const HELP =
  "🤖 Gaston — o que eu faço\n\n" +
  "Comandos:\n" +
  "/pendentes — o que você ainda tem a pagar\n" +
  "/cancelar — abandona um registro em andamento\n" +
  "/help — mostra esta ajuda\n\n" +
  "Ou é só me escrever naturalmente:\n" +
  EXAMPLES;

const NO_PENDING = "Você não tem nada em aberto. 🎉";

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
    private readonly paymentService: PaymentService,
    private readonly recurringService: RecurringBillService,
    private readonly pendingRepo: IPendingConversationRepository,
  ) {}

  async handle(chatId: number, text: string, senderName: string): Promise<string> {
    try {
      return await this.route(chatId, text, senderName);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      console.error(`MessageHandler.handle failed: ${detail}`, error);
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
        ? "Ok, cancelei o que estava em andamento. 👍"
        : "Não há nada em andamento para cancelar.";
    }
    if (command === "/help") return HELP;
    if (command === "/pendentes") return this.listPending(user);

    const state = pending && isPendingState(pending.stateJson) ? pending.stateJson : null;
    let activePending = pending;
    if (pending && !state) {
      await this.pendingRepo.delete(pending.id);
      activePending = null;
    }

    if (state && state.kind !== "draft") {
      const resolved = await this.resolveConfirmation(pending!, state, text, user);
      if (resolved !== null) return resolved;
      activePending = null;
    }

    return this.runAgent(user, text, state?.kind === "draft" ? state : null, activePending);
  }

  private async listPending(user: User): Promise<string> {
    const payables = await this.paymentService.listPayables(user.id);
    if (payables.length === 0) return NO_PENDING;

    const lines = [...payables]
      .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())
      .map(
        (p) => `• ${p.description} — ${formatReais(p.amountCents)} (vence ${formatDueDate(p.dueDate)})`,
      );
    return `📋 Pendentes:\n${lines.join("\n")}`;
  }

  private async resolveUser(chatId: number, name: string): Promise<User> {
    const existing = await this.userRepo.findByChatId(chatId);
    if (existing) return existing;
    return this.userRepo.create({ telegramChatId: chatId, name });
  }

  private async resolveConfirmation(
    pending: PendingConversation,
    state: ConfirmState,
    text: string,
    user: User,
  ): Promise<string | null> {
    const answer = affirmationOf(text);
    if (answer === null) {
      await this.pendingRepo.delete(pending.id);
      return null;
    }

    await this.pendingRepo.delete(pending.id);
    if (answer === "no") return "Ok, deixei como estava. 👍";

    try {
      if (state.kind === "payment_confirm") {
        const result = await this.paymentService.pay(user.id, state.target, state.amountCents);
        const suffix = result.type === "invoice" && !result.fullyPaid ? " (pagamento parcial)" : "";
        return `✅ Pago: ${result.description} — ${formatReais(result.amountCents)}${suffix}`;
      }
      if (state.kind === "undo_confirm") {
        const undone = await this.paymentService.undo(user.id, state.eventId);
        return `↩️ Estornei: ${undone.description} — ${formatReais(undone.amountCents)}`;
      }
      await this.recurringService.delete(user.id, state.billId);
      return `🗑️ Cancelei a conta recorrente: ${state.description}`;
    } catch (error) {
      if (error instanceof PaymentError) return error.message;
      throw error;
    }
  }

  private async runAgent(
    user: User,
    text: string,
    draft: DraftState | null,
    pending: PendingConversation | null,
  ): Promise<string> {
    const sanitized = sanitizeUserMessage(text);
    const today = todayInTimeZone(user.timezone);
    const [categories, cards, payables, recentPayments, recurringBills] = await Promise.all([
      this.categoryRepo.listByUser(user.id),
      this.cardRepo.listByUser(user.id),
      this.paymentService.listPayables(user.id),
      this.paymentService.listRecentPayments(user.id, RECENT_PAYMENTS_LIMIT),
      this.recurringService.listActive(user.id),
    ]);
    const cardNames = cards.map((c) => c.name);

    const messages: LLMMessage[] = [
      ...(draft?.messages ?? []),
      { role: "user", content: sanitized },
    ];

    const turn = await this.agent.run(messages, {
      categories: categories.map((c) => c.name),
      cards: cardNames,
      today,
      payables,
      recentPayments,
      recurringBills,
    });

    if (turn.kind === "draft") {
      if (pending) await this.pendingRepo.delete(pending.id);
      return this.recordDraft(turn.draft, user, sanitized, today, cardNames);
    }
    if (turn.kind === "pay") {
      return this.startPaymentConfirm(user, pending, turn.target, turn.amountCents, payables);
    }
    if (turn.kind === "undo") {
      return this.startUndoConfirm(user, pending, turn.eventId, recentPayments);
    }
    if (turn.kind === "recurring") {
      if (pending) await this.pendingRepo.delete(pending.id);
      return this.recordRecurring(turn.bill, user, today);
    }
    if (turn.kind === "delete_recurring") {
      return this.startDeleteRecurringConfirm(user, pending, turn.billId, recurringBills);
    }

    const thread: LLMMessage[] = [...messages, { role: "assistant", content: turn.text }];
    const cycles = (draft?.cycles ?? 0) + 1;
    return this.saveQuestion(user, pending, thread, cycles, turn.text);
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
      due_date: draft.due_date,
      already_paid: draft.already_paid,
      payment_method: paymentMethod,
      card_name: matchedCard,
      category_name: draft.category_name,
      mantra: applyMantraRules(draft.description),
    };

    await this.transactionService.persist(input, user.id, rawMessage);
    return this.formatConfirmation(input) + warning;
  }

  private async startPaymentConfirm(
    user: User,
    pending: PendingConversation | null,
    target: PaymentTarget,
    amountCents: number | undefined,
    payables: Payable[],
  ): Promise<string> {
    const payable = payables.find((p) => p.type === target.type && p.id === target.id);
    if (!payable) {
      if (pending) await this.pendingRepo.delete(pending.id);
      return "Não encontrei esse pendente na sua lista. Manda /pendentes pra eu te mostrar o que está em aberto.";
    }

    const amount = amountCents ?? payable.amountCents;
    const state: PaymentConfirmState = {
      kind: "payment_confirm",
      target,
      amountCents,
      description: payable.description,
    };
    await this.replacePending(user, pending, state, CONFIRM_TTL_MS);
    return `Confirma pagar ${payable.description} — ${formatReais(amount)}? (sim/não)`;
  }

  private async startUndoConfirm(
    user: User,
    pending: PendingConversation | null,
    eventId: number,
    recentPayments: RecentPayment[],
  ): Promise<string> {
    const payment = recentPayments.find((p) => p.eventId === eventId);
    if (!payment) {
      if (pending) await this.pendingRepo.delete(pending.id);
      return "Não achei esse pagamento recente pra estornar.";
    }

    const state: UndoConfirmState = {
      kind: "undo_confirm",
      eventId,
      description: payment.description,
    };
    await this.replacePending(user, pending, state, CONFIRM_TTL_MS);
    return `Confirma desfazer o pagamento de ${payment.description} — ${formatReais(payment.amountCents)}? (sim/não)`;
  }

  private async recordRecurring(
    bill: RecordRecurringBillArgs,
    user: User,
    today: string,
  ): Promise<string> {
    const { firstDueDate } = await this.recurringService.create(
      {
        description: bill.description,
        amount_cents: bill.amount_cents,
        due_day: bill.due_day,
        kind: bill.kind,
        payment_method: bill.payment_method,
        category_name: bill.category_name,
        mantra: applyMantraRules(bill.description),
      },
      user.id,
      new Date(`${today}T00:00:00.000Z`),
    );
    return (
      `🔁 Conta recorrente cadastrada: ${bill.description} — ${formatReais(bill.amount_cents)} ` +
      `(todo dia ${bill.due_day}). Próximo vencimento ${formatDueDate(firstDueDate)}.`
    );
  }

  private async startDeleteRecurringConfirm(
    user: User,
    pending: PendingConversation | null,
    billId: number,
    recurringBills: RecurringBill[],
  ): Promise<string> {
    const bill = recurringBills.find((b) => b.id === billId);
    if (!bill) {
      if (pending) await this.pendingRepo.delete(pending.id);
      return "Não achei essa conta recorrente pra cancelar.";
    }

    const state: DeleteRecurringConfirmState = {
      kind: "delete_recurring_confirm",
      billId,
      description: bill.description,
    };
    await this.replacePending(user, pending, state, CONFIRM_TTL_MS);
    return `Confirma cancelar a conta recorrente ${bill.description} — ${formatReais(bill.expectedAmountCents)}/mês? (sim/não)`;
  }

  private async saveQuestion(
    user: User,
    pending: PendingConversation | null,
    messages: LLMMessage[],
    cycles: number,
    question: string,
  ): Promise<string> {
    const state: DraftState = { kind: "draft", messages: messages.slice(-MAX_THREAD_MESSAGES), cycles };

    if (pending) {
      await this.pendingRepo.update(pending.id, state as unknown as Record<string, unknown>);
    } else {
      await this.pendingRepo.create({
        userId: user.id,
        stateJson: state as unknown as Record<string, unknown>,
        expiresAt: new Date(Date.now() + DRAFT_TTL_MS),
      });
    }

    return cycles === MAX_CYCLES ? question + CYCLE_PAUSE : question;
  }

  private async replacePending(
    user: User,
    pending: PendingConversation | null,
    state: PendingState,
    ttlMs: number,
  ): Promise<void> {
    if (pending) await this.pendingRepo.delete(pending.id);
    await this.pendingRepo.create({
      userId: user.id,
      stateJson: state as unknown as Record<string, unknown>,
      expiresAt: new Date(Date.now() + ttlMs),
    });
  }

  private formatConfirmation(input: TransactionInput): string {
    const amount = formatReais(input.amount_cents);
    const description = input.description.charAt(0).toUpperCase() + input.description.slice(1);
    const parts = [description, amount].join(" — ");
    const meta: string[] = [];
    if (input.category_name) meta.push(`📁 ${input.category_name}`);
    if (input.card_name) meta.push(`💳 ${input.card_name}`);
    if (input.mantra) meta.push(`🎯 ${input.mantra}`);
    if (isFutureObligation(input)) meta.push(`🗓️ vence ${dayMonthOf(input.due_date!)} (pendente)`);
    return `✅ ${parts}${meta.length ? `\n${meta.join(" · ")}` : ""}`;
  }
}

function commandOf(text: string): string {
  const first = text.trim().toLowerCase().split(/\s+/)[0] ?? "";
  return first.startsWith("/") ? first : "";
}

function affirmationOf(text: string): "yes" | "no" | null {
  const clean = text.trim().toLowerCase();
  if (/^(sim|s|isso|pode|confirmo?|confirma|ok|claro|aham|yes|👍)\b/.test(clean)) return "yes";
  if (/^(n[ãa]o|n|cancela(r)?|deixa|para|nope|no)\b/.test(clean)) return "no";
  return null;
}

function isFutureObligation(input: TransactionInput): boolean {
  return (
    input.already_paid !== true &&
    input.due_date !== undefined &&
    input.payment_method !== "card"
  );
}

function dayMonthOf(isoDate: string): string {
  const [, month, day] = isoDate.split("-");
  return `${day}/${month}`;
}

function formatDueDate(date: Date): string {
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${day}/${month}`;
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
  if (state.kind === "draft") {
    return typeof state.cycles === "number" && Array.isArray(state.messages) && state.messages.every(isLLMMessage);
  }
  if (state.kind === "payment_confirm") {
    return isTarget(state.target) && typeof state.description === "string";
  }
  if (state.kind === "undo_confirm") {
    return typeof state.eventId === "number" && typeof state.description === "string";
  }
  if (state.kind === "delete_recurring_confirm") {
    return typeof state.billId === "number" && typeof state.description === "string";
  }
  return false;
}

function isTarget(value: unknown): value is PaymentTarget {
  if (typeof value !== "object" || value === null) return false;
  const target = value as Record<string, unknown>;
  return (target.type === "transaction" || target.type === "invoice") && typeof target.id === "number";
}

function isLLMMessage(value: unknown): value is LLMMessage {
  if (typeof value !== "object" || value === null) return false;
  const message = value as Record<string, unknown>;
  return (
    (message.role === "user" || message.role === "assistant" || message.role === "system") &&
    typeof message.content === "string"
  );
}
