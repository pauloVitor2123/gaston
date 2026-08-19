import { drizzle } from "drizzle-orm/d1";
import { buildLLMConfigs, type LLMEnv } from "@/config";
import type { ILLMClient, LLMClientConfig } from "@/types/llm";
import { OpenAICompatibleClient } from "@/services/llm/openai-compatible-client";
import { LLMProvider } from "@/services/llm/llm-provider";
import { CollectionAgent } from "@/services/collection/collection-agent";
import { SystemClock } from "@/services/clock";
import { TransactionService } from "@/services/transaction/transaction.service";
import { AnalyticsService } from "@/services/analytics/analytics.service";
import { DashboardLink } from "@/services/dashboard/token";
import { MessageHandler } from "@/handlers/message.handler";
import { UserRepository } from "@/repositories/user.repository";
import { CategoryRepository } from "@/repositories/category.repository";
import { MantraRepository } from "@/repositories/mantra.repository";
import { TransactionRepository } from "@/repositories/transaction.repository";
import { SpendingRepository } from "@/repositories/spending.repository";
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

  const agent = new CollectionAgent(llm);
  const transactionService = new TransactionService(categoryRepo, mantraRepo, transactionRepo, clock);
  const analyticsService = new AnalyticsService(new SpendingRepository(db));

  return new MessageHandler(
    userRepo,
    categoryRepo,
    agent,
    transactionService,
    analyticsService,
    new PendingConversationRepository(db),
    new DashboardLink(env.DASHBOARD_SECRET, clock),
    clock,
  );
}
