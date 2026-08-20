import type {
  ICategoryRepository,
  IPendingConversationRepository,
  IUserRepository,
} from "@/types/repository";
import type { LLMMessage } from "@/types/llm";
import type { CollectionAgent } from "@/services/collection/collection-agent";
import { PLACEHOLDER_DESCRIPTION, type TransactionDraft } from "@/services/collection/draft";
import type { TransactionService, TransactionInput } from "@/services/transaction/transaction.service";
import { firstOfMonth, parseUtcDate, toIsoDate } from "@/services/dates";
import type { Clock } from "@/services/clock";
import type { Category, PendingConversation, User } from "@/db/schema";
import { sanitizeUserMessage } from "@/services/collection/sanitize";
import { applyMantraRules } from "@/services/collection/mantra-rules";
import { resolveCategory } from "@/services/collection/category-rules";
import type { AnalyticsService, SpendingReport } from "@/services/analytics/analytics.service";
import type { QuerySpendingArgs } from "@/services/analytics/query";
import type { DashboardLink } from "@/services/dashboard/token";
import { formatReais } from "@/services/money";
import type { BotReply } from "@/handlers/reply";

type DraftState = { kind: "draft"; messages: LLMMessage[]; cycles: number };

const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_CYCLES = 3;
const MAX_THREAD_MESSAGES = 12;
const FALLBACK_CATEGORY_NAME = "Outros";

const EXAMPLES =
  '• "gastei 20 na padaria"\n' +
  '• "uber 10"\n' +
  '• "mercado 130 ontem"\n' +
  '• "quanto gastei esse mês?"';

const ONBOARDING =
  "Oi! Sou o Gaston, seu registrador de gastos 💸\n\n" +
  "Me conte seus gastos em linguagem natural, por exemplo:\n" +
  EXAMPLES +
  "\n\nMande /help pra ver tudo que eu faço.";

const HELP =
  "🐷 Gaston — o que eu faço\n\n" +
  "É só me escrever seus gastos naturalmente:\n" +
  EXAMPLES +
  "\n\nComandos:\n" +
  "/status — resumo dos gastos do mês por categoria\n" +
  "/dashboard — link do painel com gráficos e filtros\n" +
  "/cancelar — abandona um registro em andamento\n" +
  "/help — mostra esta ajuda";

const GENERIC_ERROR =
  "Tive um problema para processar isso agora 😕. Pode tentar de novo em instantes?";

const CYCLE_PAUSE =
  "\n\nVou deixar esse registro guardado por aqui. Quando quiser continuar, é só me mandar o que falta. 👍";

export class MessageHandler {
  constructor(
    private readonly userRepo: IUserRepository,
    private readonly categoryRepo: ICategoryRepository,
    private readonly agent: CollectionAgent,
    private readonly transactionService: TransactionService,
    private readonly analyticsService: AnalyticsService,
    private readonly pendingRepo: IPendingConversationRepository,
    private readonly dashboardLink: DashboardLink,
    private readonly clock: Clock,
  ) {}

  async handle(chatId: number, text: string, senderName: string, origin: string): Promise<BotReply> {
    try {
      return { text: await this.route(chatId, text, senderName, origin) };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      console.error(`MessageHandler.handle failed: ${detail}`, error);
      return { text: GENERIC_ERROR };
    }
  }

  private async route(chatId: number, text: string, senderName: string, origin: string): Promise<string> {
    const user = await this.resolveUser(chatId, senderName);
    const today = this.clock.today(user.timezone);
    const command = commandOf(text);
    const pending = await this.pendingRepo.findActiveByUser(user.id, this.clock.now());

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
    if (command === "/status") return this.showStatus(user.id, today);
    if (command === "/dashboard") return this.showDashboard(user.id, origin);

    const draft = pending && isDraftState(pending.stateJson) ? pending.stateJson : null;
    let activePending = pending;
    if (pending && !draft) {
      await this.pendingRepo.delete(pending.id);
      activePending = null;
    }

    return this.runAgent(user, text, draft, activePending, today);
  }

  private async showStatus(userId: number, today: Date): Promise<string> {
    const report = await this.analyticsService.aggregate(userId, {
      group_by: "category",
      from: toIsoDate(firstOfMonth(today)),
      to: toIsoDate(today),
    });
    const month = monthLabel(today);

    if (report.rows.length === 0 || report.totalCents === 0) {
      return `📊 ${month}\n\nNenhum gasto registrado ainda neste mês.`;
    }

    const lines = report.rows.map((row) => {
      const pct = Math.round((row.amountCents / report.totalCents) * 100);
      return `• ${row.label} — ${formatReais(row.amountCents)} (${pct}%)`;
    });
    return (
      `📊 ${month} — gastos até hoje\n\n` +
      `Total: ${formatReais(report.totalCents)}\n\n` +
      `${lines.join("\n")}\n\n` +
      "📈 Detalhe e filtros: /dashboard"
    );
  }

  private async showDashboard(userId: number, origin: string): Promise<string> {
    const url = await this.dashboardLink.build(origin, userId);
    return `📊 Seu painel (link pessoal):\n${url}`;
  }

