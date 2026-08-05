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
import {
  DELETE_RECURRING_BILL_TOOL,
  RECORD_RECURRING_BILL_TOOL,
  deleteRecurringBillArgsSchema,
  recordRecurringBillArgsSchema,
  type RecordRecurringBillArgs,
} from "@/services/recurring/tools";
import {
  RECORD_INSTALLMENT_TOOL,
  recordInstallmentArgsSchema,
  type RecordInstallmentArgs,
} from "@/services/installment/tools";
import {
  QUERY_SPENDING_TOOL,
  querySpendingArgsSchema,
  type QuerySpendingArgs,
} from "@/services/analytics/query";
import { SET_BALANCE_TOOL, setBalanceArgsSchema } from "@/services/balance/tools";

export type AgentTurn =
  | { kind: "draft"; draft: TransactionDraft }
  | { kind: "pay"; target: PaymentTarget; amountCents?: number }
  | { kind: "undo"; eventId: number }
  | { kind: "recurring"; bill: RecordRecurringBillArgs }
  | { kind: "delete_recurring"; billId: number }
  | { kind: "installment"; purchase: RecordInstallmentArgs }
  | { kind: "query"; params: QuerySpendingArgs }
  | { kind: "set_balance"; amountCents: number }
  | { kind: "question"; text: string };

const TOOLS = [
  RECORD_TRANSACTION_TOOL,
  MARK_PAID_TOOL,
  UNDO_PAYMENT_TOOL,
  RECORD_RECURRING_BILL_TOOL,
  DELETE_RECURRING_BILL_TOOL,
  RECORD_INSTALLMENT_TOOL,
  QUERY_SPENDING_TOOL,
  SET_BALANCE_TOOL,
];
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

    if (toolCall?.name === RECORD_RECURRING_BILL_TOOL.name) {
      const parsed = recordRecurringBillArgsSchema.safeParse(toolCall.arguments);
      if (parsed.success) return { kind: "recurring", bill: parsed.data };
    }

    if (toolCall?.name === DELETE_RECURRING_BILL_TOOL.name) {
      const parsed = deleteRecurringBillArgsSchema.safeParse(toolCall.arguments);
      if (parsed.success) return { kind: "delete_recurring", billId: parsed.data.bill_id };
    }

    if (toolCall?.name === RECORD_INSTALLMENT_TOOL.name) {
      const parsed = recordInstallmentArgsSchema.safeParse(toolCall.arguments);
      if (parsed.success) return { kind: "installment", purchase: parsed.data };
    }

    if (toolCall?.name === QUERY_SPENDING_TOOL.name) {
      const parsed = querySpendingArgsSchema.safeParse(toolCall.arguments);
      if (parsed.success) return { kind: "query", params: parsed.data };
    }

    if (toolCall?.name === SET_BALANCE_TOOL.name) {
      const parsed = setBalanceArgsSchema.safeParse(toolCall.arguments);
      if (parsed.success) return { kind: "set_balance", amountCents: parsed.data.amount_cents };
    }

    return { kind: "question", text: content?.trim() || FALLBACK_QUESTION };
  }
}
