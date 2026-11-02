import type {
  ICategoryRepository,
  IPendingConversationRepository,
  IPlatformRepository,
  IUserRepository,
  IWorkLogRepository,
} from "@/types/repository";
import type { LLMMessage } from "@/types/llm";
import type { CollectionAgent } from "@/services/collection/collection-agent";
import {
  type IncomeDraft,
  PLACEHOLDER_DESCRIPTION,
  type TransactionDraft,
  type WorkLogDraft,
} from "@/services/collection/draft";
import type {
  IncomeInput,
  TransactionService,
  TransactionInput,
} from "@/services/transaction/transaction.service";
import type { UndoOutcome, UndoService } from "@/services/undo/undo.service";
import type { WeeklyReportService } from "@/services/metrics/weekly-report.service";
import type { WorkLogEntry } from "@/services/metrics/weekly-summary";
import { formatWeekSummary, formatWorkLog } from "@/services/metrics/format";
import { parseUtcDate, startOfWeek, toIsoDate } from "@/services/dates";
import type { Clock } from "@/services/clock";
import type { Category, PendingConversation, Platform, User } from "@/db/schema";
import { canonicalizePlatform } from "@/services/collection/platform-rules";
import { sanitizeUserMessage } from "@/services/collection/sanitize";
import { applyMantraRules } from "@/services/collection/mantra-rules";
import {
  type CategoryResolution,
  canonicalizeSubcategory,
  isTopLevel,
  resolveCategoryTree,
} from "@/services/collection/category-rules";
import type { AnalyticsService, SpendingReport } from "@/services/analytics/analytics.service";
import type { QuerySpendingArgs } from "@/services/analytics/query";
import type { DashboardLink } from "@/services/dashboard/token";
import { formatReais } from "@/services/money";
import type { BotReply, ReplyAction } from "@/handlers/reply";

type DraftState = { kind: "draft"; messages: LLMMessage[]; cycles: number };

const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_CYCLES = 3;
const MAX_THREAD_MESSAGES = 12;
const MAX_BATCH_ITEMS = 10;
const FALLBACK_CATEGORY_NAME = "Outros";

const EXAMPLES =
  '• "gastei 90 de gnv"\n' +
  '• "recebi 280 da uber"\n' +
  '• "rodei 230km, 10h online, 22 corridas"\n' +
  '• "almoço 30 e recebi 300 da 99"\n' +
  '• "quanto ganhei essa semana?"';

const ONBOARDING =
  "Oi! Sou o Gaston, o caixa do seu dia de motorista 🚗💸\n\n" +
  "Me conte o que gastou e o que recebeu em linguagem natural, por exemplo:\n" +
  EXAMPLES +
  "\n\nMande /help pra ver tudo que eu faço.";

const HELP =
  "🐷 Gaston — o que eu faço\n\n" +
  "É só me escrever seus gastos e receitas naturalmente:\n" +
  EXAMPLES +
  "\n\nToda confirmação vem com um botão ↩️ Desfazer, caso algo saia errado.\n\nComandos:\n" +
  "/status — resumo da semana: receita, gastos, lucro, R$/hora, R$/km\n" +
  "/dashboard — link do painel com gráficos e filtros\n" +
  "/cancelar — abandona um registro em andamento\n" +
  "/help — mostra esta ajuda";

const GENERIC_ERROR =
  "Tive um problema para processar isso agora 😕. Pode tentar de novo em instantes?";

const CYCLE_PAUSE =
  "\n\nVou deixar esse registro guardado por aqui. Quando quiser continuar, é só me mandar o que falta. 👍";

const UNDO_PREFIX = "undo:";
const UNDO_LABEL = "↩️ Desfazer";

const UNDO_MESSAGES: Record<UndoOutcome, string> = {
  undone: "↩️ Desfeito — isso não conta mais nos totais.",
  already_undone: "↩️ Isso já tinha sido desfeito.",
  not_found: "Não encontrei esse registro para desfazer.",
};

type RecordedIncome = IncomeInput & { label: string };

type BatchItems = { drafts: TransactionDraft[]; incomes: IncomeDraft[]; workLogs: WorkLogDraft[] };