  private async resolveUser(chatId: number, name: string): Promise<User> {
    const existing = await this.userRepo.findByChatId(chatId);
    if (existing) return existing;
    return this.userRepo.create({ telegramChatId: chatId, name });
  }

  private async runAgent(
    user: User,
    text: string,
    draft: DraftState | null,
    pending: PendingConversation | null,
    today: Date,
  ): Promise<string> {
    const sanitized = sanitizeUserMessage(text);
    const categories = await this.categoryRepo.listByUser(user.id);

    const messages: LLMMessage[] = [
      ...(draft?.messages ?? []),
      { role: "user", content: sanitized },
    ];

    const turn = await this.agent.run(messages, {
      categories: categories.map((c) => c.name),
      today: toIsoDate(today),
    });

    if (turn.kind === "draft") {
      const isPlaceholder = isPlaceholderDescription(turn.draft.description);
      const category = isPlaceholder
        ? findFallbackCategory(categories)
        : resolveCategory(turn.draft.category_name, turn.draft.description, categories);
      if (!isPlaceholder && !category && categories.length > 0) {
        const question = categoryQuestion(categories);
        const thread: LLMMessage[] = [...messages, { role: "assistant", content: question }];
        return this.saveQuestion(user, pending, thread, (draft?.cycles ?? 0) + 1, question);
      }
      if (pending) await this.pendingRepo.delete(pending.id);
      return this.recordDraft(turn.draft, user.id, sanitized, today, category?.name);
    }

    if (turn.kind === "query") {
      if (pending) await this.pendingRepo.delete(pending.id);
      const report = await this.analyticsService.aggregate(user.id, turn.params);
      return formatSpendingReport(turn.params, report);
    }

    const thread: LLMMessage[] = [...messages, { role: "assistant", content: turn.text }];
    return this.saveQuestion(user, pending, thread, (draft?.cycles ?? 0) + 1, turn.text);
  }

  private async recordDraft(
    draft: TransactionDraft,
    userId: number,
    rawMessage: string,
    today: Date,
    categoryName: string | undefined,
  ): Promise<string> {
    const input: TransactionInput = {
      description: draft.description,
      amount_cents: draft.amount_cents,
      date: draft.date,
      category_name: categoryName,
      mantra: applyMantraRules(draft.description),
    };
    await this.transactionService.persist(input, userId, rawMessage, today);
    return this.formatConfirmation(input);
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
        expiresAt: new Date(this.clock.now().getTime() + DRAFT_TTL_MS),
      });
    }

    return cycles >= MAX_CYCLES ? question + CYCLE_PAUSE : question;
  }

  private formatConfirmation(input: TransactionInput): string {
    const amount = formatReais(input.amount_cents);
    const description = input.description.charAt(0).toUpperCase() + input.description.slice(1);
    const meta: string[] = [];
    if (input.category_name) meta.push(`📁 ${input.category_name}`);
    if (input.mantra) meta.push(`🎯 ${input.mantra}`);
    return `✅ ${description} — ${amount}${meta.length ? `\n${meta.join(" · ")}` : ""}`;
  }
}

function categoryQuestion(categories: Category[]): string {
  return `Em qual categoria isso entra? Escolha uma: ${categories.map((c) => c.name).join(", ")}.`;
}

function isPlaceholderDescription(description: string): boolean {
  return description.trim().toLowerCase() === PLACEHOLDER_DESCRIPTION;
}

function findFallbackCategory(categories: Category[]): Category | null {
  return categories.find((c) => c.name.toLowerCase() === FALLBACK_CATEGORY_NAME.toLowerCase()) ?? null;
}

function monthLabel(today: Date): string {
  const names = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
  ];
  return `${names[today.getUTCMonth()]}/${today.getUTCFullYear()}`;
}

function formatSpendingReport(params: QuerySpendingArgs, report: SpendingReport): string {
  const period = `${params.from} → ${params.to}`;
  const header = `📊 Gastos ${period}`;

  if (report.rows.length === 0 || report.totalCents === 0) {
    return `${header}\n\nNada encontrado nesse período.`;
  }
  if (params.group_by === "none") {
    return `${header}\n\nTotal: ${formatReais(report.totalCents)}`;
  }

  const lines = report.rows.map((row) => {
    const pct = Math.round((row.amountCents / report.totalCents) * 100);
    return `• ${row.label} — ${formatReais(row.amountCents)} (${pct}%)`;
  });
  return `${header}\n${lines.join("\n")}\n\nTotal: ${formatReais(report.totalCents)}`;
}

function commandOf(text: string): string {
  const first = text.trim().toLowerCase().split(/\s+/)[0] ?? "";
  return first.startsWith("/") ? first : "";
}

function isDraftState(value: unknown): value is DraftState {
  if (typeof value !== "object" || value === null) return false;
  const state = value as Record<string, unknown>;
  return (
    state.kind === "draft" &&
    typeof state.cycles === "number" &&
    Array.isArray(state.messages) &&
    state.messages.every(isLLMMessage)
  );
}

function isLLMMessage(value: unknown): value is LLMMessage {
  if (typeof value !== "object" || value === null) return false;
  const message = value as Record<string, unknown>;
  return (
    (message.role === "user" || message.role === "assistant" || message.role === "system") &&
    typeof message.content === "string"
  );
}
