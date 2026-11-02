import { drizzle } from "drizzle-orm/d1";
import { buildLLMConfigs, type LLMEnv } from "@/config";
import type { ILLMClient, LLMClientConfig } from "@/types/llm";
import { OpenAICompatibleClient } from "@/services/llm/openai-compatible-client";
import { LLMProvider } from "@/services/llm/llm-provider";
import { CollectionAgent } from "@/services/collection/collection-agent";
import { SystemClock } from "@/services/clock";
import { TransactionService } from "@/services/transaction/transaction.service";
import { AnalyticsService } from "@/services/analytics/analytics.service";
import { WeeklyReportService } from "@/services/metrics/weekly-report.service";
import { UndoService } from "@/services/undo/undo.service";
import { DashboardLink } from "@/services/dashboard/token";
import { MessageHandler } from "@/handlers/message.handler";
import { UserRepository } from "@/repositories/user.repository";
import { CategoryRepository } from "@/repositories/category.repository";
import { MantraRepository } from "@/repositories/mantra.repository";
import { PlatformRepository } from "@/repositories/platform.repository";
import { TransactionRepository } from "@/repositories/transaction.repository";
import { SpendingRepository } from "@/repositories/spending.repository";
import { WorkLogRepository } from "@/repositories/work-log.repository";
import { PendingConversationRepository } from "@/repositories/pending-conversation.repository";

const noopMetrics = { logAttempt: () => {} };

function buildProvider(primary: LLMClientConfig, fallback: LLMClientConfig): ILLMClient {
  return new LLMProvider(
    [new OpenAICompatibleClient(primary), new OpenAICompatibleClient(fallback)],
    noopMetrics,
  );
}

export function buildMessageHandler(env: LLMEnv & { DB: D1Database }): MessageHandler {
  const db = drizzle(env.DB);
  const llmConfigs = buildLLMConfigs(env);
  const clock = new SystemClock();

  const llm = buildProvider(llmConfigs.primary, llmConfigs.fallback);

  const userRepo = new UserRepository(db);
  const categoryRepo = new CategoryRepository(db);
  const mantraRepo = new MantraRepository(db);
  const transactionRepo = new TransactionRepository(db);
  const spendingRepo = new SpendingRepository(db);
  const workLogRepo = new WorkLogRepository(db);

  const agent = new CollectionAgent(llm);
  const transactionService = new TransactionService(categoryRepo, mantraRepo, transactionRepo, clock);

  return new MessageHandler(
    userRepo,
    categoryRepo,
    new PlatformRepository(db),
    workLogRepo,
    agent,
    transactionService,
    new UndoService(transactionRepo, workLogRepo),
    new AnalyticsService(spendingRepo),
    new WeeklyReportService(spendingRepo, workLogRepo),
    new PendingConversationRepository(db),
    new DashboardLink(env.DASHBOARD_SECRET, clock),
    clock,
  );
}
