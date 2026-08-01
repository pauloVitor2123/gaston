import type { ILLMClient, LLMMessage } from "@/types/llm";
import { RECORD_TRANSACTION_TOOL, transactionDraftSchema, type TransactionDraft } from "@/services/collection/draft";
import { buildCollectionSystemPrompt, type AgentContext } from "@/services/collection/prompts";
import type { PaymentTarget } from "@/services/payment/payment.service";
import {
  MARK_PAID_TOOL,
  UNDO_PAYMENT_TOOL,
  markPaidArgsSchema,
  undoPaymentArgsSchema,
} from "@/services/payment/tools";

export type AgentTurn =
  | { kind: "draft"; draft: TransactionDraft }
  | { kind: "pay"; target: PaymentTarget; amountCents?: number }
  | { kind: "undo"; eventId: number }
  | { kind: "question"; text: string };

const TOOLS = [RECORD_TRANSACTION_TOOL, MARK_PAID_TOOL, UNDO_PAYMENT_TOOL];
const FALLBACK_QUESTION = "Me conta o valor e o que foi, por favor.";

export class CollectionAgent {
  constructor(private readonly llm: ILLMClient) {}

  async run(messages: LLMMessage[], context: AgentContext): Promise<AgentTurn> {
    const system = buildCollectionSystemPrompt(context);
    const { toolCall, content } = await this.llm.callWithTools(messages, TOOLS, system);

    if (toolCall?.name === RECORD_TRANSACTION_TOOL.name) {
      const parsed = transactionDraftSchema.safeParse(toolCall.arguments);
      if (parsed.success) return { kind: "draft", draft: parsed.data };
    }

    if (toolCall?.name === MARK_PAID_TOOL.name) {
      const parsed = markPaidArgsSchema.safeParse(toolCall.arguments);
      if (parsed.success) {
        return {
          kind: "pay",
          target: { type: parsed.data.target_type, id: parsed.data.target_id },
          amountCents: parsed.data.amount_cents,
        };
      }
    }

    if (toolCall?.name === UNDO_PAYMENT_TOOL.name) {
      const parsed = undoPaymentArgsSchema.safeParse(toolCall.arguments);
      if (parsed.success) return { kind: "undo", eventId: parsed.data.event_id };
    }

    return { kind: "question", text: content?.trim() || FALLBACK_QUESTION };
  }
}
