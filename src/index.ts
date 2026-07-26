import { Bot, webhookCallback } from "grammy";
import { drizzle } from "drizzle-orm/d1";
import { buildLLMConfigs } from "@/config";
import { OpenAICompatibleClient } from "@/services/llm/openai-compatible-client";
import { LLMProvider } from "@/services/llm/llm-provider";
import { ExtractionService } from "@/services/extraction/extraction";
import { TransactionService } from "@/services/transaction/transaction.service";
import { MessageHandler } from "@/handlers/message.handler";
import { UserRepository } from "@/repositories/user.repository";
import { CategoryRepository } from "@/repositories/category.repository";
import { CardRepository } from "@/repositories/card.repository";
import { MantraRepository } from "@/repositories/mantra.repository";
import { TransactionRepository } from "@/repositories/transaction.repository";
import { CardInvoiceRepository } from "@/repositories/card-invoice.repository";
import { PendingConversationRepository } from "@/repositories/pending-conversation.repository";

type AppEnv = Env & {
  TELEGRAM_BOT_TOKEN: string;
  OPENROUTER_API_KEY: string;
  OPENAI_API_KEY: string;
};

export default {
  async fetch(request: Request, env: AppEnv, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return Response.json({ status: "ok", service: "gaston", time: new Date().toISOString() });
    }

    const db = drizzle(env.DB);
    const llmConfigs = buildLLMConfigs(env);

    const noopMetrics = { logAttempt: () => {} };
    const llm1 = new LLMProvider(
      [
        new OpenAICompatibleClient(llmConfigs.llm1),
        new OpenAICompatibleClient(llmConfigs.fallback),
      ],
      noopMetrics,
    );
    const llm2 = new LLMProvider(
      [
        new OpenAICompatibleClient(llmConfigs.llm2),
        new OpenAICompatibleClient(llmConfigs.fallback),
      ],
      noopMetrics,
    );

    const userRepo = new UserRepository(db);
    const categoryRepo = new CategoryRepository(db);
    const cardRepo = new CardRepository(db);
    const mantraRepo = new MantraRepository(db);
    const transactionRepo = new TransactionRepository(db);
    const cardInvoiceRepo = new CardInvoiceRepository(db);
    const pendingRepo = new PendingConversationRepository(db);

    const extraction = new ExtractionService(llm1, llm2);
    const transactionService = new TransactionService(
      categoryRepo,
      cardRepo,
      mantraRepo,
      transactionRepo,
      cardInvoiceRepo,
    );
    const messageHandler = new MessageHandler(
      userRepo,
      categoryRepo,
      cardRepo,
      extraction,
      transactionService,
      pendingRepo,
    );

    const bot = new Bot(env.TELEGRAM_BOT_TOKEN);

    bot.on("message:text", async (ctx) => {
      const chatId = ctx.chat.id;
      const text = ctx.message.text;
      const name = ctx.from?.first_name ?? "Usuário";
      const reply = await messageHandler.handle(chatId, text, name);
      await ctx.reply(reply);
    });

    return webhookCallback(bot, "cloudflare-mod")(request);
  },
} satisfies ExportedHandler<AppEnv>;