export class MessageHandler {
  constructor(
    private readonly userRepo: IUserRepository,
    private readonly categoryRepo: ICategoryRepository,
    private readonly platformRepo: IPlatformRepository,
    private readonly workLogRepo: IWorkLogRepository,
    private readonly agent: CollectionAgent,
    private readonly transactionService: TransactionService,
    private readonly undoService: UndoService,
    private readonly analyticsService: AnalyticsService,
    private readonly weeklyReport: WeeklyReportService,
    private readonly pendingRepo: IPendingConversationRepository,
    private readonly dashboardLink: DashboardLink,
    private readonly clock: Clock,
    private readonly newBatchId: () => string = () => crypto.randomUUID(),
  ) {}

  async handle(chatId: number, text: string, senderName: string, origin: string): Promise<BotReply> {
    try {
      const reply = await this.route(chatId, text, senderName, origin);
      return typeof reply === "string" ? { text: reply } : reply;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      console.error(`MessageHandler.handle failed: ${detail}`, error);
      return { text: GENERIC_ERROR };
    }
  }

  async handleCallback(chatId: number, data: string): Promise<BotReply | null> {
    if (!data.startsWith(UNDO_PREFIX)) return null;
    try {
      const user = await this.userRepo.findByChatId(chatId);
      if (!user) return { text: UNDO_MESSAGES.not_found };
      const outcome = await this.undoService.undo(user.id, data.slice(UNDO_PREFIX.length));
      return { text: UNDO_MESSAGES[outcome] };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      console.error(`MessageHandler.handleCallback failed: ${detail}`, error);
      return { text: GENERIC_ERROR };
    }
  }

