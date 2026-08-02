import { drizzle } from "drizzle-orm/d1";
import { buildLLMConfigs, type LLMEnv } from "@/config";
import type { ILLMClient, LLMClientConfig } from "@/types/llm";
import { OpenAICompatibleClient } from "@/services/llm/openai-compatible-client";
import { LLMProvider } from "@/services/llm/llm-provider";
import { CollectionAgent } from "@/services/collection/collection-agent";
import { TransactionService } from "@/services/transaction/transaction.service";
import { PaymentService } from "@/services/payment/payment.service";
import { RecurringBillService } from "@/services/recurring/recurring-bill.service";
import { InstallmentService } from "@/services/installment/installment.service";
import { PaymentEventRepository } from "@/repositories/payment-event.repository";
import { RecurringBillRepository } from "@/repositories/recurring-bill.repository";
import { InstallmentPurchaseRepository } from "@/repositories/installment-purchase.repository";
import { MessageHandler } from "@/handlers/message.handler";
import { UserRepository } from "@/repositories/user.repository";
import { CategoryRepository } from "@/repositories/category.repository";
import { CardRepository } from "@/repositories/card.repository";
import { MantraRepository } from "@/repositories/mantra.repository";
import { TransactionRepository } from "@/repositories/transaction.repository";
import { CardInvoiceRepository } from "@/repositories/card-invoice.repository";
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

  const llm = buildProvider(llmConfigs.primary, llmConfigs.fallback);

  const categoryRepo = new CategoryRepository(db);
  const cardRepo = new CardRepository(db);
  const mantraRepo = new MantraRepository(db);
  const transactionRepo = new TransactionRepository(db);
  const cardInvoiceRepo = new CardInvoiceRepository(db);
  const recurringBillRepo = new RecurringBillRepository(db);

  const agent = new CollectionAgent(llm);
  const transactionService = new TransactionService(
    categoryRepo,
    cardRepo,
    mantraRepo,
    transactionRepo,
    cardInvoiceRepo,
  );
  const paymentService = new PaymentService(
    transactionRepo,
    cardInvoiceRepo,
    new PaymentEventRepository(db),
    recurringBillRepo,
  );
  const recurringService = new RecurringBillService(
    categoryRepo,
    mantraRepo,
    recurringBillRepo,
    transactionRepo,
  );
  const installmentService = new InstallmentService(
    categoryRepo,
    cardRepo,
    mantraRepo,
    new InstallmentPurchaseRepository(db),
    transactionRepo,
    cardInvoiceRepo,
  );

  return new MessageHandler(
    new UserRepository(db),
    categoryRepo,
    cardRepo,
    agent,
    transactionService,
    paymentService,
    recurringService,
    installmentService,
    new PendingConversationRepository(db),
  );
}
