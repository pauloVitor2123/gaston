import type { ILLMClient, LLMMessage } from "@/types/llm";
import { RECORD_TRANSACTION_TOOL, transactionDraftSchema, type TransactionDraft } from "@/services/collection/draft";
import { buildCollectionSystemPrompt, type AgentContext } from "@/services/collection/prompts";
import {
  QUERY_SPENDING_TOOL,
  querySpendingArgsSchema,
  type QuerySpendingArgs,
} from "@/services/analytics/query";

export type AgentTurn =
  | { kind: "draft"; draft: TransactionDraft }
  | { kind: "query"; params: QuerySpendingArgs }
  | { kind: "question"; text: string };

const TOOLS = [RECORD_TRANSACTION_TOOL, QUERY_SPENDING_TOOL];
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

    if (toolCall?.name === QUERY_SPENDING_TOOL.name) {
      const parsed = querySpendingArgsSchema.safeParse(toolCall.arguments);
      if (parsed.success) return { kind: "query", params: parsed.data };
    }

    return { kind: "question", text: content?.trim() || FALLBACK_QUESTION };
  }
}