  private async route(chatId: number, text: string, senderName: string, origin: string): Promise<BotReply | string> {
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
    return formatWeekSummary(await this.weeklyReport.summarize(userId, today));
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
  ): Promise<BotReply | string> {
    const sanitized = sanitizeUserMessage(text);
    const [categories, platforms] = await Promise.all([
      this.categoryRepo.listByUser(user.id),
      this.platformRepo.listByUser(user.id),
    ]);

    const messages: LLMMessage[] = [
      ...(draft?.messages ?? []),
      { role: "user", content: sanitized },
    ];

    const turn = await this.agent.run(messages, {
      categories: topLevelCategories(categories).map((c) => ({
        name: c.name,
        subcategories: categories.filter((s) => s.parentId === c.id).map((s) => s.name),
      })),
      platforms: platforms.map((p) => p.name),
      today: toIsoDate(today),
    });

    if (turn.kind === "drafts") {
      if (turn.drafts.length === 1 && turn.incomes.length === 0 && turn.workLogs.length === 0) {
        const single = turn.drafts[0]!;
        if (isPlaceholderDescription(single.description)) {
          if (pending) await this.pendingRepo.delete(pending.id);
          return this.recordDraft(single, user.id, sanitized, today, findFallbackCategory(categories), null);
        }
        const resolution = resolveCategoryTree(single.category_name, single.description, categories);
        if (!resolution && categories.length > 0) {
          const question = categoryQuestion(topLevelCategories(categories));
          const thread: LLMMessage[] = [...messages, { role: "assistant", content: question }];
          return this.saveQuestion(user, pending, thread, (draft?.cycles ?? 0) + 1, question);
        }
        const subcategory = resolution
          ? await this.resolveSubcategory(resolution, single, user.id, categories)
          : null;
        if (pending) await this.pendingRepo.delete(pending.id);
        return this.recordDraft(single, user.id, sanitized, today, resolution?.category ?? null, subcategory);
      }
      if (pending) await this.pendingRepo.delete(pending.id);
      return this.recordBatch(turn, user.id, sanitized, today, categories, platforms);
    }

    if (turn.kind === "query") {
      if (pending) await this.pendingRepo.delete(pending.id);
      if (turn.params.subject === "productivity") {
        return formatWeekSummary(await this.weeklyReport.summarize(user.id, parseUtcDate(turn.params.from)));
      }
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
    category: Category | null,
    subcategory: Category | null,
  ): Promise<BotReply> {
    const input = toTransactionInput(draft, category, subcategory);
    const batchId = this.newBatchId();
    await this.transactionService.persist(input, userId, rawMessage, today, batchId);
    return { text: this.formatConfirmation(input), actions: [undoAction(batchId)] };
  }

  private async resolveBatchItem(
    draft: TransactionDraft,
    userId: number,
    categories: Category[],
  ): Promise<{ category: Category | null; subcategory: Category | null }> {
    if (isPlaceholderDescription(draft.description)) {
      return { category: findFallbackCategory(categories), subcategory: null };
    }
    const resolution = resolveCategoryTree(draft.category_name, draft.description, categories);
    if (!resolution) return { category: findFallbackCategory(categories), subcategory: null };
    const subcategory = await this.resolveSubcategory(resolution, draft, userId, categories);
    return { category: resolution.category, subcategory };
  }

  private async resolveSubcategory(
    resolution: CategoryResolution,
    draft: TransactionDraft,
    userId: number,
    categories: Category[],
  ): Promise<Category | null> {
    if (resolution.subcategory) return resolution.subcategory;
    const match = canonicalizeSubcategory(draft.subcategory_name, resolution.category, categories);
    if (match.kind === "existing") return match.subcategory;
    if (match.kind === "new" && isTopLevel(resolution.category)) {
      return this.categoryRepo.create({
        userId,
        name: match.name,
        parentId: resolution.category.id,
        synonyms: [],
      });
    }
    return null;
  }

  private async resolvePlatform(
    draft: IncomeDraft,
    userId: number,
    platforms: Platform[],
  ): Promise<Platform | null> {
    const match = canonicalizePlatform(draft.platform_name, platforms);
    if (match.kind === "existing") return match.platform;
    if (match.kind === "none") return null;
    const created = await this.platformRepo.create({ userId, name: match.name, synonyms: [] });
    platforms.push(created);
    return created;
  }

  private async recordBatch(
    items: BatchItems,
    userId: number,
    rawMessage: string,
    today: Date,
    categories: Category[],
    platforms: Platform[],
  ): Promise<BotReply> {
    const cappedDrafts = items.drafts.slice(0, MAX_BATCH_ITEMS);
    const cappedIncomes = items.incomes.slice(0, MAX_BATCH_ITEMS - cappedDrafts.length);
    const cappedLogs = items.workLogs.slice(0, MAX_BATCH_ITEMS - cappedDrafts.length - cappedIncomes.length);
    const excess =
      items.drafts.length + items.incomes.length + items.workLogs.length -
      cappedDrafts.length - cappedIncomes.length - cappedLogs.length;
    const batchId = this.newBatchId();
    const recorded: TransactionInput[] = [];
    const incomes: RecordedIncome[] = [];
    const workLogs: WorkLogEntry[] = [];
    const failed: string[] = [];

    for (const draft of cappedDrafts) {
      const { category, subcategory } = await this.resolveBatchItem(draft, userId, categories);
      const input = toTransactionInput(draft, category, subcategory);
      try {
        await this.transactionService.persist(input, userId, rawMessage, today, batchId);
        recorded.push(input);
      } catch (error) {
        logBatchFailure(error);
        failed.push(capitalize(input.description));
      }
    }

    for (const draft of cappedIncomes) {
      const label = incomeLabel(draft.platform_name);
      try {
        const platform = await this.resolvePlatform(draft, userId, platforms);
        const input: IncomeInput = {
          amount_cents: draft.amount_cents,
          date: draft.date,
          platform_id: platform?.id,
          platform_name: platform?.name,
        };
        await this.transactionService.persistIncome(input, userId, rawMessage, today, batchId);
        incomes.push({ ...input, label: incomeLabel(platform?.name) });
      } catch (error) {
        logBatchFailure(error);
        failed.push(label);
      }
    }

    for (const draft of cappedLogs) {
      const entry = toWorkLogEntry(draft, today);
      try {
        await this.workLogRepo.create({ userId, ...entry, batchId, rawMessage });
        workLogs.push(entry);
      } catch (error) {
        logBatchFailure(error);
        failed.push("jornada");
      }
    }

    const text = this.formatBatchConfirmation(recorded, incomes, workLogs, failed, excess);
    const anyRecorded = recorded.length + incomes.length + workLogs.length > 0;
    return anyRecorded ? { text, actions: [undoAction(batchId)] } : { text };
  }

  private formatBatchConfirmation(
    recorded: TransactionInput[],
    incomes: RecordedIncome[],
    workLogs: WorkLogEntry[],
    failed: string[],
    excess: number,
  ): string {
    if (recorded.length + incomes.length + workLogs.length === 0) {
      return "Não consegui registrar isso agora 😕. Pode tentar de novo em instantes?";
    }
    const clean = failed.length === 0 && excess === 0;
    if (clean && recorded.length === 0 && workLogs.length === 0 && incomes.length === 1) {
      const income = incomes[0]!;
      return `💰 ${income.label} — ${formatReais(income.amount_cents)}`;
    }

    const lines: string[] = [];
    if (recorded.length > 0) {
      const total = recorded.reduce((sum, input) => sum + input.amount_cents, 0);
      const noun = recorded.length === 1 ? "gasto registrado" : "gastos registrados";
      lines.push(`✅ ${recorded.length} ${noun} — ${formatReais(total)}`);
      for (const input of recorded) {
        const description = capitalize(input.description);
        const category = input.category_name ? ` · 📁 ${input.category_name}` : "";
        lines.push(`• ${description} — ${formatReais(input.amount_cents)}${category}`);
      }
    }
    if (incomes.length > 0) {
      const total = incomes.reduce((sum, income) => sum + income.amount_cents, 0);
      const noun = incomes.length === 1 ? "receita registrada" : "receitas registradas";
      lines.push(`💰 ${incomes.length} ${noun} — ${formatReais(total)}`);
      for (const income of incomes) {
        lines.push(`• ${income.label} — ${formatReais(income.amount_cents)}`);
      }
    }
    for (const log of workLogs) lines.push(formatWorkLog(log));
    if (failed.length > 0) {
      lines.push(`⚠️ Não consegui registrar ${failed.length}: ${failed.join(", ")}`);
    }
    if (excess > 0) {
      lines.push(`⚠️ Ignorei ${excess} além do limite de ${MAX_BATCH_ITEMS} por mensagem.`);
    }
    return lines.join("\n");
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
    const description = capitalize(input.description);
    const meta: string[] = [];
    if (input.category_name) {
      const label = input.subcategory_name
        ? `${input.category_name} › ${input.subcategory_name}`
        : input.category_name;
      meta.push(`📁 ${label}`);
    }
    return `✅ ${description} — ${amount}${meta.length ? `\n${meta.join(" · ")}` : ""}`;
  }
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function undoAction(batchId: string): ReplyAction {
  return { id: `${UNDO_PREFIX}${batchId}`, label: UNDO_LABEL };
}

function incomeLabel(platformName: string | undefined): string {
  return platformName ? `Receita ${platformName}` : "Receita";
}

function logBatchFailure(error: unknown): void {
  const detail = error instanceof Error ? error.message : String(error);
  console.error(`MessageHandler.recordBatch persist failed: ${detail}`, error);
}

function toTransactionInput(
  draft: TransactionDraft,
  category: Category | null,
  subcategory: Category | null,
): TransactionInput {
  return {
    description: draft.description,
    amount_cents: draft.amount_cents,
    date: draft.date,
    category_name: category?.name,
    subcategory_id: subcategory?.id,
    subcategory_name: subcategory?.name,
    mantra: applyMantraRules(draft.description),
  };
}

function topLevelCategories(categories: Category[]): Category[] {
  return categories.filter((c) => c.parentId === null);
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

function toWorkLogEntry(draft: WorkLogDraft, today: Date): WorkLogEntry {
  const day = draft.date ? parseUtcDate(draft.date) : today;
  const period = draft.period ?? "day";
  return {
    period,
    periodStart: period === "week" ? startOfWeek(day) : day,
    km: draft.km ?? null,
    onlineMinutes: draft.online_minutes ?? null,
    rides: draft.rides ?? null,
  };
}

function formatSpendingReport(params: QuerySpendingArgs, report: SpendingReport): string {
  const period = `${params.from} → ${params.to}`;
  const header = params.subject === "income" ? `💰 Receitas ${period}` : `📊 Gastos ${period}`;

  if (report.rows.length === 0 || report.totalCents === 0) {
    return `${header}\n\nNada encontrado nesse período.`;
  }
  if (params.group_by === "none") {
    return `${header}\n\nTotal: ${formatReais(report.totalCents)}`;
  }

  const lines = report.rows.flatMap((row) => {
    const pct = Math.round((row.amountCents / report.totalCents) * 100);
    const head = `• ${row.label} — ${formatReais(row.amountCents)} (${pct}%)`;
    const subs = (row.subcategories ?? []).map(
      (sub) => `   ↳ ${sub.label} — ${formatReais(sub.amountCents)}`,
    );
    return [head, ...subs];
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
