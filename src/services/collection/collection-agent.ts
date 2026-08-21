import type { ILLMClient, LLMMessage } from "@/types/llm";
import { RECORD_TRANSACTION_TOOL, transactionDraftSchema, type TransactionDraft } from "@/services/collection/draft";
import { buildCollectionSystemPrompt, type AgentContext } from "@/services/collection/prompts";
import {
  QUERY_SPENDING_TOOL,
  querySpendingArgsSchema,
  type QuerySpendingArgs,
} from "@/services/analytics/query";

export type AgentTurn =
  | { kind: "drafts"; drafts: TransactionDraft[] }
  | { kind: "query"; params: QuerySpendingArgs }
  | { kind: "question"; text: string };

const TOOLS = [RECORD_TRANSACTION_TOOL, QUERY_SPENDING_TOOL];
const FALLBACK_QUESTION = "Me conta o valor e o que foi, por favor.";

export class CollectionAgent {
  constructor(private readonly llm: ILLMClient) {}

  async run(messages: LLMMessage[], context: AgentContext): Promise<AgentTurn> {
    const system = buildCollectionSystemPrompt(context);
    const { toolCalls, content } = await this.llm.callWithTools(messages, TOOLS, system);
    const calls = toolCalls ?? [];

    const drafts = calls
      .filter((call) => call.name === RECORD_TRANSACTION_TOOL.name)
      .map((call) => transactionDraftSchema.safeParse(call.arguments))
      .flatMap((parsed) => (parsed.success ? [parsed.data] : []));
    if (drafts.length > 0) return { kind: "drafts", drafts };

    const query = calls.find((call) => call.name === QUERY_SPENDING_TOOL.name);
    if (query) {
      const parsed = querySpendingArgsSchema.safeParse(query.arguments);
      if (parsed.success) return { kind: "query", params: parsed.data };
    }

    return { kind: "question", text: content?.trim() || FALLBACK_QUESTION };
  }
}
